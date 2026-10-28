import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extract, extractionInput, fixtureExtraction, normalizeExtraction } from '../src/lib/extraction';
import { examples, heldOut } from '../src/lib/examples';

beforeEach(() => {
  vi.stubEnv('AI_MODE', 'fixture');
  const globals = globalThis as typeof globalThis & { grouptableAI: { calls: number; busy: boolean } };
  globals.grouptableAI.calls = 0; globals.grouptableAI.busy = false;
});
afterEach(() => vi.unstubAllEnvs());
function live() { vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('ALLOW_PAID_AI', 'true'); vi.stubEnv('OPENROUTER_API_KEY', 'test-only-placeholder'); }
function provider(body: unknown) { return vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ choices: [{ message: { content: JSON.stringify(body) }, finish_reason: 'stop' }] })); }
describe('extraction fixtures (not live model quality)', () => {
  for (const example of examples) it(example.name, () => {
    const result = fixtureExtraction(example.headcount, example.text);
    expect(result.mode).toBe('fixture'); expect(result.attendees).toHaveLength(example.headcount);
    expect(result.attendees.every(a => !a.confirmed)).toBe(true);
    for (const row of example.expected) expect(result.attendees[row.guest - 1].requirements).toEqual(row.requirements);
  });
  it('does not pretend to extract arbitrary text in fixture mode', () => { expect(() => fixtureExtraction(1, 'Some arbitrary input')).toThrow(/Fixture mode/); });
  it('preserves missing guests, duplicate references and unmatched evidence as unresolved', () => {
    const result = normalizeExtraction({ attendees: [{ guest: 1, source: 'made up', requirements: [], unresolved: [] }, { guest: 2, source: 'hello', requirements: [], unresolved: [] }, { guest: 2, source: 'hello', requirements: [], unresolved: [] }], issues: [] }, 3, 'hello');
    expect(result.attendees.every(a => a.unresolved.length > 0 && !a.confirmed)).toBe(true);
  });
  it('limits input before making external calls', () => { expect(extractionInput.safeParse({ headcount: 1, text: 'a'.repeat(8001) }).success).toBe(false); });
});
describe('live adapter with mocked provider only', () => {
  it('requires an explicit paid usage flag and a key', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('ALLOW_PAID_AI', 'false');
    const fetcher = vi.fn<typeof fetch>(); await expect(extract({ headcount: 1, text: 'hello' }, fetcher)).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' }); expect(fetcher).not.toHaveBeenCalled();
  });
  for (const sample of heldOut) it(`validates mocked held-out output: ${sample.text}`, async () => {
    live(); const fetcher = provider({ attendees: [{ guest: 1, source: sample.text, requirements: sample.expected, unresolved: [] }], issues: [] });
    const result = await extract({ headcount: 1, text: sample.text }, fetcher);
    expect(result.attendees[0].requirements).toEqual(sample.expected); expect(result.attendees[0].confirmed).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  for (const status of [402, 429, 500]) it(`handles provider ${status} without retrying`, async () => {
    live(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    await expect(extract({ headcount: 1, text: 'hello' }, fetcher)).rejects.toMatchObject({ code: 'AI_PROVIDER' }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('handles empty, invalid JSON and timeout responses', async () => {
    live();
    for (const content of ['', '{bad-json']) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
      await expect(extract({ headcount: 1, text: 'hello' }, fetcher)).rejects.toMatchObject({ code: 'AI_OUTPUT' });
    }
    await expect(extract({ headcount: 1, text: 'hello' }, vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))).rejects.toThrow(/timed out/);
  });
  it('caps calls at twenty per process', async () => {
    live(); const fetcher = provider({ attendees: [], issues: [] });
    for (let i = 0; i < 20; i++) await extract({ headcount: 1, text: 'hello' }, fetcher);
    await expect(extract({ headcount: 1, text: 'hello' }, fetcher)).rejects.toMatchObject({ code: 'AI_LIMIT' }); expect(fetcher).toHaveBeenCalledTimes(20);
  });
  it('rejects overlapping calls', async () => {
    live(); let release!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = extract({ headcount: 1, text: 'hello' }, fetcher);
    await expect(extract({ headcount: 1, text: 'hello' }, fetcher)).rejects.toMatchObject({ code: 'AI_BUSY' });
    release(Response.json({ choices: [{ message: { content: '{"attendees":[],"issues":[]}' } }] })); await first;
  });
});
