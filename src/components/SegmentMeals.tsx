'use client';
import { money, requirementLabels, type MenuItem } from '@/lib/domain';
import { LIMITS } from '@/lib/limits';
import { segmentOptions, validateSegments } from '@/lib/segment-allocation';
import type { SegmentAllocation, SegmentRequest } from '@/lib/segments';

type Line = { itemId: string; quantity: number };
type Props = { request: SegmentRequest; allocation: SegmentAllocation; menu: MenuItem[]; onChange?: (segmentId: string, lines: Line[]) => void; disabled?: boolean };
export default function SegmentMeals({ request, allocation, menu, onChange, disabled = false }: Props) {
  const validation = onChange ? validateSegments(request, allocation.assignments, menu) : null;
  return <div className="segment-packing">{request.segments.map(segment => {
    const lines = allocation.assignments.filter(line => line.segmentId === segment.id);
    const options = segmentOptions(segment, allocation.assignments, menu);
    const assigned = lines.reduce((sum, line) => sum + (Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0), 0);
    const subtotal = lines.reduce((sum, line) => sum + (Number.isInteger(line.quantity) && line.quantity > 0 ? (menu.find(m => m.id === line.itemId)?.priceCents ?? 0) * line.quantity : 0), 0);
    const availableToAdd = options.filter(option => !lines.some(line => line.itemId === option.item.id));
    const segmentIssues = validation?.issues.filter(issue => issue.segmentId === segment.id) ?? [];
    return <section className="segment-card meal-segment" key={segment.id} data-segment-id={segment.id}>
      <div className="row-between"><h3>{segment.label}</h3><span className="counter">{segment.headcount} people</span></div>
      <p className="segment-rules">{segment.requirements.length ? segment.requirements.map(rule => requirementLabels[rule]).join(', ') : 'No known dietary restrictions — explicitly confirmed'}</p>
      <div className="meal-line-labels" aria-hidden="true"><span>Meal</span><span>Quantity</span><span>Line total</span><span /></div>
      {!lines.length && <p className="subtle">No meals assigned to this segment.</p>}
      {lines.map((line, index) => {
        const item = menu.find(m => m.id === line.itemId);
        const replacements = options.filter(option => option.item.id === line.itemId || (!lines.some(other => other.itemId === option.item.id) && option.available >= Math.max(1, line.quantity)));
        const change = (patch: Partial<Line>) => onChange?.(segment.id, lines.map((old, i) => i === index ? { ...old, ...patch } : { ...old }));
        return <div className="meal-line" key={line.itemId}>
          {onChange ? <div><select className="meal-selector" aria-label={`Meal for ${segment.label}, line ${index + 1}`} value={line.itemId} disabled={disabled} onChange={e => change({ itemId: e.target.value })}>
            {!replacements.some(option => option.item.id === line.itemId) && <option value={line.itemId} disabled>{item?.name ?? 'Unknown meal'} — unavailable</option>}
            {replacements.map(option => <option key={option.item.id} value={option.item.id}>{option.item.name} — {money(option.item.priceCents)} ({option.available} available for this segment)</option>)}
          </select>{replacements.filter(option => option.item.id !== line.itemId).length === 0 && <span className="meal-help">No alternative meal is available for this line’s requirements, quantity and shared stock. You can adjust quantities.</span>}</div> : <div><strong>{item?.name ?? line.itemId}</strong><span className="subtle">{money(item?.priceCents ?? 0)} each</span></div>}
          {onChange ? <label className="quantity-label"><span>Quantity</span><input type="number" min="1" max={LIMITS.headcount} step="1" value={line.quantity || ''} aria-label={`Quantity for ${segment.label}, ${item?.name ?? line.itemId}`} disabled={disabled} onChange={e => change({ quantity: Number(e.target.value) })} /></label> : <span className="packed-quantity">{line.quantity} meals</span>}
          <strong className="line-total">{money(Number.isInteger(line.quantity) && line.quantity > 0 ? (item?.priceCents ?? 0) * line.quantity : 0)}</strong>
          {onChange && <button className="text-button" disabled={disabled} aria-label={`Remove ${item?.name ?? line.itemId} from ${segment.label}`} onClick={() => onChange(segment.id, lines.filter((_, i) => i !== index))}>Remove</button>}
        </div>;
      })}
      {onChange && <div className="add-meal"><button className="button small secondary" disabled={disabled || !availableToAdd.length} onClick={() => onChange(segment.id, [...lines, { itemId: availableToAdd[0].item.id, quantity: 1 }])}>Add meal type to {segment.label}</button>{!availableToAdd.length && <span className="subtle">All compatible available meal types are already listed, or remaining stock is exhausted.</span>}</div>}
      <div className="segment-subtotal"><span>{assigned} / {segment.headcount} meals assigned</span><strong>Segment subtotal {money(subtotal)}</strong></div>
      {segmentIssues.length > 0 && <ul className="segment-errors" aria-live="polite">{segmentIssues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
    </section>;
  })}</div>;
}
