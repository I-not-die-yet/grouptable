import { mealRequestSchema, requirementLabels, type Allocation, type MealRequest } from './domain';
import { LIMITS } from './limits';
import { newSegmentRequest, segmentRequestSchema, type SegmentAllocation, type SegmentRequest } from './segments';

export type DraftConversion = { ok: true; request: SegmentRequest; message: string } | { ok: false; message: string; event?: { headcount: number; budgetCents: number } };
// Pure conversion only. Never mutates the old draft, order, payment mapping or storage key.
export function convertLegacyRequest(raw: unknown): DraftConversion {
  const parsed = mealRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'The older draft could not be converted safely. Its original data has been preserved; review the saved draft before entering segments.' };
  const old = parsed.data;
  const event = { headcount: old.headcount, budgetCents: old.budgetCents };
  if (old.attendees.some(a => !a.confirmed || a.unresolved.length)) return { ok: false, event, message: 'The older draft has unconfirmed or unresolved replies. It has been preserved without inventing segment counts. Review it and enter confirmed segments manually.' };
  const groups = new Map<string, SegmentRequest['segments'][number]>();
  for (const person of old.attendees) {
    const requirements = [...person.requirements].sort(); const key = requirements.join('|');
    const segment = groups.get(key) ?? { id: `legacy-segment-${groups.size + 1}`, label: requirements.length ? requirements.map(r => requirementLabels[r]).join(' + ') : 'No known dietary restrictions', headcount: 0, requirements, confirmed: true, unresolved: [], sources: [] };
    segment.headcount++;
    if (person.source && !segment.sources.includes(person.source)) segment.sources.push(person.source);
    groups.set(key, segment);
  }
  if (groups.size > LIMITS.segments) return { ok: false, event, message: `The older draft needs ${groups.size} segments, above the ${LIMITS.segments}-segment limit. The original is preserved for manual review.` };
  const request: SegmentRequest = { ...newSegmentRequest(old.headcount), budgetCents: old.budgetCents, revision: old.revision + 1, exclusiveConfirmed: true, segments: [...groups.values()] };
  return { ok: true, request, message: 'Confirmed guest entries were grouped into mutually exclusive segments. The original guest-based draft remains preserved.' };
}

export function restoreDraft(raw: unknown): DraftConversion {
  if (!raw || typeof raw !== 'object' || !('request' in raw)) return { ok: false, message: 'This saved draft has an unsupported format and has been preserved.' };
  const parsed = segmentRequestSchema.safeParse(raw.request);
  if (parsed.success) return { ok: true, request: parsed.data, message: '' };
  return convertLegacyRequest(raw.request);
}

// Used only after an explicit edit of an old order, not to rewrite its saved snapshot.
export function convertLegacyAllocation(oldRequest: MealRequest, oldAllocation: Allocation, next: SegmentRequest): SegmentAllocation {
  const byRequirements = new Map(next.segments.map(s => [[...s.requirements].sort().join('|'), s.id]));
  const counts = new Map<string, { segmentId: string; itemId: string; quantity: number }>();
  for (const line of oldAllocation.assignments) {
    const attendee = oldRequest.attendees.find(a => a.id === line.attendeeId);
    const segmentId = attendee ? byRequirements.get([...attendee.requirements].sort().join('|')) : undefined;
    if (!segmentId) throw new Error('The old allocation cannot be grouped safely.');
    const key = JSON.stringify([segmentId, line.itemId]);
    const item = counts.get(key) ?? { segmentId, itemId: line.itemId, quantity: 0 };
    item.quantity++; counts.set(key, item);
  }
  return { ...oldAllocation, assignments: [...counts.values()] };
}
