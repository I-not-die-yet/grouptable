import { describe, expect, it } from 'vitest';
import { allocateSegments, updateSegmentMeals, validateSegments } from '../src/lib/segment-allocation';
import { menu } from '../src/lib/menu';
import { newSegment, newSegmentRequest } from '../src/lib/segments';
import { isCuisineId, matchMeals, tasteScores } from '../src/lib/taste';

const request = () => ({ ...newSegmentRequest(2), exclusiveConfirmed: true, segments: [{ ...newSegment('a', 'Team'), headcount: 2, confirmed: true }] });
const italian = [{ id: 'urn:tag:cuisine:qloo:italian', name: 'Italian', affinity: 0.8 }];
const scores = tasteScores(matchMeals(italian, menu));
describe('taste-informed allocation with unchanged hard constraints', () => {
  it('changes choices for different cuisine evidence with the same event and menu', () => {
    const r = request(); const original = structuredClone(r);
    const italianResult = allocateSegments(r, menu, undefined, scores);
    const chineseResult = allocateSegments(r, menu, undefined, tasteScores(matchMeals([{ id: 'urn:tag:cuisine:qloo:cantonese', name: 'Cantonese', affinity: 0.8 }], menu)));
    expect(italianResult.ok && italianResult.allocation.assignments[0].itemId).toBe('mushroom-pasta');
    expect(chineseResult.ok && chineseResult.allocation.assignments[0].itemId).toBe('egg-fried-rice');
    expect(r).toEqual(original);
  });
  it('falls back to affordable meals rather than falsely declaring infeasible after taste ordering', () => {
    const r = request(); r.budgetCents = 21600; // exactly two cheapest meals + delivery
    const result = allocateSegments(r, menu, undefined, scores);
    expect(result).toMatchObject({ ok: true, allocation: { totalCents: 21600, assignments: [{ itemId: 'ginger-tofu', quantity: 2 }] } });
  });
  it('never lets affinity override unknown/incompatible dietary data or unavailable stock', () => {
    const r = request(); r.segments[0].requirements = ['vegan'];
    const result = allocateSegments(r, menu, undefined, { 'mushroom-pasta': 1, 'seasonal-box': 1, 'pumpkin-box': 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validateSegments(r, result.allocation.assignments, menu).ok).toBe(true);
      expect(result.allocation.assignments.every(a => !['mushroom-pasta', 'seasonal-box', 'pumpkin-box'].includes(a.itemId))).toBe(true);
    }
  });
  it('preserves shared stock, manual replacements and the no-taste path', () => {
    const r = request(); r.segments = [{ ...r.segments[0], headcount: 1 }, { ...newSegment('b'), headcount: 1, confirmed: true }];
    const limited = menu.map(m => ({ ...m, stock: m.id === 'mushroom-pasta' ? 1 : m.stock }));
    const result = allocateSegments(r, limited, undefined, scores);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.allocation.assignments.filter(a => a.itemId === 'mushroom-pasta').reduce((n, a) => n + a.quantity, 0)).toBe(1);
    const edited = updateSegmentMeals(r, result.allocation.assignments, 'a', [{ itemId: 'roast-chicken', quantity: 1 }], menu);
    expect(edited.ok).toBe(true);
    expect(edited.allocation.assignments.filter(a => a.segmentId === 'b')).toEqual(result.allocation.assignments.filter(a => a.segmentId === 'b'));
    expect(allocateSegments(r, menu)).toEqual(allocateSegments(r, menu, undefined, {}));
  });
  it('leaves absent cuisine mappings neutral and excludes dietary/sustainability claims', () => {
    expect(isCuisineId('urn:tag:cuisine:qloo:vegan')).toBe(false);
    expect(isCuisineId('urn:tag:cuisine:qloo:gluten_free')).toBe(false);
    expect(isCuisineId('urn:tag:cuisine:qloo:sustainable')).toBe(false);
    expect(matchMeals([{ id: 'urn:tag:cuisine:qloo:vegan', name: 'Vegan', affinity: 1 }], menu)).toEqual([]);
    expect(matchMeals(italian, menu).map(m => m.itemId)).toEqual(['mushroom-pasta']);
    const r = request(); expect(allocateSegments(r, menu, 1, scores)).toMatchObject({ code: 'SEARCH_LIMIT' });
  });
});
