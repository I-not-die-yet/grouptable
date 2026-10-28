import { describe, expect, it } from 'vitest';
import { allocate, replacementOptions, replaceMeal, validateAllocation } from '../src/lib/allocation';
import { newRequest, type Assignment } from '../src/lib/domain';
import { menu } from '../src/lib/menu';

function setup(count = 6) {
  const request = newRequest(count);
  request.attendees = request.attendees.map(a => ({ ...a, confirmed: true, unresolved: [] }));
  request.attendees[0].requirements = ['vegetarian', 'dairyFree'];
  const result = allocate(request, menu);
  if (!result.ok) throw new Error('Invalid test setup');
  return { request, allocation: result.allocation };
}

describe('manual meal replacement', () => {
  it('updates assignments, counts and server-priced totals without regenerating', () => {
    const { request, allocation } = setup();
    const result = replaceMeal(request, allocation.assignments, 'guest-4', 'roast-chicken', menu);
    expect(result.ok).toBe(true);
    expect(result.allocation).toMatchObject({ subtotalCents: 41800, deliveryCents: 8000, totalCents: 49800 });
    const counts = result.allocation!.assignments.reduce<Record<string, number>>((all, a) => ({ ...all, [a.itemId]: (all[a.itemId] ?? 0) + 1 }), {});
    expect(counts).toEqual({ 'ginger-tofu': 5, 'roast-chicken': 1 });
  });

  it('preserves all other assignments and all confirmed requirements, including the original input', () => {
    const { request, allocation } = setup();
    const original = structuredClone({ request, allocation });
    const result = replaceMeal(request, allocation.assignments, 'guest-4', 'salmon-rice', menu);
    expect(result.ok).toBe(true);
    expect(result.allocation!.assignments.filter(a => a.attendeeId !== 'guest-4')).toEqual(original.allocation.assignments.filter(a => a.attendeeId !== 'guest-4'));
    expect(request).toEqual(original.request);
    expect(allocation).toEqual(original.allocation);
  });

  it('excludes incompatible meals, unknown required attributes and unavailable meals', () => {
    const { request, allocation } = setup();
    const options = replacementOptions(request.attendees[0], allocation.assignments, menu).map(m => m.id);
    expect(options).toContain('ginger-tofu');
    expect(options).not.toContain('roast-chicken');
    expect(options).not.toContain('mushroom-pasta');
    expect(options).not.toContain('seasonal-box');
    expect(options).not.toContain('pumpkin-box');
    expect(replaceMeal(request, allocation.assignments, 'guest-1', 'roast-chicken', menu).allocation).toBeUndefined();
    expect(replaceMeal(request, allocation.assignments, 'guest-1', 'seasonal-box', menu).allocation).toBeUndefined();
    expect(replacementOptions({ ...request.attendees[0], confirmed: false }, allocation.assignments, menu)).toEqual([]);
  });

  it('releases only the selected guest’s current quantity and excludes stock held by others', () => {
    const { request } = setup(2);
    const scarce = menu.slice(0, 2).map(item => ({ ...item, stock: 1 }));
    const assignments: Assignment[] = [{ attendeeId: 'guest-1', itemId: 'ginger-tofu' }, { attendeeId: 'guest-2', itemId: 'chickpea-bowl' }];
    expect(replacementOptions(request.attendees[0], assignments, scarce).map(m => m.id)).toEqual(['ginger-tofu']);
    expect(replacementOptions(request.attendees[1], assignments, scarce).map(m => m.id)).toEqual(['chickpea-bowl']);
    expect(replaceMeal(request, assignments, 'guest-1', 'ginger-tofu', scarce).ok).toBe(true);
    expect(replaceMeal(request, assignments, 'guest-1', 'chickpea-bowl', scarce).ok).toBe(false);
  });

  it('keeps an over-budget edit visible, blocks validation, and restores validity after correction', () => {
    const { request, allocation } = setup();
    request.budgetCents = 48800;
    // Options are not filtered by price: the organiser must be able to make multi-step edits.
    expect(replacementOptions(request.attendees[3], allocation.assignments, menu).some(m => m.id === 'roast-chicken')).toBe(true);
    const over = replaceMeal(request, allocation.assignments, 'guest-4', 'roast-chicken', menu);
    expect(over.ok).toBe(false);
    expect(over.allocation!.totalCents - request.budgetCents).toBe(1000);
    expect(validateAllocation(request, over.allocation!.assignments, menu).ok).toBe(false);
    const corrected = replaceMeal(request, over.allocation!.assignments, 'guest-4', 'ginger-tofu', menu);
    expect(corrected.ok).toBe(true);
    expect(corrected.allocation!.totalCents).toBe(48800);
  });

  it('does not return priced allocations for structural errors', () => {
    const { request, allocation } = setup();
    const invalid = allocation.assignments.map(a => ({ ...a, attendeeId: 'guest-1' }));
    const result = validateAllocation(request, invalid, menu);
    expect(result.ok).toBe(false);
    expect(result.allocation).toBeUndefined();
  });
});

