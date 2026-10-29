import { decimalMoney } from './domain';
import { AppError } from './extraction';
import { type Store, type AnyStoredOrder as StoredOrder, lockedStatuses } from './store';

const HOST = 'https://api-m.sandbox.paypal.com';
type PayPalCapture = { id?: string; status?: string; amount?: { value?: string; currency_code?: string } };
export type PayPalOrder = { id?: string; status?: string; links?: { rel: string; href: string }[]; purchase_units?: { custom_id?: string; reference_id?: string; amount?: { value?: string; currency_code?: string }; payments?: { captures?: PayPalCapture[] } }[] };
export class PayPalClient {
  constructor(private fetcher: typeof fetch = fetch) {}
  async call(path: string, method = 'GET', body?: unknown, requestId?: string): Promise<PayPalOrder> {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new AppError(503, 'PAYPAL_NOT_CONFIGURED', 'Set your Sandbox client ID and secret before testing PayPal.');
    const auth = await this.fetcher(`${HOST}/v1/oauth2/token`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    if (!auth.ok) throw new AppError(502, 'PAYPAL_AUTH', 'PayPal Sandbox authentication failed. Check the local credentials.');
    const token = await auth.json();
    if (typeof token.access_token !== 'string') throw new AppError(502, 'PAYPAL_AUTH', 'PayPal Sandbox returned an invalid authentication response.');
    const response = await this.fetcher(`${HOST}${path}`, { method, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new AppError(502, 'PAYPAL_REQUEST', 'PayPal could not confirm this request. Check payment status before trying another payment.');
    return response.json();
  }
  create(order: StoredOrder) {
    const base = process.env.APP_URL || 'http://127.0.0.1:3000';
    const items = order.items.map(item => ({ name: item.name, sku: item.id, quantity: String(item.quantity), unit_amount: { currency_code: 'HKD', value: decimalMoney(item.priceCents) }, category: 'PHYSICAL_GOODS' }));
    return this.call('/v2/checkout/orders', 'POST', { intent: 'CAPTURE', purchase_units: [{ reference_id: order.id, custom_id: order.id, items, amount: { currency_code: 'HKD', value: decimalMoney(order.allocation.totalCents), breakdown: { item_total: { currency_code: 'HKD', value: decimalMoney(order.allocation.subtotalCents) }, shipping: { currency_code: 'HKD', value: decimalMoney(order.allocation.deliveryCents) } } } }], payment_source: { paypal: { experience_context: { brand_name: 'GroupTable demo', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', return_url: `${base}/?order=${order.id}&paypal=return`, cancel_url: `${base}/?order=${order.id}&paypal=cancel` } } } }, order.createRequestId);
  }
  capture(order: StoredOrder) { return this.call(`/v2/checkout/orders/${encodeURIComponent(order.paypalId!)}/capture`, 'POST', {}, order.captureRequestId); }
  get(order: StoredOrder) { return this.call(`/v2/checkout/orders/${encodeURIComponent(order.paypalId!)}`); }
}

function checkAmounts(order: StoredOrder, remote: PayPalOrder) {
  const units = remote.purchase_units;
  if (remote.id !== order.paypalId || units?.length !== 1 || units[0].custom_id !== order.id || units[0].reference_id !== order.id) throw new AppError(409, 'PAYMENT_MISMATCH', 'The payment does not match this order. Do not pay again; check the Sandbox dashboard.');
  const amount = units[0].amount;
  if (amount && (amount.currency_code !== 'HKD' || amount.value !== decimalMoney(order.allocation.totalCents))) throw new AppError(409, 'PAYMENT_MISMATCH', 'The payment amount does not match the approved order.');
  const captures = units[0].payments?.captures ?? [];
  if (captures.length > 1) throw new AppError(409, 'PAYMENT_MISMATCH', 'Unexpected multiple captures. Check the Sandbox dashboard.');
  for (const capture of captures) if (capture.amount?.currency_code !== 'HKD' || capture.amount.value !== decimalMoney(order.allocation.totalCents)) throw new AppError(409, 'PAYMENT_MISMATCH', 'The captured amount does not match the approved order.');
  return captures;
}
export function reconcile(store: Store, order: StoredOrder, remote: PayPalOrder) {
  return store.transaction(() => {
    const current = store.get(order.id, order.owner);
    // A status read started before capture cannot describe the newer payment attempt.
    if (current.status === 'stale' || current.status === 'paid' || current.captureSubmitted !== order.captureSubmitted) return current;
    const captures = checkAmounts(current, remote);
    const completed = captures.find(c => c.status === 'COMPLETED');
    if (remote.status === 'COMPLETED' && completed?.id) { current.status = 'paid'; current.captureId = completed.id; }
    else if (captures.some(c => c.status === 'PENDING')) current.status = 'pending';
    else if (['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED'].includes(remote.status || '') && !captures.length && !current.captureSubmitted) current.status = 'awaiting_approval';
    else current.status = 'unknown';
    store.save(current); return current;
  });
}

function markUnknown(store: Store, order: StoredOrder) {
  store.transaction(() => {
    const current = store.get(order.id, order.owner);
    if (current.status !== order.status || current.captureSubmitted !== order.captureSubmitted) return;
    current.status = 'unknown'; store.save(current);
  });
}

export class Payments {
  constructor(private store: Store, private client = new PayPalClient()) {}
  async create(id: string, owner: string) {
    const prepared = this.store.transaction(() => {
      const order = this.store.get(id, owner);
      if (order.status === 'awaiting_approval' && order.approvalUrl) return { order, reuse: true };
      const recovering = order.status === 'unknown' && !order.paypalId && Date.now() - Date.parse(order.createdAt) < 60 * 60 * 1000;
      if (order.status !== 'ready' && !recovering) throw new AppError(409, 'PAYMENT_LOCKED', 'This order cannot start another payment. Check its current status.');
      order.status = 'creating'; this.store.save(order); return { order, reuse: false };
    });
    const order = prepared.order;
    if (prepared.reuse) return { order, approvalUrl: order.approvalUrl! };
    try {
      if (order.mode === 'fixture') {
        order.paypalId = `SIMULATED-${order.id}`; order.approvalUrl = `/?order=${order.id}&simulated=approve`; order.status = 'awaiting_approval';
      } else {
        const remote = await this.client.create(order);
        const link = remote.links?.find(l => l.rel === 'payer-action' || l.rel === 'approve');
        if (!remote.id || !link) throw new Error('Incomplete create response.');
        const url = new URL(link.href);
        if (url.protocol !== 'https:' || !(url.hostname === 'sandbox.paypal.com' || url.hostname.endsWith('.sandbox.paypal.com'))) throw new Error('Unexpected approval host.');
        order.paypalId = remote.id; order.approvalUrl = url.href; order.status = 'awaiting_approval';
      }
      this.store.save(order); return { order, approvalUrl: order.approvalUrl! };
    } catch (error) {
      order.status = error instanceof AppError && ['PAYPAL_NOT_CONFIGURED', 'PAYPAL_AUTH'].includes(error.code) ? 'ready' : 'unknown';
      this.store.save(order); if (error instanceof AppError) throw error;
      throw new AppError(502, 'PAYMENT_UNKNOWN', 'Payment creation is unconfirmed. Check status before another attempt.');
    }
  }
  async capture(id: string, owner: string, token?: string) {
    const order = this.store.transaction(() => {
      const current = this.store.get(id, owner);
      if (current.status === 'paid') return current;
      if (current.status !== 'awaiting_approval' || !current.paypalId) throw new AppError(409, 'PAYMENT_LOCKED', 'This checkout is inactive or payment is still being checked.');
      if (current.mode === 'sandbox' && token !== current.paypalId) throw new AppError(409, 'PAYMENT_MISMATCH', 'The returned PayPal token does not match this checkout.');
      current.status = 'capturing'; current.captureSubmitted = true; this.store.save(current); return current;
    });
    if (order.status === 'paid') return order;
    try {
      if (order.mode === 'fixture') { order.status = 'paid'; order.captureId = `SIMULATED-CAPTURE-${order.id}`; this.store.save(order); return order; }
      await this.client.capture(order);
      // Fetch server-side details instead of trusting the browser or just the capture response.
      return reconcile(this.store, order, await this.client.get(order));
    } catch (error) { markUnknown(this.store, order); if (error instanceof AppError) throw error; throw new AppError(502, 'PAYMENT_UNKNOWN', 'The payment response was interrupted. Check status; do not pay again.'); }
  }
  async status(id: string, owner: string) {
    const order = this.store.get(id, owner);
    if (order.mode === 'fixture' || ['ready', 'paid', 'stale'].includes(order.status)) return order;
    if (['creating', 'capturing'].includes(order.status)) throw new AppError(409, 'PAYMENT_BUSY', 'A payment request is still running. Wait before checking again.');
    if (!order.paypalId) {
      throw new AppError(409, 'PAYMENT_UNKNOWN', 'No PayPal order ID was received. Recover the original creation request within one hour, or check the Sandbox dashboard. Do not create a new payment.');
    }
    try { return reconcile(this.store, order, await this.client.get(order)); }
    catch (error) { markUnknown(this.store, order); if (error instanceof AppError) throw error; throw new AppError(502, 'PAYMENT_UNKNOWN', 'Payment status is still unknown. Check the Sandbox dashboard before paying again.'); }
  }
}

export function paymentMode(): StoredOrder['mode'] {
  return process.env.PAYMENT_MODE === 'sandbox' ? 'sandbox' : 'fixture';
}
export function paymentLocked(order: StoredOrder) { return lockedStatuses.includes(order.status); }
