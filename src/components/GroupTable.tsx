'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money, requirementLabels, type Allocation, type MealRequest, type MenuItem } from '@/lib/domain';
import { segmentExamples as examples } from '@/lib/segment-examples';
import type { PublicAnyOrder, PublicSegmentOrder } from '@/lib/store';
import { LIMITS } from '@/lib/limits';
import { isSegmentRequest, newSegmentRequest, segmentCoverage, segmentRequestSchema, type Segment, type SegmentAllocation, type SegmentRequest } from '@/lib/segments';
import { convertLegacyAllocation, convertLegacyRequest, restoreDraft } from '@/lib/segment-compat';
import { updateSegmentMeals, validateSegments } from '@/lib/segment-allocation';
import SegmentRequirements, { canAllocateSegments } from './SegmentRequirements';
import SegmentMeals from './SegmentMeals';
import TastePreferences, { TasteEvidence } from './TastePreferences';
import type { Restaurant, TasteProfile } from '@/lib/taste';
import type { AgentResult } from '@/lib/agent-types';

type Props = { menu: MenuItem[]; aiMode: 'fixture' | 'live'; paymentMode: 'fixture' | 'sandbox'; qlooMode: 'fixture' | 'live'; agentMode: 'fixture' | 'live' };
type Step = 'requirements' | 'review' | 'payment' | 'confirmation';
const key = 'grouptable-draft-v2';
const legacyKey = 'grouptable-draft-v1';
const isSegmentOrder = (order: PublicAnyOrder): order is PublicSegmentOrder => isSegmentRequest(order.request);
const orderKey = 'grouptable-order-v1';
const label = (id: string) => `Guest ${id.slice(6).padStart(2, '0')}`;
async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(path, { method, cache: 'no-store', ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export default function GroupTable({ menu, aiMode, paymentMode, qlooMode, agentMode }: Props) {
  const [taste, setTaste] = useState<TasteProfile | null>(null);
  const [tasteSeeds, setTasteSeeds] = useState<Restaurant[]>([]);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [planning, setPlanning] = useState(false);
  const [request, setRequest] = useState<SegmentRequest>(() => newSegmentRequest());
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [allocation, setAllocation] = useState<SegmentAllocation | null>(null);
  const [order, setOrder] = useState<PublicAnyOrder | null>(null);
  const [step, setStep] = useState<Step>('requirements');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exampleId, setExampleId] = useState('aggregate-30');
  const [ready, setReady] = useState(false);
  const [returnToken, setReturnToken] = useState<string | undefined>();
  const [returned, setReturned] = useState(false);
  const [preservedDraft, setPreservedDraft] = useState('');
  const [draftWritable, setDraftWritable] = useState(true);
  const coverage = segmentCoverage(request);
  const locked = !!order && ['creating', 'capturing', 'unknown', 'pending'].includes(order.status);

  useEffect(() => {
    async function hydrate() {
      try {
        const newSaved = sessionStorage.getItem(key);
        const saved = newSaved || sessionStorage.getItem(legacyKey);
        if (saved) {
          try {
            const draft = JSON.parse(saved);
            const restored = restoreDraft(draft);
            if (restored.ok) setRequest(restored.request);
            else if (restored.event) setRequest({ ...newSegmentRequest(restored.event.headcount), budgetCents: restored.event.budgetCents });
            if (restored.message) setNotice(restored.message);
            if (typeof draft.text === 'string') setText(draft.text);
            if (Array.isArray(draft.issues)) setIssues(draft.issues.filter((i: unknown) => typeof i === 'string'));
            if (!restored.ok) { setPreservedDraft(saved); if (newSaved) setDraftWritable(false); }
          } catch {
            setPreservedDraft(saved); if (newSaved) setDraftWritable(false);
            setNotice('The previous draft could not be read safely. It is preserved; download it for review instead of guessing segment counts.');
          }
        }
        const params = new URLSearchParams(location.search);
        const id = params.get('order') || sessionStorage.getItem(orderKey);
        if (id) {
          const savedOrder = await api<PublicAnyOrder>(`/api/orders/${encodeURIComponent(id)}`);
          setOrder(savedOrder);
          if (isSegmentOrder(savedOrder)) { setRequest(savedOrder.request); setAllocation(savedOrder.allocation); }
          else {
            const converted = convertLegacyRequest(savedOrder.request);
            setRequest(converted.ok ? converted.request : { ...newSegmentRequest(savedOrder.request.headcount), budgetCents: savedOrder.request.budgetCents });
            setNotice('Saved guest-based order: its original allocation and payment details are preserved.');
          }
          setStep(savedOrder.status === 'paid' ? 'confirmation' : 'payment');
          setReturnToken(params.get('token') || undefined);
          setReturned(params.get('paypal') === 'return' || params.get('simulated') === 'approve');
          if (params.get('paypal') === 'cancel') setNotice('Payment was cancelled. No completed payment has been confirmed. You can resume checkout or edit the order.');
          sessionStorage.setItem(orderKey, savedOrder.id);
        }
      } catch { setError('A saved order could not be restored. Your draft is still available. Use the original browser session to recover its payment status.'); }
      finally { setReady(true); }
    }
    void hydrate();
  }, []);

  useEffect(() => { if (ready && draftWritable) sessionStorage.setItem(key, JSON.stringify({ request, text, issues })); }, [ready, draftWritable, request, text, issues]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'The request failed.'); }
    finally { setBusy(false); }
  }
  async function edit(next: SegmentRequest, nextAllocation: SegmentAllocation | null = null) {
    setAgentResult(null);
    if (order) {
      await api(`/api/orders/${order.id}/invalidate`, {});
      sessionStorage.removeItem(orderKey); history.replaceState({}, '', '/');
    }
    setOrder(null); setAllocation(nextAllocation); setReturned(false); setReturnToken(undefined);
    setRequest({ ...next, revision: request.revision + 1 }); setStep(nextAllocation ? 'review' : 'requirements');
  }
  function updateRequirements(next: SegmentRequest) {
    setRequest({ ...next, revision: request.revision + 1 }); setAllocation(null); setAgentResult(null);
  }
  async function editApproved() {
    if (!order) return;
    if (isSegmentOrder(order)) { await edit(order.request, order.allocation); return; }
    const converted = convertLegacyRequest(order.request);
    if (converted.ok) {
      const allocation = convertLegacyAllocation(order.request, order.allocation, converted.request);
      await edit(converted.request, allocation); setNotice(converted.message);
    } else {
      setPreservedDraft(JSON.stringify({ request: order.request, allocation: order.allocation }));
      await edit({ ...newSegmentRequest(order.request.headcount), budgetCents: order.request.budgetCents });
      setNotice(converted.message);
    }
  }
  function downloadPreserved() {
    const url = URL.createObjectURL(new Blob([preservedDraft], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'grouptable-preserved-draft.json'; link.click(); URL.revokeObjectURL(url);
  }
  function loadExample() {
    const example = examples.find(e => e.id === exampleId)!;
    void run(async () => { await edit(newSegmentRequest(example.headcount)); setText(example.text); setIssues([]); setNotice('Example loaded. Extract its segments, then review counts, evidence and requirements.'); });
  }
  async function generate() {
    await run(async () => {
      setAgentResult(null);
      if (issues.length) throw new Error('Resolve the extraction questions before generating an order.');
      const parsed = segmentRequestSchema.parse(request);
      const result = await api<{ ok: boolean; allocation?: SegmentAllocation; message?: string; code?: string }>('/api/allocate', taste ? { request: parsed, tasteId: taste.id } : parsed);
      if (!result.ok || !result.allocation) throw new Error(`${result.code}: ${result.message}`);
      setAllocation(result.allocation); setStep('review');
    });
  }
  async function plan() {
    setPlanning(true);
    await run(async () => {
      setAgentResult(null);
      const result = await api<AgentResult>('/api/agent/plan', { request: segmentRequestSchema.parse(request), restaurantIds: tasteSeeds.map(s => s.id) });
      setAgentResult(result);
      if (result.outcome === 'draft' && result.allocation) {
        setAllocation(result.allocation); setTaste(result.profile ?? null); setStep('review');
      } else setNotice(result.message);
    });
    setPlanning(false);
  }
  async function approveOrder() {
    await run(async () => {
      if (!allocation) return;
      const checked = validateSegments(request, allocation.assignments, menu);
      if (!checked.ok) throw new Error(checked.issues.map(i => i.message).join(' '));
      const saved = await api<PublicAnyOrder>('/api/orders', { request, assignments: allocation.assignments });
      if (!isSegmentOrder(saved)) throw new Error('Unexpected order format.');
      setOrder(saved); setAllocation(saved.allocation); sessionStorage.setItem(orderKey, saved.id); setStep('payment');
    });
  }
  async function checkout() {
    await run(async () => {
      if (!order) return;
      try {
        const result = await api<{ order: PublicAnyOrder; approvalUrl: string }>(`/api/orders/${order.id}/paypal`, {});
        setOrder(result.order);
        if (result.order.mode === 'fixture') { setReturned(true); setNotice('Simulated approval only. No request was sent to PayPal.'); }
        else location.assign(result.approvalUrl);
      } catch (e) {
        const current = await api<PublicAnyOrder>(`/api/orders/${order.id}`); setOrder(current); throw e;
      }
    });
  }
  async function capture() {
    await run(async () => {
      if (!order) return;
      try {
        const saved = await api<PublicAnyOrder>(`/api/orders/${order.id}/capture`, { token: returnToken });
        setOrder(saved);
        if (saved.status === 'paid') { setStep('confirmation'); history.replaceState({}, '', `/?order=${saved.id}`); }
        else setNotice('Payment has not completed. Check its status before making another attempt.');
      } catch (e) { setOrder(await api<PublicAnyOrder>(`/api/orders/${order.id}`)); throw e; }
    });
  }
  async function checkPayment() {
    await run(async () => {
      if (!order) return;
      const saved = await api<PublicAnyOrder>(`/api/orders/${order.id}/payment`); setOrder(saved);
      if (saved.status === 'paid') setStep('confirmation');
      else setNotice(`Current payment status: ${saved.status.replaceAll('_', ' ')}. No automatic retry was made.`);
    });
  }
  const currentAllocation = order?.allocation ?? allocation;
  const counts = currentAllocation?.assignments.reduce<Record<string, number>>((all, a) => ({ ...all, [a.itemId]: (all[a.itemId] ?? 0) + ('quantity' in a ? a.quantity : 1) }), {}) ?? {};
  const orderMenu = order?.items ? order.items.map(item => ({ ...menu[0], id: item.id, name: item.name, priceCents: item.priceCents })) : menu;
  const reviewValidation = allocation ? validateSegments(request, allocation.assignments, menu) : null;
  function changeSegmentMeals(segmentId: string, lines: { itemId: string; quantity: number }[]) {
    if (!allocation || busy || order) return;
    const result = updateSegmentMeals(request, allocation.assignments, segmentId, lines, menu);
    setAllocation(result.allocation); setError(''); setNotice('');
  }

  return <>
    <header className="site-header"><Link className="brand" href="/" aria-label="GroupTable home"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>GroupTable</Link><span className="environment">Local demonstration <span className="dot" /></span></header>
    <main>
      <section className="intro"><div><p className="intro-note">A little order for your team lunch.</p><h1>Everyone accounted for.<br />Lunch sorted.</h1><p className="intro-copy">Bring dietary counts or replies. Build a group meal order with quantities and requirements checked before checkout.</p></div><div className="lunch-mark" aria-hidden="true"><span className="lunch-lid">Today’s table</span><div className="lunch-box"><div className="rice"><i /><i /><i /><i /><i /><i /></div><div className="greens"><i /><i /><i /></div><div className="tofu"><i /><i /><i /><i /></div></div><span className="lunch-caption">One box. One guest. Nothing missed.</span></div></section>
      <div className="mode-banner"><span><strong>{aiMode === 'fixture' ? 'Example extraction' : 'Live AI extraction'}</strong> · {paymentMode === 'fixture' ? 'Simulated payment' : 'PayPal Sandbox payment'}</span><span>Fictional caterer. No real food orders or charges.</span></div>
      <nav className="steps" aria-label="Order progress">{(['requirements', 'review', 'payment', 'confirmation'] as Step[]).map((s, i) => <span key={s} className={step === s ? 'active' : ''} aria-current={step === s ? 'step' : undefined}><b>{i + 1}</b>{s[0].toUpperCase() + s.slice(1)}</span>)}</nav>
      <div aria-live="polite">{error && <div className="message error" role="alert">{error}</div>}{notice && <div className="message notice">{notice}</div>}</div>
      {!ready ? <p className="loading">Opening your table…</p> : <div className="workspace">
        <section className="work-panel">
          {step === 'requirements' && <>
            <div className="section-heading"><div><h2>Plan the group order.</h2><p>Set event details, then count mutually exclusive dietary segments.</p></div><span className="counter">{coverage.confirmed} / {request.headcount} confirmed</span></div>
            {preservedDraft && <div className="message notice"><p>The previous draft is preserved. Download it to review the original data.</p><button className="button small secondary" onClick={downloadPreserved}>Download preserved draft</button>{!draftWritable && <button className="button small secondary" onClick={() => { sessionStorage.setItem(`${key}-preserved-${Date.now()}`, preservedDraft); setDraftWritable(true); }}>Start saving a new draft, keeping the original</button>}</div>}
            <fieldset disabled={busy} className="plain-fieldset"><div className="basics"><label>Total people<input type="number" min="1" max={LIMITS.headcount} value={request.headcount || ''} onChange={e => updateRequirements({ ...request, headcount: Number(e.target.value), exclusiveConfirmed: false })} /></label><label>Total budget <span>HKD, including delivery</span><input type="number" min="0.01" step="0.01" value={request.budgetCents / 100 || ''} onChange={e => updateRequirements({ ...request, budgetCents: Math.round(Number(e.target.value) * 100) })} /></label></div><p className="subtle">Prototype limit: {LIMITS.headcount} people and {LIMITS.segments} segments. Menu stock may be insufficient.</p>
            <details className="reply-section"><summary>Extract segments from counts or replies</summary><label className="text-label" htmlFor="replies">Paste aggregate counts or identified individual replies. Keep personal information out of test input.</label><textarea id="replies" maxLength={LIMITS.extractionCharacters} rows={6} value={text} placeholder="30 attendees: 20 have no known restrictions, 5 vegetarian only, 3 vegetarian and dairy-free, 2 avoid peanuts." onChange={e => setText(e.target.value)} />
            <div className="extraction-controls"><button className="button" disabled={!text.trim() || request.headcount < 1 || request.headcount > LIMITS.headcount} onClick={() => void run(async () => {
              const result = await api<{ segments: Segment[]; issues: string[]; mode: string }>('/api/extract', { headcount: request.headcount, text });
              updateRequirements({ ...request, segments: result.segments, exclusiveConfirmed: false }); setIssues(result.issues);
              setNotice(result.mode === 'fixture' ? 'Fixture segments loaded. This was not an AI call. Review counts, evidence and requirements.' : 'AI extraction complete. Review segment counts, evidence and exclusivity before confirming.');
            })}>{busy ? 'Working…' : aiMode === 'fixture' ? 'Extract example segments' : 'Extract with AI'}</button><span className="subtle">{text.length.toLocaleString()} / {LIMITS.extractionCharacters.toLocaleString()}</span></div>
            <div className="example-loader"><label htmlFor="example">Try a labelled example</label><div><select id="example" value={exampleId} onChange={e => setExampleId(e.target.value)}>{examples.map(example => <option key={example.id} value={example.id}>{example.name}</option>)}</select><button className="button secondary" onClick={loadExample}>Load example</button></div></div></details>
            {issues.length > 0 && <div className="questions"><h3>Questions to resolve</h3><ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul><button className="button secondary" onClick={() => { setIssues([]); setNotice('Questions acknowledged. Correct segment counts and requirements, then explicitly confirm exclusivity.'); }}>I have resolved these in the segment counts</button></div>}
            </fieldset>
            <SegmentRequirements request={request} onChange={updateRequirements} disabled={busy} />
            <TastePreferences mode={qlooMode} profile={taste} seeds={tasteSeeds} menu={menu} disabled={busy} onBusy={setBusy} onSelectionChange={seeds => { setTasteSeeds(seeds); setTaste(null); setAllocation(null); setAgentResult(null); }} onChange={profile => { setTaste(profile); setAllocation(null); setAgentResult(null); }} />
            <div className="agent-planner"><h3>Let the planner prepare a draft.</h3><p className="subtle">{agentMode === 'live' ? 'Free AI can request Qloo cuisine evidence and a checked allocation, then return a draft or a question. Anonymous counts, dietary requirement codes and selected restaurant IDs go to OpenRouter; original replies stay out of this request.' : 'Simulated planner: demonstrates the tool sequence without a language-model call. Select an example restaurant or leave taste empty.'}</p><p className="subtle">Confirm requirements first. Select restaurant branches above; you do not need to build a profile before planning. Nothing is approved or paid automatically.</p><button className="button secondary" disabled={busy || !canAllocateSegments(request) || issues.length > 0} onClick={() => void plan()}>{planning ? 'Preparing your draft…' : agentMode === 'live' ? 'Plan with AI' : 'Simulate AI planner'}</button>{planning && <p role="status">Planning is in progress. Completed tool activity will appear when it finishes.</p>}{agentResult && <AgentActivity result={agentResult} />}</div>
            <div className="panel-footer"><p>Checks use fictional menu labels. They do not establish real allergen safety or cross-contact controls.</p><button className="button primary" disabled={busy || !canAllocateSegments(request) || issues.length > 0} onClick={() => void generate()}>Allocate meals</button></div>
          </>}
          {step === 'review' && allocation && <>
            <div className="section-heading"><div><h2>Meals by segment.</h2><p>Adjust meal types and quantities. Other segments stay unchanged.</p></div><span className={`status ${reviewValidation?.ok ? 'good' : ''}`}>{reviewValidation?.ok ? 'Checks passed' : 'Needs adjustment'}</span></div>
            {taste && <details className="taste-review"><summary>{taste.mode === 'live' ? 'Qloo-informed starting choices' : 'Simulated taste-informed starting choices'}</summary><TasteEvidence profile={taste} menu={menu} /><p className="subtle">The allocator tries matched meals first and keeps the first feasible result. It does not maximise group satisfaction. Your manual changes take precedence and do not regenerate the allocation.</p></details>}
            {agentResult && <><AgentActivity result={agentResult} /><p className="subtle">Activity describes the starting draft. Your manual edits below take precedence and never restart the agent.</p></>}
            {reviewValidation?.ok && <div className="check-summary"><span>✓ Segment quantities match</span><span>✓ Requirements checked</span><span>✓ Budget and shared stock checked</span></div>}
            <div aria-live="polite" aria-atomic="true">{reviewValidation && !reviewValidation.ok && <div className="message error" role="alert">{allocation.totalCents > request.budgetCents ? `${money(allocation.totalCents - request.budgetCents)} over budget. Adjust meals or quantities before approving.` : 'Resolve the quantity or compatibility issues shown below.'}{reviewValidation.issues.filter(issue => !issue.segmentId && issue.code !== 'BUDGET').map((issue, i) => <p key={i}>{issue.message}</p>)}</div>}</div>
            <SegmentMeals request={request} allocation={allocation} menu={menu} onChange={changeSegmentMeals} disabled={busy} />
            <div className="panel-footer"><button className="button secondary" disabled={busy} onClick={() => setStep('requirements')}>Edit requirements</button><button className="button primary" disabled={busy || !reviewValidation?.ok} onClick={() => void approveOrder()}>Approve order & continue</button></div>
          </>}
          {step === 'payment' && order && <><div className="section-heading"><div><h2>{order.mode === 'fixture' ? 'Try the checkout flow.' : 'Ready for Sandbox checkout.'}</h2><p>{order.mode === 'fixture' ? 'This is a simulated payment. Nothing will be sent to PayPal.' : 'Approve with a PayPal Sandbox buyer account. No real money is used.'}</p></div></div><div className="payment-ticket"><span>Approved order</span><strong>{money(order.allocation.totalCents)}</strong><p>{order.request.headcount} meals, including {money(order.allocation.deliveryCents)} delivery.</p><span className="status">{order.status.replaceAll('_', ' ')}</span><p className="reference">Order {order.id}</p></div>
            {!isSegmentOrder(order) && <p className="message notice">Saved guest-based order. Original allocation and payment details are preserved.</p>}
            {locked && <div className="message notice">Payment is being checked. Editing and new payments are locked until the outcome is known.</div>}
            {order.status === 'stale' && <div className="message error">This checkout has been replaced. Return to requirements and create a new order.</div>}
            <div className="payment-actions">
              {order.status === 'unknown' && !order.paypalId && <button className="button secondary" disabled={busy} onClick={() => void checkout()}>Recover original checkout request</button>}
              {['ready', 'awaiting_approval'].includes(order.status) && !returned && <button className="button primary" disabled={busy} onClick={() => void checkout()}>{order.mode === 'fixture' ? 'Simulate PayPal approval' : 'Continue to PayPal Sandbox'}</button>}
              {order.status === 'awaiting_approval' && returned && <button className="button primary" disabled={busy} onClick={() => void capture()}>{order.mode === 'fixture' ? 'Complete simulated payment' : 'Capture & verify Sandbox payment'}</button>}
              {order.status !== 'ready' && order.status !== 'stale' && <button className="button secondary" disabled={busy} onClick={() => void checkPayment()}>Check payment status</button>}
              <button className="text-button" disabled={busy || locked} onClick={() => void run(editApproved)}>Edit order</button>
            </div><p className="subtle">An approved browser window is not proof of payment. The server verifies the amount and payment result.</p></>}
          {step === 'confirmation' && order && <><div className="confirmation-heading"><span className="success-mark" aria-hidden="true">✓</span><h2>{order.mode === 'fixture' ? 'Simulation complete.' : 'Sandbox payment verified.'}</h2><p>No real charge. No food will be prepared or delivered.</p></div><div className="receipt-meta"><div><span>Order total</span><strong>{money(order.allocation.totalCents)}</strong></div><div><span>Payment reference</span><strong className="reference">{order.captureId}</strong></div></div><h3>Packing summary</h3>{isSegmentOrder(order) ? <SegmentMeals request={order.request} allocation={order.allocation} menu={orderMenu} /> : <LegacyPacking request={order.request} allocation={order.allocation} menu={orderMenu} />}<div className="panel-footer no-print"><button className="button secondary" onClick={() => window.print()}>Print packing summary</button><button className="button primary" onClick={() => void run(async () => { await edit(newSegmentRequest()); setText(''); setIssues([]); })}>Start another order</button></div></>}
        </section>
        <aside className="order-aside"><div className="aside-heading"><h2>Your table</h2><span className="table-dots" aria-hidden="true">● ● ●</span></div><div className="aside-facts"><div><span>Total people</span><strong>{request.headcount}</strong></div><div><span>Total budget</span><strong>{money(request.budgetCents)}</strong></div><div><span>Delivery included</span><strong>{money(8000)}</strong></div></div>{currentAllocation ? <><div className="basket">{Object.entries(counts).map(([id, count]) => { const item = orderMenu.find(m => m.id === id)!; return <div key={id}><span><b>{count}×</b> {item.name}</span><strong>{money(item.priceCents * count)}</strong></div>; })}</div><div className="basket-subtotal"><span>Meal subtotal</span><strong>{money(currentAllocation.subtotalCents)}</strong></div><div className="aside-total"><span>Total with delivery</span><strong>{money(currentAllocation.totalCents)}</strong></div><p className={`remaining ${currentAllocation.totalCents > request.budgetCents ? 'over-budget' : ''}`} aria-live="polite">{currentAllocation.totalCents > request.budgetCents ? `${money(currentAllocation.totalCents - request.budgetCents)} over budget` : `${money(request.budgetCents - currentAllocation.totalCents)} within budget`}</p></> : <div className="empty-basket"><span aria-hidden="true">⌑</span><h3>A place for everyone.</h3><p>Your meal quantities will appear here after you confirm the dietary segments.</p></div>}<div className="supplier"><div className="supplier-icon" aria-hidden="true">GT</div><div><strong>Table Kitchen</strong><span>Fictional demonstration caterer</span></div></div><p className="aside-note">15 labelled meals. One supplier.<br />Availability applies to this order only.</p><details className="menu-details"><summary>Explore the sample menu</summary>{menu.map(item => <div className="menu-item" key={item.id}><strong>{item.name} <span>{money(item.priceCents)}</span></strong><p>{item.description}</p><span>{item.stock ? `${item.stock} available` : 'Unavailable'}{Object.values(item.attributes).includes('unknown') ? ' · Some data unknown' : ''}</span></div>)}</details></aside>
      </div>}
    </main><footer className="site-footer"><span>GroupTable</span><p>Built for the organiser who remembers everyone.</p><span>PayPal hackathon prototype</span></footer>
  </>;
}

function AgentActivity({ result }: { result: AgentResult }) {
  return <section className="agent-activity" aria-label="Planner activity" aria-live="polite"><h3>{result.mode === 'live' ? 'AI planner activity' : 'Simulated planner activity — not a live AI run'}</h3><ol>{result.steps.map((step, i) => <li key={i}><strong>{step.tool === 'get_cuisine_profile' ? 'Taste lookup' : step.tool === 'allocate_meals' ? 'Allocation & validation' : 'Organiser handoff'}</strong><span className="agent-source">{step.source === 'local' ? 'Local checks' : step.source === 'live' ? 'Live service' : 'Simulated'}</span><p>{step.message}</p></li>)}</ol><p>{result.message}</p></section>;
}

function LegacyPacking({ request, allocation, menu }: { request: MealRequest; allocation: Allocation; menu: MenuItem[] }) {
  return <><p className="message notice">Legacy guest-based packing summary. Original assignments are unchanged.</p><div className="assignment-wrap"><table className="assignments"><thead><tr><th>Guest</th><th>Meal & checked requirements</th><th>Price</th></tr></thead><tbody>{allocation.assignments.map(line => {
    const guest = request.attendees.find(person => person.id === line.attendeeId)!;
    const item = menu.find(meal => meal.id === line.itemId)!;
    return <tr key={line.attendeeId}><td>{label(line.attendeeId)}</td><td><strong>{item.name}</strong><span>{guest.requirements.length ? guest.requirements.map(rule => requirementLabels[rule]).join(', ') : 'No known dietary restrictions confirmed'}</span></td><td>{money(item.priceCents)}</td></tr>;
  })}</tbody></table></div></>;
}
