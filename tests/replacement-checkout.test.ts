import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST as createOrder } from '../src/app/api/orders/route';
import { allocate, replaceMeal } from '../src/lib/allocation';
import { decimalMoney, newRequest } from '../src/lib/domain';
import { menu } from '../src/lib/menu';
import { getStore, type PublicOrder } from '../src/lib/store';
import { PayPalClient, Payments } from '../src/lib/paypal';

const base = 'http://127.0.0.1:3000';
const owner = '12345678-1234-1234-1234-123456789abc';
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'grouptable-replacement-'));
  vi.stubEnv('GROUPTABLE_DB_PATH', join(directory, 'test.sqlite'));
  vi.stubEnv('APP_URL', base);
  vi.stubEnv('PAYMENT_MODE', 'fixture');
});
afterEach(() => { getStore().db.close(); rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
function submit(body: unknown) {
  return createOrder(new Request(`${base}/api/orders`, { method: 'POST', headers: { origin: base, cookie: `gt_session=${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
function editedOrder() {
  const request = newRequest();
  request.attendees = request.attendees.map(a => ({ ...a, confirmed: true, unresolved: [] }));
  request.attendees[0].requirements = ['vegetarian', 'dairyFree'];
  const initial = allocate(request, menu);
  if (!initial.ok) throw new Error('Invalid test setup');
  const edited = replaceMeal(request, initial.allocation.assignments, 'guest-4', 'roast-chicken', menu);
  if (!edited.ok) throw new Error('Invalid replacement setup');
  return { request, assignments: edited.allocation.assignments };
}

describe('edited checkout at the server boundary', () => {
  it('rejects client-supplied prices or totals rather than trusting them', async () => {
    const body = editedOrder();
    expect((await submit({ ...body, totalCents: 1 })).status).toBe(400);
    expect((await submit({ ...body, assignments: body.assignments.map(a => ({ ...a, priceCents: 1 })) })).status).toBe(400);
    const valid = await submit(body);
    expect(valid.status).toBe(201);
    expect((await valid.json()).allocation.totalCents).toBe(49800);
  });

  it('independently rejects incompatible, unknown, duplicated, over-stock and over-budget assignments', async () => {
    const body = editedOrder();
    for (const itemId of ['roast-chicken', 'seasonal-box', 'not-a-meal']) {
      expect((await submit({ ...body, assignments: body.assignments.map(a => a.attendeeId === 'guest-1' ? { ...a, itemId } : a) })).status).toBe(422);
    }
    expect((await submit({ ...body, assignments: body.assignments.map(a => ({ ...a, attendeeId: 'guest-1' })) })).status).toBe(422);
    expect((await submit({ ...body, request: { ...body.request, budgetCents: 48800 } })).status).toBe(422);
    const large = newRequest(13);
    large.budgetCents = 200000;
    large.attendees = large.attendees.map(a => ({ ...a, confirmed: true, unresolved: [] }));
    expect((await submit({ request: large, assignments: large.attendees.map(a => ({ attendeeId: a.id, itemId: 'ginger-tofu' })) })).status).toBe(422);
  });

  it('carries final choices through snapshots, PayPal lines and verified capture using mocked PayPal only', async () => {
    const body = editedOrder();
    const response = await submit(body);
    const snapshot = await response.json() as PublicOrder;
    expect(snapshot.allocation).toMatchObject({ subtotalCents: 41800, deliveryCents: 8000, totalCents: 49800 });
    expect(snapshot.items.map(i => ({ id: i.id, quantity: i.quantity }))).toEqual([{ id: 'ginger-tofu', quantity: 5 }, { id: 'roast-chicken', quantity: 1 }]);
    expect(snapshot.request.attendees[0].requirements).toEqual(['vegetarian', 'dairyFree']);

    // Change only the synthetic order's mode to exercise the actual HTTP adapter with mocks.
    const store = getStore();
    const order = store.get(snapshot.id, owner); order.mode = 'sandbox'; store.save(order);
    vi.stubEnv('PAYPAL_CLIENT_ID', 'test-only-id'); vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-only-secret');
    const remote = { id: 'pp-edited-test', status: 'COMPLETED', purchase_units: [{ reference_id: order.id, custom_id: order.id, amount: { value: '498.00', currency_code: 'HKD' }, payments: { captures: [{ id: 'capture-edited-test', status: 'COMPLETED', amount: { value: '498.00', currency_code: 'HKD' } }] } }] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'test-only-token' });
      if (String(url).endsWith('/v2/checkout/orders')) return Response.json({ id: 'pp-edited-test', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=pp-edited-test' }] });
      if (String(url).endsWith('/capture')) return Response.json(remote);
      if (options?.method === 'GET') return Response.json(remote);
      throw new Error('Unexpected mocked request');
    });
    const payments = new Payments(store, new PayPalClient(fetcher));
    await payments.create(order.id, owner);
    const call = fetcher.mock.calls.find(([url]) => String(url).endsWith('/v2/checkout/orders'))!;
    const unit = JSON.parse(String(call[1]!.body)).purchase_units[0];
    expect(unit.items.map((i: { sku: string; quantity: string }) => ({ id: i.sku, quantity: Number(i.quantity) }))).toEqual(snapshot.items.map(i => ({ id: i.id, quantity: i.quantity })));
    expect(unit.amount.value).toBe(decimalMoney(snapshot.allocation.totalCents));
    expect(unit.amount.breakdown.item_total.value).toBe('418.00');
    expect(unit.amount.breakdown.shipping.value).toBe('80.00');
    const lineTotal = unit.items.reduce((sum: number, i: { quantity: string; unit_amount: { value: string } }) => sum + Number(i.quantity) * Math.round(Number(i.unit_amount.value) * 100), 0);
    expect(lineTotal + 8000).toBe(snapshot.allocation.totalCents);
    const paid = await payments.capture(order.id, owner, 'pp-edited-test');
    expect(paid.status).toBe('paid');
    expect(paid.captureId).toBe('capture-edited-test');
    expect(paid.allocation.assignments).toEqual(snapshot.allocation.assignments);
    expect(paid.items).toEqual(snapshot.items);
  });
});
