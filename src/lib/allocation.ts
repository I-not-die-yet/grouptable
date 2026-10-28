import { type Allocation, type AllocationResult, type Assignment, type Attendee, type MealRequest, type MenuItem } from './domain';
import { LIMITS } from './limits';

export const eligible = (a: Attendee, item: MenuItem) => item.stock > 0 && a.requirements.every(r => item.attributes[r] === 'yes');

export type AllocationValidation = { ok: true; allocation: Allocation } | { ok: false; message: string; allocation?: Allocation };

// Release this guest's current meal before evaluating available replacement quantities.
// Budget is deliberately not a filter: organisers may make several edits to get back within budget.
export function replacementOptions(guest: Attendee, assignments: Assignment[], menu: MenuItem[]): MenuItem[] {
  if (!guest.confirmed || guest.unresolved.length) return [];
  const otherCounts = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.attendeeId !== guest.id) otherCounts.set(assignment.itemId, (otherCounts.get(assignment.itemId) ?? 0) + 1);
  }
  return menu.filter(item => eligible(guest, item) && (otherCounts.get(item.id) ?? 0) < item.stock);
}

export function replaceMeal(request: MealRequest, assignments: Assignment[], guestId: string, itemId: string, menu: MenuItem[]): AllocationValidation {
  const guest = request.attendees.find(a => a.id === guestId);
  if (!guest || !replacementOptions(guest, assignments, menu).some(item => item.id === itemId)) {
    return { ok: false, message: 'This meal is incompatible with the guest’s confirmed requirements or has no remaining quantity.' };
  }
  const next = assignments.map(a => a.attendeeId === guestId ? { ...a, itemId } : a);
  return validateAllocation(request, next, menu);
}

// This independently checks proposed assignments, including assignments supplied by a browser.
export function validateAllocation(request: MealRequest, assignments: Assignment[], menu: MenuItem[]): AllocationValidation {
  if (request.attendees.some(a => !a.confirmed || a.unresolved.length)) return { ok: false, message: 'Confirm every guest and resolve open questions first.' };
  if (assignments.length !== request.headcount || new Set(assignments.map(a => a.attendeeId)).size !== request.headcount) return { ok: false, message: 'Each guest needs exactly one meal.' };
  const counts = new Map<string, number>();
  let subtotalCents = 0;
  for (const assignment of assignments) {
    const guest = request.attendees.find(a => a.id === assignment.attendeeId);
    const item = menu.find(m => m.id === assignment.itemId);
    if (!guest || !item || !eligible(guest, item)) return { ok: false, message: 'An assignment has an unknown item, guest, or incompatible meal.' };
    const count = (counts.get(item.id) ?? 0) + 1;
    if (count > item.stock) return { ok: false, message: 'The order exceeds demonstration stock.' };
    counts.set(item.id, count); subtotalCents += item.priceCents;
  }
  const totalCents = subtotalCents + request.deliveryCents;
  const allocation = { assignments, subtotalCents, deliveryCents: request.deliveryCents, totalCents };
  if (totalCents > request.budgetCents) return { ok: false, message: 'The order exceeds the total budget, including delivery.', allocation };
  return { ok: true, allocation };
}

export function allocate(request: MealRequest, menu: MenuItem[], limit: number = LIMITS.searchStates): AllocationResult {
  let searched = 0;
  if (request.attendees.some(a => !a.confirmed || a.unresolved.length)) return { ok: false, code: 'UNRESOLVED', message: 'Confirm every guest, including people who did not reply.', searched };
  const sorted = [...menu].sort((a, b) => a.priceCents - b.priceCents || a.id.localeCompare(b.id));
  const groups = new Map<string, { guests: Attendee[]; items: MenuItem[] }>();
  for (const guest of request.attendees) {
    const items = sorted.filter(item => eligible(guest, item));
    if (!items.length) return { ok: false, code: 'INFEASIBLE', message: `${guest.id.replace('guest-', 'Guest ')} has no meal with confirmed compatible data.`, searched };
    const key = items.map(i => i.id).join('|');
    const group = groups.get(key) ?? { guests: [], items }; group.guests.push(guest); groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => a.items.length - b.items.length);
  const stock = new Map(sorted.map(i => [i.id, i.stock]));
  const assignments: Assignment[] = [];
  let exceeded = false;
  function tick() { if (++searched > limit) { exceeded = true; return false; } return true; }
  function groupSearch(index: number, cost: number): boolean {
    if (!tick()) return false;
    if (index === ordered.length) return true;
    const group = ordered[index];
    function counts(itemIndex: number, remaining: number, spent: number, picked: string[]): boolean {
      if (!tick()) return false;
      if (spent + request.deliveryCents > request.budgetCents) return false;
      if (!remaining) {
        const start = assignments.length;
        picked.forEach((id, i) => assignments.push({ attendeeId: group.guests[i].id, itemId: id }));
        if (groupSearch(index + 1, spent)) return true;
        assignments.length = start; return false;
      }
      if (itemIndex === group.items.length) return false;
      const item = group.items[itemIndex];
      if (spent + remaining * item.priceCents + request.deliveryCents > request.budgetCents) return false;
      if (group.items.slice(itemIndex).reduce((sum, i) => sum + (stock.get(i.id) ?? 0), 0) < remaining) return false;
      const available = stock.get(item.id)!;
      for (let count = Math.min(remaining, available); count >= 0; count--) {
        stock.set(item.id, available - count);
        const result = counts(itemIndex + 1, remaining - count, spent + item.priceCents * count, [...picked, ...Array<string>(count).fill(item.id)]);
        stock.set(item.id, available);
        if (result) return true;
        if (exceeded) return false;
      }
      return false;
    }
    return counts(0, group.guests.length, cost, []);
  }
  if (!groupSearch(0, 0)) return { ok: false, code: exceeded ? 'SEARCH_LIMIT' : 'INFEASIBLE', message: exceeded ? 'No allocation found within the search limit. Simplify requirements or reduce the group size.' : 'No order fits these requirements, available quantities and total budget. Increase the budget or review the requirements.', searched };
  assignments.sort((a, b) => Number(a.attendeeId.slice(6)) - Number(b.attendeeId.slice(6)));
  const checked = validateAllocation(request, assignments, menu);
  if (!checked.ok) throw new Error('Allocation failed independent validation.');
  return { ok: true, allocation: checked.allocation, searched };
}
