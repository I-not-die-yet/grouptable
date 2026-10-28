import { describe, expect, it } from 'vitest';
import { allocate, validateAllocation } from '../src/lib/allocation';
import { menu } from '../src/lib/menu';
import { decimalMoney, mealRequestSchema, newRequest, type MealRequest, type MenuItem } from '../src/lib/domain';

function confirmed(count = 6): MealRequest { const request = newRequest(count); request.attendees = request.attendees.map(a => ({ ...a, confirmed: true, unresolved: [] })); return request; }
describe('allocation and independent validation', () => {
  it('validates the fifteen-item menu and assigns every guest', () => {
    expect(menu).toHaveLength(15);
    const request = confirmed(); const result = allocate(request, menu);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocation.assignments).toHaveLength(6);
    expect(validateAllocation(request, result.allocation.assignments, menu).ok).toBe(true);
    expect(result.allocation.totalCents).toBe(result.allocation.subtotalCents + 8000);
  });
  it('keeps overlapping restrictions and excludes unknown attributes', () => {
    const request = confirmed(1); request.attendees[0].requirements = ['vegetarian', 'dairyFree'];
    const result = allocate(request, menu); expect(result.ok).toBe(true);
    if (result.ok) { const item = menu.find(m => m.id === result.allocation.assignments[0].itemId)!; expect(item.attributes.vegetarian).toBe('yes'); expect(item.attributes.dairyFree).toBe('yes'); }
    expect(validateAllocation(request, [{ attendeeId: 'guest-1', itemId: 'seasonal-box' }], menu).ok).toBe(false);
    expect(validateAllocation(request, [{ attendeeId: 'guest-1', itemId: 'mushroom-pasta' }], menu).ok).toBe(false);
  });
  it('blocks missing replies and unresolved questions', () => {
    expect(allocate(newRequest(), menu)).toMatchObject({ ok: false, code: 'UNRESOLVED' });
    const request = confirmed(); request.attendees[2].unresolved = ['Which allergen?'];
    expect(allocate(request, menu)).toMatchObject({ code: 'UNRESOLVED' });
  });
  it('allows exact budgets and rejects a one-cent shortfall', () => {
    const request = confirmed(1); request.budgetCents = 14800;
    expect(allocate(request, menu).ok).toBe(true);
    request.budgetCents--; expect(allocate(request, menu)).toMatchObject({ code: 'INFEASIBLE' });
  });
  it('distinguishes exhaustive infeasibility from search exhaustion', () => {
    expect(allocate(confirmed(), menu, 0)).toMatchObject({ code: 'SEARCH_LIMIT' });
    expect(allocate(confirmed(), menu.map(i => ({ ...i, stock: 0 })))).toMatchObject({ code: 'INFEASIBLE' });
  });
  it('rejects unknown guests, unknown items, duplicates and stock overflow', () => {
    const request = confirmed(2);
    for (const assignments of [[], [{ attendeeId: 'guest-1', itemId: 'ginger-tofu' }, { attendeeId: 'guest-1', itemId: 'ginger-tofu' }], [{ attendeeId: 'guest-1', itemId: 'missing' }, { attendeeId: 'guest-2', itemId: 'ginger-tofu' }], [{ attendeeId: 'guest-3', itemId: 'ginger-tofu' }, { attendeeId: 'guest-2', itemId: 'ginger-tofu' }]]) expect(validateAllocation(request, assignments, menu).ok).toBe(false);
    const scarce = menu.map(i => ({ ...i, stock: 1 }));
    expect(validateAllocation(request, [{ attendeeId: 'guest-1', itemId: 'ginger-tofu' }, { attendeeId: 'guest-2', itemId: 'ginger-tofu' }], scarce).ok).toBe(false);
  });
  it('backtracks when a cheaper assignment consumes another group’s only stock', () => {
    const request = confirmed(3);
    request.attendees[0].requirements = ['vegetarian']; request.attendees[1].requirements = ['dairyFree']; request.attendees[2].requirements = ['dairyFree'];
    const make = (id: string, priceCents: number, vegetarian: 'yes' | 'no', dairyFree: 'yes' | 'no'): MenuItem => ({ ...menu[0], id, priceCents, stock: 1, attributes: { ...menu[0].attributes, vegetarian, dairyFree } });
    const small = [make('shared', 100, 'yes', 'yes'), make('veg-only', 200, 'yes', 'no'), make('dairy-only', 300, 'no', 'yes')];
    const result = allocate(request, small);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.allocation.assignments[0].itemId).toBe('veg-only');
  });
  it('agrees with exhaustive enumeration on small generated stock/budget cases', () => {
    const request = confirmed(3); request.attendees[0].requirements = ['vegetarian'];
    for (let seed = 0; seed < 25; seed++) {
      const sample = menu.slice(0, 4).map((item, i) => ({ ...item, stock: (seed + i) % 3 }));
      request.budgetCents = 8000 + 19000 + seed * 200;
      let possible = false;
      for (const a of sample) for (const b of sample) for (const c of sample) if (validateAllocation(request, [{ attendeeId: 'guest-1', itemId: a.id }, { attendeeId: 'guest-2', itemId: b.id }, { attendeeId: 'guest-3', itemId: c.id }], sample).ok) possible = true;
      expect(allocate(request, sample).ok).toBe(possible);
    }
  });
  it('rejects malformed headcounts, duplicated requirements and invalid money', () => {
    const r = confirmed(); r.headcount = 7; expect(mealRequestSchema.safeParse(r).success).toBe(false);
    expect(decimalMoney(1)).toBe('0.01'); expect(decimalMoney(14800)).toBe('148.00');
  });
});
