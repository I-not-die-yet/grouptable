import { describe, expect, it } from 'vitest';
import { menu } from '../src/lib/menu';
import { LIMITS } from '../src/lib/limits';
import { allocateSegments, consolidateSegmentItems, segmentOptions, updateSegmentMeals, validateSegments } from '../src/lib/segment-allocation';
import { newSegment, newSegmentRequest, requirementIssues, segmentAssignmentSchema, segmentCoverage, segmentRequestSchema, type SegmentAssignment, type SegmentRequest } from '../src/lib/segments';

function request(count = 10): SegmentRequest {
  return { ...newSegmentRequest(count), budgetCents: 1_000_000, exclusiveConfirmed: true, segments: [{ ...newSegment('a', 'Vegetarian'), headcount: count, requirements: ['vegetarian', 'dairyFree'], confirmed: true }] };
}
describe('segment limits and coverage', () => {
  it('matches exact counts and explicit no-known-restrictions confirmation', () => {
    const r = request(30); expect(segmentCoverage(r)).toMatchObject({ total: 30, shortfall: 0, excess: 0, confirmed: 30 });
    expect(requirementIssues(r)).toEqual([]);
    r.segments[0].requirements = []; r.segments[0].confirmed = false;
    expect(requirementIssues(r).some(i => i.code === 'UNCONFIRMED')).toBe(true);
  });
  it('shows missing people without inventing a no-restrictions group', () => {
    const r = request(30); r.segments[0].headcount = 20;
    expect(segmentCoverage(r).shortfall).toBe(10);
    expect(allocateSegments(r, menu)).toMatchObject({ code: 'UNRESOLVED', message: 'Requirements not confirmed: 10 people.' });
    expect(r.segments).toHaveLength(1);
  });
  it('blocks excess counts and missing exclusivity confirmation', () => {
    const r = request(30); r.segments[0].headcount = 31;
    expect(requirementIssues(r).some(i => i.code === 'EXCESS')).toBe(true);
    r.segments[0].headcount = 30; r.exclusiveConfirmed = false;
    expect(allocateSegments(r, menu)).toMatchObject({ code: 'UNRESOLVED' });
  });
  it('centrally enforces 100 people, 12 segments, positive integer counts and unique IDs', () => {
    expect(LIMITS).toMatchObject({ headcount: 100, segments: 12, searchStates: 50000 });
    expect(segmentRequestSchema.safeParse(request(100)).success).toBe(true);
    expect(segmentRequestSchema.safeParse(request(101)).success).toBe(false);
    for (const count of [0, -1, 1.5, 101]) { const r = request(); r.segments[0].headcount = count; expect(segmentRequestSchema.safeParse(r).success).toBe(false); }
    const r = request(12); r.segments = Array.from({ length: 12 }, (_, i) => ({ ...newSegment(`s-${i}`), confirmed: true }));
    expect(segmentRequestSchema.safeParse(r).success).toBe(true);
    r.segments.push({ ...newSegment('extra'), confirmed: true }); expect(segmentRequestSchema.safeParse(r).success).toBe(false);
    r.segments.pop(); r.segments[1].id = r.segments[0].id; expect(segmentRequestSchema.safeParse(r).success).toBe(false);
  });
});

describe('quantity allocation and manual edits', () => {
  it('splits one segment across meal types without creating guest rows', () => {
    const r = request();
    const stock = menu.filter(i => ['ginger-tofu', 'lentil-rice'].includes(i.id)).map(i => ({ ...i, stock: i.id === 'ginger-tofu' ? 6 : 4 }));
    const result = allocateSegments(r, stock);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocation.assignments).toEqual([{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 6 }, { segmentId: 'a', itemId: 'lentil-rice', quantity: 4 }]);
    expect(result.allocation.totalCents).toBe(6 * 6800 + 4 * 7500 + 8000);
    expect(result.allocation.assignments.some(line => 'attendeeId' in line)).toBe(false);
  });
  it('respects overlapping requirements, unknown attributes and stock shared across segments', () => {
    const r = request(15); r.segments[0].headcount = 10;
    r.segments.push({ ...newSegment('b', 'No known restrictions'), headcount: 5, confirmed: true });
    const original = structuredClone(r);
    const assignments = [{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 6 }, { segmentId: 'a', itemId: 'lentil-rice', quantity: 4 }, { segmentId: 'b', itemId: 'ginger-tofu', quantity: 5 }];
    const options = segmentOptions(r.segments[0], assignments, menu);
    expect(options.find(o => o.item.id === 'ginger-tofu')!.available).toBe(7);
    expect(options.find(o => o.item.id === 'lentil-rice')!.available).toBe(10);
    expect(options.some(o => o.item.id === 'roast-chicken' || o.item.id === 'seasonal-box')).toBe(false);
    const valid = updateSegmentMeals(r, assignments, 'a', [{ itemId: 'ginger-tofu', quantity: 7 }, { itemId: 'lentil-rice', quantity: 3 }], menu);
    expect(valid.ok).toBe(true);
    expect(valid.allocation.assignments.filter(a => a.segmentId === 'b')).toEqual(assignments.filter(a => a.segmentId === 'b'));
    expect(r).toEqual(original);
    const over = updateSegmentMeals(r, assignments, 'a', [{ itemId: 'ginger-tofu', quantity: 8 }, { itemId: 'lentil-rice', quantity: 2 }], menu);
    expect(over.ok).toBe(false); expect(over.issues.some(i => i.code === 'STOCK')).toBe(true);
    expect(assignments[0].quantity).toBe(6);
  });
  it('retains partial edits and reports shortages, excess, duplicates and incompatible meals', () => {
    const r = request(10);
    const partial = validateSegments(r, [{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 6 }], menu);
    expect(partial.issues).toContainEqual({ code: 'SEGMENT_COUNT', segmentId: 'a', message: '4 more meals needed for Vegetarian.' });
    for (const quantity of [0, -1, 1.5, 101]) expect(validateSegments(r, [{ segmentId: 'a', itemId: 'ginger-tofu', quantity }], menu).issues.some(i => i.code === 'QUANTITY')).toBe(true);
    expect(validateSegments(r, [{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 11 }], menu).issues.some(i => i.code === 'SEGMENT_COUNT')).toBe(true);
    expect(validateSegments(r, [{ segmentId: 'a', itemId: 'seasonal-box', quantity: 10 }], menu).issues.some(i => i.code === 'INCOMPATIBLE')).toBe(true);
    expect(validateSegments(r, [{ segmentId: 'a', itemId: 'roast-chicken', quantity: 10 }], menu).ok).toBe(false);
    expect(validateSegments(r, [{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 5 }, { segmentId: 'a', itemId: 'ginger-tofu', quantity: 5 }], menu).issues.some(i => i.code === 'DUPLICATE')).toBe(true);
    expect(segmentAssignmentSchema.safeParse({ segmentId: 'a', itemId: 'ginger-tofu', quantity: 1, priceCents: 1 }).success).toBe(false);
  });
  it('charges delivery once and allows an over-budget edit to be corrected', () => {
    const r = request(2); r.budgetCents = 21600;
    const valid = validateSegments(r, [{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 2 }], menu);
    expect(valid.ok).toBe(true); expect(valid.allocation.deliveryCents).toBe(8000);
    const over = updateSegmentMeals(r, valid.allocation.assignments, 'a', [{ itemId: 'lentil-rice', quantity: 2 }], menu);
    expect(over.ok).toBe(false); expect(over.allocation.totalCents).toBe(23000);
    expect(updateSegmentMeals(r, over.allocation.assignments, 'a', [{ itemId: 'ginger-tofu', quantity: 2 }], menu).ok).toBe(true);
  });
  it('supports representative 30/100-person quantities and truthful infeasible/search-limit results', () => {
    for (const headcount of [30, 100]) {
      const r = request(headcount); r.segments[0].requirements = [];
      const result = allocateSegments(r, menu); expect(result.ok).toBe(true);
      if (result.ok) { expect(result.allocation.assignments.reduce((sum, a) => sum + a.quantity, 0)).toBe(headcount); expect(result.allocation.assignments.length).toBeLessThanOrEqual(menu.length); expect(validateSegments(r, result.allocation.assignments, menu).ok).toBe(true); }
      expect(allocateSegments(r, menu.map(m => ({ ...m, stock: 0 })))).toMatchObject({ code: 'INFEASIBLE' });
      expect(allocateSegments(r, menu, 0)).toMatchObject({ code: 'SEARCH_LIMIT' });
    }
    const restrictive = request(100); expect(allocateSegments(restrictive, menu)).toMatchObject({ code: 'INFEASIBLE' });
  });
  it('consolidates item quantities without losing segment assignments', () => {
    const assignments: SegmentAssignment[] = [{ segmentId: 'a', itemId: 'ginger-tofu', quantity: 5 }, { segmentId: 'b', itemId: 'ginger-tofu', quantity: 3 }, { segmentId: 'b', itemId: 'lentil-rice', quantity: 2 }];
    expect([...consolidateSegmentItems({ assignments, subtotalCents: 0, deliveryCents: 8000, totalCents: 8000 })]).toEqual([['ginger-tofu', 8], ['lentil-rice', 2]]);
    expect(assignments).toHaveLength(3);
  });
  it('honours the actual 50,000-state bound on a difficult 100-person stock conflict', () => {
    const r = request(100);
    r.segments = Array.from({ length: 10 }, (_, i) => ({ ...newSegment(`vegetarian-${i}`), headcount: 10, requirements: ['vegetarian'] as const, confirmed: true }));
    const result = allocateSegments(r, menu);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SEARCH_LIMIT');
    expect(result.searched).toBe(50001);
  });
});
