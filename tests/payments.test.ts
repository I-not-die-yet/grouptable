import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allocate } from '../src/lib/allocation';
import { newRequest, decimalMoney } from '../src/lib/domain';
import { menu } from '../src/lib/menu';
import { Store } from '../src/lib/store';
import { PayPalClient, Payments, reconcile, type PayPalOrder } from '../src/lib/paypal';
const stores: Store[] = [];
function setup(mode: 'fixture' | 'sandbox' = 'sandbox') {
  const store = new Store(':memory:'); stores.push(store);
  const request = newRequest(2); request.attendees = request.attendees.map(a => ({ ...a, source: 'Do not persist this original reply', confirmed: true, unresolved: [] }));
  const result = allocate(request, menu); if (!result.ok) throw new Error('Bad test setup');
  const order = store.create('test-owner', request, result.allocation, mode); return { store, order };
}
function remote(id: string, internal: string, total: number, status = 'COMPLETED', captureStatus = 'COMPLETED'): PayPalOrder {
  return { id, status, purchase_units: [{ custom_id: internal, reference_id: internal, amount: { currency_code: 'HKD', value: decimalMoney(total) }, payments: { captures: status === 'APPROVED' ? [] : [{ id: 'capture-test', status: captureStatus, amount: { currency_code: 'HKD', value: decimalMoney(total) } }] } }] };
}
afterEach(() => { for (const store of stores.splice(0)) store.db.close(); vi.unstubAllEnvs(); });
describe('payment state and persistence', () => {
  it('runs a labelled fixture payment without network access', async () => {
    const { store, order } = setup('fixture'); const payments = new Payments(store);
    const created = await payments.create(order.id, order.owner); expect(created.order.paypalId).toMatch(/^SIMULATED/);
    const paid = await payments.capture(order.id, order.owner); expect(paid.status).toBe('paid'); expect(paid.captureId).toMatch(/^SIMULATED/);
    expect((await payments.capture(order.id, order.owner)).captureId).toBe(paid.captureId);
  });
  it('does not store raw evidence and isolates browser owners', () => {
    const { store, order } = setup(); expect(order.request.attendees.every(a => a.source === '')).toBe(true);
    expect(() => store.get(order.id, 'other-browser')).toThrow(/browser session/);
  });
  it('keeps checkout ready when no credential was configured and no order request was sent', async () => {
    vi.stubEnv('PAYPAL_CLIENT_ID', ''); vi.stubEnv('PAYPAL_CLIENT_SECRET', '');
    const { store, order } = setup();
    await expect(new Payments(store).create(order.id, order.owner)).rejects.toMatchObject({ code: 'PAYPAL_NOT_CONFIGURED' });
    expect(store.get(order.id, order.owner).status).toBe('ready');
  });
  it('invalidates old checkout and refuses stale capture', async () => {
    const { store, order } = setup('fixture'); const payments = new Payments(store);
    await payments.create(order.id, order.owner); store.invalidate(order.id, order.owner);
    await expect(payments.capture(order.id, order.owner)).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
  });
  it('serializes double-clicks before making the capture request', async () => {
    const { store, order } = setup(); order.status = 'awaiting_approval'; order.paypalId = 'pp-test'; store.save(order);
    let release!: () => void;
    const capture = vi.fn().mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const get = vi.fn().mockResolvedValue(remote('pp-test', order.id, order.allocation.totalCents));
    const client = { capture, get } as unknown as PayPalClient;
    const payments = new Payments(store, client);
    const first = payments.capture(order.id, order.owner, 'pp-test');
    await expect(payments.capture(order.id, order.owner, 'pp-test')).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
    expect(() => store.invalidate(order.id, order.owner)).toThrow(/being checked/);
    release(); expect((await first).status).toBe('paid'); expect(capture).toHaveBeenCalledTimes(1);
  });
  it('preserves unknown outcomes and reconciles a lost capture response', async () => {
    const { store, order } = setup(); order.status = 'awaiting_approval'; order.paypalId = 'pp-test'; store.save(order);
    const client = { capture: vi.fn().mockRejectedValue(new Error('lost response')), get: vi.fn().mockResolvedValue(remote('pp-test', order.id, order.allocation.totalCents)) } as unknown as PayPalClient;
    const payments = new Payments(store, client);
    await expect(payments.capture(order.id, order.owner, 'pp-test')).rejects.toMatchObject({ code: 'PAYMENT_UNKNOWN' });
    expect(store.get(order.id, order.owner).status).toBe('unknown');
    await expect(payments.create(order.id, order.owner)).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
    expect((await payments.status(order.id, order.owner)).status).toBe('paid');
  });
  it('rejects a mismatched returned token before making any capture', async () => {
    const { store, order } = setup(); order.status = 'awaiting_approval'; order.paypalId = 'pp-test'; store.save(order);
    const client = { capture: vi.fn() } as unknown as PayPalClient;
    await expect(new Payments(store, client).capture(order.id, order.owner, 'wrong')).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    expect(client.capture).not.toHaveBeenCalled();
  });
  it('verifies amount, currency, IDs, and completed status', () => {
    for (const mutation of ['amount', 'currency', 'id', 'internal', 'pending']) {
      const { store, order } = setup(); order.status = 'unknown'; order.paypalId = 'pp-test'; store.save(order);
      const body = remote('pp-test', order.id, order.allocation.totalCents);
      if (mutation === 'amount') body.purchase_units![0].payments!.captures![0].amount!.value = '0.01';
      if (mutation === 'currency') body.purchase_units![0].payments!.captures![0].amount!.currency_code = 'USD';
      if (mutation === 'id') body.id = 'other';
      if (mutation === 'internal') body.purchase_units![0].custom_id = 'other';
      if (mutation === 'pending') { body.status = 'APPROVED'; body.purchase_units![0].payments!.captures![0].status = 'PENDING'; expect(reconcile(store, order, body).status).toBe('pending'); }
      else expect(() => reconcile(store, order, body)).toThrow(/match/);
      expect(store.get(order.id, order.owner).status).not.toBe('paid');
    }
  });
  it('does not revive a stale checkout when a delayed status response arrives', () => {
    const { store, order } = setup(); order.paypalId = 'pp-test'; order.status = 'awaiting_approval'; store.save(order);
    store.invalidate(order.id, order.owner);
    expect(reconcile(store, order, remote('pp-test', order.id, order.allocation.totalCents, 'APPROVED')).status).toBe('stale');
  });
  it('does not unlock an uncertain capture merely because no capture is visible yet', () => {
    const { store, order } = setup(); order.paypalId = 'pp-test'; order.status = 'unknown'; order.captureSubmitted = true; store.save(order);
    expect(reconcile(store, order, remote('pp-test', order.id, order.allocation.totalCents, 'APPROVED')).status).toBe('unknown');
    expect(() => store.invalidate(order.id, order.owner)).toThrow(/being checked/);
  });
  it('keeps the same creation request ID on recovery, without network writes on GET', async () => {
    const { store, order } = setup(); order.status = 'unknown'; store.save(order);
    const create = vi.fn().mockResolvedValue({ id: 'pp-test', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=pp-test' }] });
    const payments = new Payments(store, { create } as unknown as PayPalClient);
    await expect(payments.status(order.id, order.owner)).rejects.toMatchObject({ code: 'PAYMENT_UNKNOWN' }); expect(create).not.toHaveBeenCalled();
    const result = await payments.create(order.id, order.owner);
    expect(result.order.createRequestId).toBe(order.createRequestId); expect(create).toHaveBeenCalledTimes(1);
  });
  it('survives database reopen and locks interrupted requests', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grouptable-test-')); const path = join(dir, 'orders.sqlite');
    try {
      const { order } = setup(); const first = new Store(path); order.status = 'capturing'; first.save(order); first.db.close();
      const reopened = new Store(path); expect(reopened.get(order.id, order.owner).status).toBe('unknown'); reopened.db.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps item totals, delivery, references and request IDs consistent in API bodies', async () => {
    vi.stubEnv('PAYPAL_CLIENT_ID', 'test-id'); vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-secret');
    const { order } = setup();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: 'fake-test-token' })).mockResolvedValueOnce(Response.json({ id: 'pp-test' }));
    await new PayPalClient(fetcher).create(order);
    const [url, options] = fetcher.mock.calls[1]; expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    const body = JSON.parse(String(options!.body)); const unit = body.purchase_units[0];
    expect(unit.custom_id).toBe(order.id); expect(unit.reference_id).toBe(order.id);
    const cents = (v: string) => Number(v.replace('.', ''));
    expect(unit.items.reduce((sum: number, item: { quantity: string; unit_amount: { value: string } }) => sum + Number(item.quantity) * cents(item.unit_amount.value), 0) + cents(unit.amount.breakdown.shipping.value)).toBe(order.allocation.totalCents);
    expect((options!.headers as Record<string, string>)['PayPal-Request-Id']).toBe(order.createRequestId);
    expect(unit.items[0].name).toBe(order.items[0].name);
    expect(unit.items[0].unit_amount.value).toBe(decimalMoney(order.items[0].priceCents));
  });
});
