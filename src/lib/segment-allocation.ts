import { type MenuItem } from './domain';
import { LIMITS } from './limits';
import { requirementIssues, segmentEligible, type Segment, type SegmentAllocation, type SegmentAssignment, type SegmentIssue, type SegmentRequest, type SegmentResult, type SegmentValidation } from './segments';

export function validateSegments(request: SegmentRequest, assignments: SegmentAssignment[], menu: MenuItem[]): SegmentValidation {
  const issues: SegmentIssue[] = requirementIssues(request);
  const segmentCounts = new Map<string, number>();
  const itemCounts = new Map<string, number>();
  const pairs = new Set<string>();
  let subtotalCents = 0;
  if (assignments.length > LIMITS.assignmentLines) issues.push({ code: 'LINES', message: 'Too many meal lines.' });
  for (const line of assignments) {
    const segment = request.segments.find(s => s.id === line.segmentId);
    const item = menu.find(m => m.id === line.itemId);
    const pair = JSON.stringify([line.segmentId, line.itemId]);
    if (pairs.has(pair)) issues.push({ code: 'DUPLICATE', segmentId: line.segmentId, message: 'Combine duplicate meal types into one quantity per segment.' });
    pairs.add(pair);
    if (!segment || !item) { issues.push({ code: 'UNKNOWN', segmentId: segment?.id, message: 'A meal line references an unknown segment or menu item.' }); continue; }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > LIMITS.headcount) { issues.push({ code: 'QUANTITY', segmentId: segment.id, message: `Enter a positive whole quantity from 1 to ${LIMITS.headcount}.` }); continue; }
    if (!segmentEligible(segment, item)) issues.push({ code: 'INCOMPATIBLE', segmentId: segment.id, message: `${item.name} does not have confirmed compatible data for ${segment.label}.` });
    segmentCounts.set(segment.id, (segmentCounts.get(segment.id) ?? 0) + line.quantity);
    itemCounts.set(item.id, (itemCounts.get(item.id) ?? 0) + line.quantity);
    subtotalCents += item.priceCents * line.quantity;
  }
  for (const segment of request.segments) {
    const count = segmentCounts.get(segment.id) ?? 0;
    if (count !== segment.headcount) {
      const difference = Math.abs(count - segment.headcount);
      issues.push({ code: 'SEGMENT_COUNT', segmentId: segment.id, message: count < segment.headcount ? `${difference} more meal${difference === 1 ? '' : 's'} needed for ${segment.label}.` : `${difference} extra meal${difference === 1 ? '' : 's'} for ${segment.label}.` });
    }
  }
  for (const [id, quantity] of itemCounts) {
    const item = menu.find(m => m.id === id)!;
    if (quantity > item.stock) {
      const affected = new Set(assignments.filter(a => a.itemId === id).map(a => a.segmentId));
      for (const segmentId of affected) issues.push({ code: 'STOCK', segmentId, message: `${item.name}: ${quantity} ordered across all segments; ${item.stock} available.` });
    }
  }
  const allocation = { assignments, subtotalCents, deliveryCents: request.deliveryCents, totalCents: subtotalCents + request.deliveryCents };
  if (allocation.totalCents > request.budgetCents) issues.push({ code: 'BUDGET', message: 'The total including delivery exceeds the budget.' });
  return { ok: issues.length === 0, allocation, issues };
}

export function segmentOptions(segment: Segment, assignments: SegmentAssignment[], menu: MenuItem[]) {
  if (!segment.confirmed || segment.unresolved.length) return [];
  const used = new Map<string, number>();
  for (const line of assignments) if (line.segmentId !== segment.id && Number.isInteger(line.quantity) && line.quantity > 0) used.set(line.itemId, (used.get(line.itemId) ?? 0) + line.quantity);
  return menu.filter(item => segmentEligible(segment, item)).map(item => ({ item, available: Math.max(0, item.stock - (used.get(item.id) ?? 0)) })).filter(option => option.available > 0);
}

// Replace only this segment's explicit lines. Partial/over-budget edits remain visible for correction.
export function updateSegmentMeals(request: SegmentRequest, assignments: SegmentAssignment[], segmentId: string, lines: { itemId: string; quantity: number }[], menu: MenuItem[]): SegmentValidation {
  if (!request.segments.some(s => s.id === segmentId)) return { ...validateSegments(request, assignments, menu), ok: false, issues: [{ code: 'UNKNOWN', message: 'Unknown segment.' }] };
  const next = [...assignments.filter(a => a.segmentId !== segmentId), ...lines.map(line => ({ ...line, segmentId }))];
  return validateSegments(request, next, menu);
}

export function allocateSegments(request: SegmentRequest, menu: MenuItem[], limit: number = LIMITS.searchStates): SegmentResult {
  const unresolved = requirementIssues(request);
  if (unresolved.length) return { ok: false, code: 'UNRESOLVED', message: unresolved[0].message, searched: 0 };
  const sorted = [...menu].sort((a, b) => a.priceCents - b.priceCents || a.id.localeCompare(b.id));
  const groups = request.segments.map(segment => ({ segment, items: sorted.filter(item => segmentEligible(segment, item)) })).sort((a, b) => a.items.length - b.items.length || b.segment.headcount - a.segment.headcount);
  if (groups.some(g => g.items.reduce((sum, item) => sum + item.stock, 0) < g.segment.headcount) || sorted.reduce((sum, item) => sum + item.stock, 0) < request.headcount) return { ok: false, code: 'INFEASIBLE', message: 'The menu does not have enough compatible stock for this group.', searched: 0 };
  const stock = new Map(sorted.map(item => [item.id, item.stock]));
  const assignments: SegmentAssignment[] = [];
  let searched = 0; let exceeded = false;
  function tick() { if (++searched > limit) { exceeded = true; return false; } return true; }
  function search(index: number, spent: number): boolean {
    if (!tick()) return false;
    if (index === groups.length) return true;
    const group = groups[index];
    function counts(itemIndex: number, remaining: number, cost: number, lines: SegmentAssignment[]): boolean {
      if (!tick() || cost + request.deliveryCents > request.budgetCents) return false;
      if (!remaining) {
        const start = assignments.length; assignments.push(...lines);
        if (search(index + 1, cost)) return true;
        assignments.length = start; return false;
      }
      if (itemIndex === group.items.length) return false;
      const item = group.items[itemIndex];
      if (cost + remaining * item.priceCents + request.deliveryCents > request.budgetCents) return false;
      if (group.items.slice(itemIndex).reduce((sum, i) => sum + (stock.get(i.id) ?? 0), 0) < remaining) return false;
      const available = stock.get(item.id)!;
      for (let quantity = Math.min(remaining, available); quantity >= 0; quantity--) {
        stock.set(item.id, available - quantity);
        const next = quantity ? [...lines, { segmentId: group.segment.id, itemId: item.id, quantity }] : lines;
        const found = counts(itemIndex + 1, remaining - quantity, cost + quantity * item.priceCents, next);
        stock.set(item.id, available);
        if (found) return true;
        if (exceeded) return false;
      }
      return false;
    }
    return counts(0, group.segment.headcount, spent, []);
  }
  if (!search(0, 0)) return { ok: false, code: exceeded ? 'SEARCH_LIMIT' : 'INFEASIBLE', message: exceeded ? 'No allocation found within 50,000 search states. Simplify the segments or review menu availability; this is not proof of infeasibility.' : 'No allocation fits the confirmed segments, shared stock and total budget.', searched };
  assignments.sort((a, b) => request.segments.findIndex(s => s.id === a.segmentId) - request.segments.findIndex(s => s.id === b.segmentId));
  const checked = validateSegments(request, assignments, menu);
  if (!checked.ok) throw new Error('Segment allocation failed independent validation.');
  return { ok: true, allocation: checked.allocation, searched };
}

export function consolidateSegmentItems(allocation: SegmentAllocation) {
  const counts = new Map<string, number>();
  for (const line of allocation.assignments) counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + line.quantity);
  return counts;
}
