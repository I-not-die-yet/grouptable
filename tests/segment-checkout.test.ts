import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST as createOrder } from '../src/app/api/orders/route';
import { POST as allocateRoute } from '../src/app/api/allocate/route';
import { newSegment, newSegmentRequest, type SegmentAssignment } from '../src/lib/segments';
import { getStore, isSegmentOrder, type PublicSegmentOrder } from '../src/lib/store';
import { Payments, PayPalClient } from '../src/lib/paypal';

const base = 'http://127.0.0.1:3000'; const owner = '12345678-1234-1234-1234-123456789abc';
let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'grouptable-segments-')); vi.stubEnv('GROUPTABLE_DB_PATH', join(directory, 'orders.sqlite')); vi.stubEnv('APP_URL', base); vi.stubEnv('PAYMENT_MODE', 'fixture'); });
afterEach(() => { getStore().db.close(); rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
const http = (body: unknown, path = '/api/orders') => new Request(`${base}${path}`, { method: 'POST', headers: { origin: base, cookie: `gt_session=${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function body() {
  const request = { ...newSegmentRequest(6), exclusiveConfirmed: true, segments: [{ ...newSegment('veg', 'Vegetarian and dairy-free'), headcount: 3, requirements: ['vegetarian', 'dairyFree'] as const, confirmed: true, sources: ['Original evidence, not for persistence'] }, { ...newSegment('regular', 'No known restrictions'), headcount: 3, confirmed: true }] };
  const assignments: SegmentAssignment[] = [{ segmentId: 'veg', itemId: 'ginger-tofu', quantity: 3 }, { segmentId: 'regular', itemId: 'ginger-tofu', quantity: 1 }, { segmentId: 'regular', itemId: 'roast-chicken', quantity: 2 }];
  return { request, assignments };
}
describe('segment checkout and authoritative pricing', () => {
  it('stores final segment quantities and consolidates snapshots without original excerpts', async () => {
    const input = body(); const response = await createOrder(http(input)); expect(response.status).toBe(201);
    const saved = await response.json() as PublicSegmentOrder;
    expect(saved.request.version).toBe(2); expect(saved.request.segments.map(s => s.headcount)).toEqual([3, 3]);
    expect(saved.request.segments.every(s => s.sources.length === 0)).toBe(true);
    expect(saved.allocation).toMatchObject({ assignments: input.assignments, subtotalCents: 42800, deliveryCents: 8000, totalCents: 50800 });
    expect(saved.items.map(i => ({ id: i.id, quantity: i.quantity }))).toEqual([{ id: 'ginger-tofu', quantity: 4 }, { id: 'roast-chicken', quantity: 2 }]);
  });
  it('rejects forged prices, incorrect quantities, incompatible/unknown meals and mismatched counts', async () => {
    const input = body();
    expect((await createOrder(http({ ...input, totalCents: 1 }))).status).toBe(400);
    expect((await createOrder(http({ ...input, assignments: input.assignments.map(a => ({ ...a, priceCents: 1 })) }))).status).toBe(400);
    for (const quantity of [0, -1, 1.5, 101]) expect((await createOrder(http({ ...input, assignments: [{ ...input.assignments[0], quantity }, ...input.assignments.slice(1)] }))).status).toBe(400);
    for (const itemId of ['roast-chicken', 'seasonal-box', 'not-a-meal']) expect((await createOrder(http({ ...input, assignments: [{ ...input.assignments[0], itemId }, ...input.assignments.slice(1)] }))).status).toBe(422);
    expect((await createOrder(http({ ...input, assignments: [{ ...input.assignments[0], quantity: 2 }, ...input.assignments.slice(1)] }))).status).toBe(422);
    expect((await createOrder(http({ ...input, request: { ...input.request, budgetCents: 50000 } }))).status).toBe(422);
    expect((await createOrder(http({ ...input, request: { ...input.request, headcount: 7 } }))).status).toBe(422);
    expect((await createOrder(http({ ...input, request: { ...input.request, headcount: 101 } }))).status).toBe(400);
    expect((await createOrder(http({ ...input, request: { ...input.request, segments: Array.from({ length: 13 }, (_, i) => ({ ...newSegment(`s-${i}`), confirmed: true })) } }))).status).toBe(400);
  });
  it('serves truthful stock infeasibility for a schema-supported 100-person request', async () => {
    const request = { ...newSegmentRequest(100), budgetCents: 1_000_000, exclusiveConfirmed: true, segments: [{ ...newSegment('vegan', 'Vegan'), headcount: 100, requirements: ['vegan'], confirmed: true }] };
    const response = await allocateRoute(http(request, '/api/allocate')); expect(response.status).toBe(200); expect((await response.json()).code).toBe('INFEASIBLE');
    expect((await allocateRoute(http({ ...request, headcount: 101 }, '/api/allocate'))).status).toBe(400);
  });
  it('keeps segment breakdown while mocked PayPal lines and verified captures use the consolidated amount', async () => {
    const response = await createOrder(http(body())); const saved = await response.json() as PublicSegmentOrder;
    const store = getStore(); const order = store.get(saved.id, owner); order.mode = 'sandbox'; store.save(order);
    vi.stubEnv('PAYPAL_CLIENT_ID', 'test-id'); vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-secret');
    const remote = { id: 'pp-segment-test', status: 'COMPLETED', purchase_units: [{ reference_id: order.id, custom_id: order.id, amount: { value: '508.00', currency_code: 'HKD' }, payments: { captures: [{ id: 'capture-segment-test', status: 'COMPLETED', amount: { value: '508.00', currency_code: 'HKD' } }] } }] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => {
      if (String(url).endsWith('/token')) return Response.json({ access_token: 'test-only-token' });
      if (String(url).endsWith('/v2/checkout/orders')) return Response.json({ id: 'pp-segment-test', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=pp-segment-test' }] });
      return Response.json(remote);
    });
    const payments = new Payments(store, new PayPalClient(fetcher)); await payments.create(order.id, owner);
    const create = fetcher.mock.calls.find(([url]) => String(url).endsWith('/v2/checkout/orders'))!;
    const unit = JSON.parse(String(create[1]!.body)).purchase_units[0];
    expect(unit.items.map((i: { sku: string; quantity: string }) => [i.sku, i.quantity])).toEqual([['ginger-tofu', '4'], ['roast-chicken', '2']]);
    expect(unit.amount.breakdown.item_total.value).toBe('428.00'); expect(unit.amount.breakdown.shipping.value).toBe('80.00'); expect(unit.amount.value).toBe('508.00');
    const paid = await payments.capture(order.id, owner, 'pp-segment-test'); expect(paid.status).toBe('paid');
    expect(isSegmentOrder(paid)).toBe(true); expect(paid.allocation.assignments).toEqual(saved.allocation.assignments);
    expect(paid.request).toEqual(saved.request);
  });
  it('keeps payment locks and rejects stale segment checkout after editing', async () => {
    const response = await createOrder(http(body())); const saved = await response.json() as PublicSegmentOrder;
    const store = getStore(); const payments = new Payments(store); await payments.create(saved.id, owner); store.invalidate(saved.id, owner);
    await expect(payments.capture(saved.id, owner)).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
    for (const status of ['pending', 'unknown', 'capturing'] as const) {
      const order = store.get(saved.id, owner); order.status = status; store.save(order);
      expect(() => store.invalidate(saved.id, owner)).toThrow(/being checked/);
      await expect(payments.create(saved.id, owner)).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
    }
  });
});
