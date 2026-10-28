import { z } from 'zod';
import { requirements, type MenuItem } from './domain';
import { LIMITS } from './limits';

const uniqueRequirements = z.array(z.enum(requirements)).max(requirements.length).refine(values => new Set(values).size === values.length, 'Requirements must be unique.');
export const segmentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
  label: z.string().trim().min(1).max(100),
  headcount: z.number().int().min(1).max(LIMITS.headcount),
  requirements: uniqueRequirements,
  unresolved: z.array(z.string().min(1).max(300)).max(100),
  confirmed: z.boolean(),
  sources: z.array(z.string().min(1).max(8000)).max(LIMITS.headcount),
}).strict();
export type Segment = z.infer<typeof segmentSchema>;
export const segmentRequestSchema = z.object({
  version: z.literal(2), headcount: z.number().int().min(1).max(LIMITS.headcount),
  budgetCents: z.number().int().min(1).max(100_000_000), currency: z.literal('HKD'), deliveryCents: z.literal(8000),
  revision: z.number().int().nonnegative(), exclusiveConfirmed: z.boolean(),
  segments: z.array(segmentSchema).max(LIMITS.segments),
}).strict().superRefine((request, ctx) => {
  if (new Set(request.segments.map(s => s.id)).size !== request.segments.length) ctx.addIssue({ code: 'custom', message: 'Segment IDs must be unique.' });
});
export type SegmentRequest = z.infer<typeof segmentRequestSchema>;
export const segmentAssignmentSchema = z.object({
  segmentId: z.string().min(1).max(80), itemId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(LIMITS.headcount),
}).strict();
export type SegmentAssignment = z.infer<typeof segmentAssignmentSchema>;
export type SegmentAllocation = { assignments: SegmentAssignment[]; subtotalCents: number; deliveryCents: number; totalCents: number };
export type SegmentIssue = { code: string; message: string; segmentId?: string };
export type SegmentValidation = { ok: boolean; allocation: SegmentAllocation; issues: SegmentIssue[] };
export type SegmentResult = { ok: true; allocation: SegmentAllocation; searched: number } | { ok: false; code: 'UNRESOLVED' | 'INFEASIBLE' | 'SEARCH_LIMIT'; message: string; searched: number };
export const isSegmentRequest = (request: unknown): request is SegmentRequest => !!request && typeof request === 'object' && 'version' in request && request.version === 2;
export function newSegmentRequest(headcount = 6): SegmentRequest {
  return { version: 2, headcount, budgetCents: headcount <= 6 ? 60000 : headcount * 8500 + 8000, currency: 'HKD', deliveryCents: 8000, revision: 0, exclusiveConfirmed: false, segments: [] };
}
export function newSegment(id: string, label = 'New segment'): Segment {
  return { id, label, headcount: 1, requirements: [], unresolved: [], confirmed: false, sources: [] };
}
export function segmentCoverage(request: SegmentRequest) {
  const total = request.segments.reduce((sum, s) => sum + (Number.isInteger(s.headcount) && s.headcount > 0 ? s.headcount : 0), 0);
  return { total, shortfall: Math.max(0, request.headcount - total), excess: Math.max(0, total - request.headcount), confirmed: request.segments.reduce((sum, s) => sum + (s.confirmed && !s.unresolved.length ? s.headcount : 0), 0) };
}
export function requirementIssues(request: SegmentRequest): SegmentIssue[] {
  const issues: SegmentIssue[] = [];
  const shape = segmentRequestSchema.safeParse(request);
  if (!shape.success) {
    for (const issue of shape.error.issues) {
      const index = issue.path[0] === 'segments' && typeof issue.path[1] === 'number' ? issue.path[1] : undefined;
      issues.push({ code: 'INVALID_REQUIREMENTS', segmentId: index === undefined ? undefined : request.segments[index]?.id, message: issue.message });
    }
    return issues;
  }
  const coverage = segmentCoverage(request);
  if (coverage.shortfall) issues.push({ code: 'SHORTFALL', message: `Requirements not confirmed: ${coverage.shortfall} people.` });
  if (coverage.excess) issues.push({ code: 'EXCESS', message: `Segment counts exceed the event headcount by ${coverage.excess}. Count each person once.` });
  if (!request.exclusiveConfirmed) issues.push({ code: 'OVERLAP', message: 'Confirm that the segments are mutually exclusive and each person is counted once.' });
  for (const segment of request.segments) {
    if (!segment.confirmed) issues.push({ code: 'UNCONFIRMED', segmentId: segment.id, message: `Confirm requirements for ${segment.label}.` });
    for (const message of segment.unresolved) issues.push({ code: 'UNRESOLVED', segmentId: segment.id, message });
  }
  return issues;
}
export const segmentEligible = (segment: Pick<Segment, 'requirements'>, item: MenuItem) => item.stock > 0 && segment.requirements.every(r => item.attributes[r] === 'yes');
