import { afterEach, describe, expect, it } from 'vitest';
import { Store, publicOrder, isSegmentOrder } from '../src/lib/store';
import { newRequest, requirements } from '../src/lib/domain';
import { allocate } from '../src/lib/allocation';
import { menu } from '../src/lib/menu';
import { convertLegacyAllocation, convertLegacyRequest, restoreDraft } from '../src/lib/segment-compat';
import { Payments } from '../src/lib/paypal';
const stores: Store[] = [];
function legacy(count = 3) { const request = newRequest(count); request.attendees = request.attendees.map(a => ({ ...a, confirmed: true, unresolved: [] })); return request; }
afterEach(() => { for (const store of stores.splice(0)) store.db.close(); });
describe('saved-order and draft compatibility', () => {
  it('safely groups only fully confirmed legacy drafts and leaves input unchanged', () => {
    const old = legacy(); old.attendees[0].requirements = ['vegetarian', 'dairyFree'];
    const original = JSON.stringify(old);
    const result = convertLegacyRequest(old);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.segments.map(s => s.headcount)).toEqual([1, 2]);
    expect(result.request.exclusiveConfirmed).toBe(true);
    expect(JSON.stringify(old)).toBe(original);
    const allocation = allocate(old, menu); if (!allocation.ok) throw new Error('Test setup');
    const converted = convertLegacyAllocation(old, allocation.allocation, result.request);
    expect(converted.assignments.reduce((sum, a) => sum + a.quantity, 0)).toBe(3);
    expect(converted.totalCents).toBe(allocation.allocation.totalCents);
  });
  it('preserves unresolved, malformed and too-fragmented drafts without inventing counts', () => {
    const unfinished = newRequest(6);
    const original = structuredClone(unfinished);
    expect(convertLegacyRequest(unfinished)).toMatchObject({ ok: false }); expect(unfinished).toEqual(original);
    expect(restoreDraft({ request: { headcount: 30, attendees: [] } })).toMatchObject({ ok: false });
    const fragmented = legacy(13);
    fragmented.attendees.forEach((a, i) => { a.requirements = requirements.slice(0, 4).filter((_, bit) => i & (1 << bit)); });
    expect(convertLegacyRequest(fragmented)).toMatchObject({ ok: false, message: expect.stringContaining('13 segments') });
  });
  it('reads old snapshots byte-for-byte and completes their original fixture payment without migration', async () => {
    const store = new Store(':memory:'); stores.push(store);
    const request = legacy(2); const result = allocate(request, menu); if (!result.ok) throw new Error('Test setup');
    const old = store.create('old-session', request, result.allocation, 'fixture');
    const before = store.db.prepare('SELECT payload FROM orders WHERE id=?').get(old.id)!.payload;
    const loaded = store.get(old.id, old.owner); expect(isSegmentOrder(loaded)).toBe(false);
    expect(publicOrder(loaded).request).toEqual(old.request);
    expect(store.db.prepare('SELECT payload FROM orders WHERE id=?').get(old.id)!.payload).toBe(before);
    const payments = new Payments(store);
    await payments.create(old.id, old.owner); const paid = await payments.capture(old.id, old.owner);
    expect(paid.status).toBe('paid'); expect(isSegmentOrder(paid)).toBe(false);
    expect(paid.items).toEqual(old.items); expect(paid.allocation).toEqual(old.allocation);
    expect((await payments.status(old.id, old.owner)).status).toBe('paid');
  });
  it('keeps old pending/unknown locks and checkout invalidation', async () => {
    const store = new Store(':memory:'); stores.push(store);
    const request = legacy(2); const result = allocate(request, menu); if (!result.ok) throw new Error('Test setup');
    const old = store.create('old-session', request, result.allocation, 'fixture');
    const payments = new Payments(store); await payments.create(old.id, old.owner);
    store.invalidate(old.id, old.owner); await expect(payments.capture(old.id, old.owner)).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
    for (const status of ['pending', 'unknown', 'capturing'] as const) {
      const current = store.get(old.id, old.owner); current.status = status; store.save(current);
      expect(() => store.invalidate(old.id, old.owner)).toThrow(/being checked/);
      await expect(payments.create(old.id, old.owner)).rejects.toMatchObject({ code: 'PAYMENT_LOCKED' });
    }
  });
});
