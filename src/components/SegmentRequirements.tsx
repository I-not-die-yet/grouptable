'use client';
import { requirementLabels, requirements } from '@/lib/domain';
import { LIMITS } from '@/lib/limits';
import { newSegment, requirementIssues, segmentCoverage, type Segment, type SegmentRequest } from '@/lib/segments';

type Props = { request: SegmentRequest; onChange: (next: SegmentRequest) => void; disabled: boolean };
export default function SegmentRequirements({ request, onChange, disabled }: Props) {
  const coverage = segmentCoverage(request);
  const patch = (id: string, change: Partial<Segment>) => onChange({ ...request, exclusiveConfirmed: false, segments: request.segments.map(s => s.id === id ? { ...s, ...change, confirmed: false } : s) });
  const confirm = (id: string) => onChange({ ...request, segments: request.segments.map(s => s.id === id && !s.unresolved.length ? { ...s, confirmed: true } : s) });
  return <fieldset className="plain-fieldset" disabled={disabled}>
    <div className="row-between guest-heading"><h3>Dietary groups</h3><span className="subtle">Up to {LIMITS.segments} groups</span></div>
    <div className={`coverage ${coverage.excess ? 'coverage-error' : ''}`} aria-live="polite">
      <strong>{coverage.total} / {request.headcount} people grouped</strong>
      <span>{coverage.confirmed} people have confirmed requirements.</span>
      {coverage.shortfall > 0 && <p>Requirements not confirmed: {coverage.shortfall} people</p>}
      {coverage.excess > 0 && <p>Segment counts exceed the event headcount by {coverage.excess}. Count each person once.</p>}
    </div>
    <p className="text-label">Put each person in one group.</p><details className="inline-help"><summary>Grouping help</summary><p>Combine overlapping needs in the same group, such as vegetarian and dairy-free. Missing replies stay unconfirmed. This demo supports 1–{LIMITS.headcount} people; menu stock can limit availability.</p></details>
    {!request.segments.length && <div className="segment-empty"><p>Add a group, or import dietary replies above.</p></div>}
    {request.segments.map((segment, index) => <article className="segment-card" key={segment.id}>
      <div className="segment-edit-heading"><label>Group name<input type="text" maxLength={100} value={segment.label} aria-label={`Name for group ${index + 1}`} onChange={e => patch(segment.id, { label: e.target.value })} /></label><label>People<input type="number" min="1" max={LIMITS.headcount} step="1" value={segment.headcount || ''} aria-label={`People in ${segment.label}`} onChange={e => patch(segment.id, { headcount: Number(e.target.value) })} /></label><button className="text-button" aria-label={`Remove ${segment.label}`} onClick={() => onChange({ ...request, exclusiveConfirmed: false, segments: request.segments.filter(s => s.id !== segment.id) })}>Remove</button></div>
      <div className="restrictions">{requirements.map(rule => <label className="check-chip" key={rule}><input type="checkbox" checked={segment.requirements.includes(rule)} aria-label={`${requirementLabels[rule]} for ${segment.label}`} onChange={e => patch(segment.id, { requirements: e.target.checked ? [...segment.requirements, rule] : segment.requirements.filter(r => r !== rule) })} />{requirementLabels[rule]}</label>)}</div>
      {segment.sources.length > 0 && <details className="source-evidence"><summary>Review {segment.sources.length} source excerpt{segment.sources.length === 1 ? '' : 's'}</summary>{segment.sources.map((source, i) => <blockquote key={i}>{source}</blockquote>)}</details>}
      {!!segment.unresolved.length && <div className="segment-questions"><p>Resolve questions before confirming. Check unsupported needs with the supplier.</p><ul>{segment.unresolved.map((question, i) => <li key={i}><span>{question}</span><button className="text-button" aria-label={`Resolve question ${i + 1} for ${segment.label}`} onClick={() => patch(segment.id, { unresolved: segment.unresolved.filter((_, j) => i !== j) })}>Mark resolved</button></li>)}</ul></div>}
      <div className="row-between"><button className="button small secondary" disabled={segment.confirmed || segment.unresolved.length > 0 || !segment.label.trim() || !Number.isInteger(segment.headcount) || segment.headcount < 1 || segment.headcount > LIMITS.headcount} onClick={() => confirm(segment.id)}>{segment.confirmed ? 'Confirmed' : segment.requirements.length ? `Confirm requirements for ${segment.headcount || 0} people` : `I confirm ${segment.headcount || 0} people have no known dietary restrictions`}</button>{!segment.confirmed && <span className="status">Needs review</span>}</div>
    </article>)}
    <button className="button secondary" disabled={request.segments.length >= LIMITS.segments} onClick={() => onChange({ ...request, exclusiveConfirmed: false, segments: [...request.segments, newSegment(`segment-${crypto.randomUUID()}`, `Group ${request.segments.length + 1}`)] })}>Add group</button>
    <label className="exclusive-confirm"><input type="checkbox" checked={request.exclusiveConfirmed} onChange={e => onChange({ ...request, exclusiveConfirmed: e.target.checked })} /><span>Each person is counted once.</span></label>
  </fieldset>;
}

export const canAllocateSegments = (request: SegmentRequest) => requirementIssues(request).length === 0;
