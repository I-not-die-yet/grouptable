import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractionInput } from '../src/lib/extraction';
import { fixtureSegmentExtraction, normalizeSegmentExtraction, extractSegments, type SegmentModelOutput } from '../src/lib/segment-extraction';
import { segmentExamples } from '../src/lib/segment-examples';
import { newSegmentRequest, segmentCoverage } from '../src/lib/segments';

beforeEach(() => { vi.stubEnv('AI_MODE', 'fixture'); const gate = (globalThis as typeof globalThis & { grouptableAI: { calls: number; busy: boolean } }).grouptableAI; gate.calls = 0; gate.busy = false; });
afterEach(() => vi.unstubAllEnvs());
function example(id: string) { const e = segmentExamples.find(x => x.id === id)!; return fixtureSegmentExtraction(e.headcount, e.text); }
describe('segment extraction normalization and explicitly labelled fixtures', () => {
  for (const e of segmentExamples) it(`normalizes fixture: ${e.name}`, () => {
    const result = fixtureSegmentExtraction(e.headcount, e.text);
    expect(result.mode).toBe('fixture'); expect(result.segments.every(s => !s.confirmed)).toBe(true);
    expect(new Set(result.segments.map(s => s.id)).size).toBe(result.segments.length);
    for (const segment of result.segments) expect(segment.sources.every(source => e.text.includes(source))).toBe(true);
  });
  it('distinguishes inclusive counts from exclusive counts', () => {
    expect(example('including').segments.map(s => ({ count: s.headcount, requirements: s.requirements }))).toEqual([{ count: 7, requirements: ['vegetarian'] }, { count: 3, requirements: ['vegetarian', 'dairyFree'] }]);
    const exclusive = example('aggregate-30'); expect(exclusive.segments.map(s => s.headcount)).toEqual([20, 5, 3, 2]); expect(exclusive.segments.reduce((sum, s) => sum + s.headcount, 0)).toBe(30);
  });
  it('groups matching individual interpretations and preserves their separate evidence', () => {
    const result = example('individual-6'); expect(result.segments.map(s => s.headcount)).toEqual([2, 1, 2, 1]);
    expect(result.segments[0].sources).toHaveLength(2); expect(result.segments[1].requirements).toEqual(['vegetarian', 'dairyFree']);
  });
  it('keeps missing, ambiguous, duplicate, conflicting and unidentified people unresolved', () => {
    const missing = example('missing'); expect(segmentCoverage({ ...newSegmentRequest(6), segments: missing.segments }).shortfall).toBe(4);
    expect(example('ambiguous').issues.length).toBeGreaterThan(0);
    for (const id of ['duplicate', 'conflict']) { const result = example(id); expect(result.segments.reduce((sum, s) => sum + s.headcount, 0)).toBe(1); expect(result.segments[0].unresolved.length).toBeGreaterThan(0); }
    expect(example('unidentified').segments).toEqual([]); expect(example('unidentified').issues.length).toBeGreaterThan(0);
  });
  it('rejects arbitrary fixture input and out-of-range headcounts', () => {
    expect(() => fixtureSegmentExtraction(30, 'Unprepared arbitrary input')).toThrow(/Fixture mode/);
    expect(extractionInput.safeParse({ headcount: 100, text: 'hello' }).success).toBe(true);
    expect(extractionInput.safeParse({ headcount: 101, text: 'hello' }).success).toBe(false);
  });
  it('does not fabricate a remainder when included counts overlap or exceed the parent', () => {
    const sample = segmentExamples.find(e => e.id === 'including')!;
    const output = structuredClone(sample.output) as Extract<SegmentModelOutput, { kind: 'aggregate' }>;
    output.groups[0].included[0].count = 11;
    const result = normalizeSegmentExtraction(output, 10, sample.text);
    expect(result.segments).toHaveLength(1); expect(result.segments[0].headcount).toBe(10); expect(result.segments[0].unresolved.length).toBeGreaterThan(0);
  });
  it('flags invented evidence and never confirms model output', () => {
    const raw = { kind: 'individual', replies: [{ personId: 'Guest 100', source: 'invented text', requirements: ['vegan'], unresolved: [] }], issues: [] };
    const result = normalizeSegmentExtraction(raw, 100, 'Guest 100: something else');
    expect(result.segments[0].confirmed).toBe(false); expect(result.segments[0].sources).toEqual([]); expect(result.segments[0].unresolved.length).toBeGreaterThan(0);
  });
  it('supports 100 individual replies as one quantity segment without the legacy guest-ID limit', () => {
    const replies = Array.from({ length: 100 }, (_, i) => ({ personId: `Guest ${i + 1}`, source: `Guest ${i + 1}: Vegetarian.`, requirements: ['vegetarian'], unresolved: [] }));
    const result = normalizeSegmentExtraction({ kind: 'individual', replies, issues: [] }, 100, replies.map(r => r.source).join('\n'));
    expect(result.segments).toHaveLength(1); expect(result.segments[0].headcount).toBe(100); expect(result.segments[0].sources).toHaveLength(100);
  });
  it('does not silently truncate an interpretation requiring more than 12 segments', () => {
    const rules = ['vegetarian', 'dairyFree', 'glutenFree', 'mild'];
    const replies = Array.from({ length: 13 }, (_, i) => ({ personId: `Guest ${i + 1}`, source: `Guest ${i + 1}: requirements ${i}.`, requirements: rules.filter((_, bit) => i & (1 << bit)), unresolved: [] }));
    const result = normalizeSegmentExtraction({ kind: 'individual', replies, issues: [] }, 13, replies.map(r => r.source).join('\n'));
    expect(result.segments).toEqual([]); expect(result.issues.join(' ')).toContain('13 segments');
  });
  it('treats placeholder identities as unidentified instead of counting them', () => {
    const result = normalizeSegmentExtraction({ kind: 'individual', replies: [{ personId: 'Someone', source: 'Someone avoids dairy.', requirements: ['dairyFree'], unresolved: [] }], issues: [] }, 2, 'Someone avoids dairy.');
    expect(result.segments).toEqual([]); expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('current segment AI adapter with mocked provider only', () => {
  it('uses the existing live usage gate and shared call budget', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('ALLOW_PAID_AI', 'false');
    const fetcher = vi.fn<typeof fetch>(); await expect(extractSegments({ headcount: 30, text: 'test' }, fetcher)).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' }); expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles a mocked aggregate response and preserves timeout/token/no-retry settings', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('ALLOW_PAID_AI', 'true'); vi.stubEnv('OPENROUTER_API_KEY', 'test-only-placeholder');
    const sample = segmentExamples[0];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ choices: [{ message: { content: JSON.stringify(sample.output) }, finish_reason: 'stop' }] }));
    const result = await extractSegments({ headcount: 30, text: sample.text }, fetcher);
    expect(result.mode).toBe('live'); expect(result.segments.map(s => s.headcount)).toEqual([20, 5, 3, 2]);
    const options = fetcher.mock.calls[0][1]!; const body = JSON.parse(String(options.body));
    expect(body.max_tokens).toBe(4000); expect(body.response_format).toEqual({ type: 'json_object' }); expect(options.signal).toBeInstanceOf(AbortSignal); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(body.messages[0].content).toContain('Do NOT emit 10 + 3');
  });
  it('does not retry malformed segment output or provider failures', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('ALLOW_PAID_AI', 'true'); vi.stubEnv('OPENROUTER_API_KEY', 'test-only-placeholder');
    for (const response of [new Response('', { status: 402 }), new Response('', { status: 429 }), Response.json({ choices: [{ message: { content: '{"confirmed":true}' } }] })]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(extractSegments({ headcount: 100, text: 'test' }, fetcher)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
