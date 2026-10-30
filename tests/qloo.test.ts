import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchRestaurants, createTasteProfile, getTasteProfile } from '../src/lib/qloo';
import { POST as searchRoute } from '../src/app/api/taste/search/route';
import { POST as profileRoute } from '../src/app/api/taste/profile/route';
import { POST as allocateRoute } from '../src/app/api/allocate/route';
import { POST as orderRoute } from '../src/app/api/orders/route';
import { newSegment, newSegmentRequest } from '../src/lib/segments';
import { getStore, type PublicSegmentOrder } from '../src/lib/store';
import { Payments, PayPalClient } from '../src/lib/paypal';

const owner = '12345678-1234-1234-1234-123456789abc';
const base = 'http://127.0.0.1:3000';
const http = (path: string, body: unknown, user = owner) => new Request(base + path, { method: 'POST', headers: { origin: base, cookie: `gt_session=${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fakeId = '00000000-0000-4000-8000-000000000011';
const fakeSearch = { results: [{ entity_id: fakeId, name: 'Invented Live Test Restaurant', types: ['urn:entity:place'], properties: { address: 'Synthetic address', primary_genre: { id: 'urn:tag:genre:place:restaurant:italian' } } }] };
const fakeTaste = { success: true, results: { tags: [{ tag_id: 'urn:tag:cuisine:qloo:italian', name: 'Italian', query: { affinity: 0.8 } }, { tag_id: 'urn:tag:cuisine:qloo:vegan', name: 'Vegan', query: { affinity: 0.9 } }] } };
type Gate = { calls: number; busy: boolean; restaurants: Map<string, unknown>; profiles: Map<string, unknown> };
const gate = () => (globalThis as typeof globalThis & { grouptableQloo: Gate }).grouptableQloo;
let directory: string;
beforeEach(() => {
  gate().calls = 0; gate().busy = false; gate().restaurants.clear(); gate().profiles.clear();
  vi.stubEnv('QLOO_MODE', 'fixture'); vi.stubEnv('APP_URL', base); vi.stubEnv('PAYMENT_MODE', 'fixture');
  directory = mkdtempSync(join(tmpdir(), 'grouptable-taste-')); vi.stubEnv('GROUPTABLE_DB_PATH', join(directory, 'orders.sqlite'));
});
afterEach(() => { getStore().db.close(); rmSync(directory, { recursive: true, force: true }); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function live() { vi.stubEnv('QLOO_MODE', 'live'); vi.stubEnv('QLOO_API_URL', 'https://hackathon.api.qloo.com'); vi.stubEnv('QLOO_API_KEY', 'synthetic-key-not-a-credential'); }
describe('Qloo adapter and session-scoped evidence', () => {
  it('runs invented fixtures without fetching and never falls back from live to fixtures', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const found = await searchRestaurants('Pasta', owner, fetcher);
    const profile = await createTasteProfile([found.restaurants[0].id], owner, fetcher);
    expect(profile.mode).toBe('fixture'); expect(profile.matches.map(m => m.itemId)).toEqual(['mushroom-pasta']); expect(fetcher).not.toHaveBeenCalled();
    live(); await expect(searchRestaurants('Test', owner, vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))).rejects.toMatchObject({ code: 'QLOO_PROVIDER' });
  });
  it('uses fixed hackathon URLs, real IDs, bounded requests and filters dietary associations', async () => {
    live(); const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(fakeSearch)).mockResolvedValueOnce(Response.json(fakeTaste));
    const found = await searchRestaurants('Test', owner, fetcher); const profile = await createTasteProfile([found.restaurants[0].id], owner, fetcher);
    expect(profile.cuisines.map(c => c.name)).toEqual(['Italian']); expect(profile.matches[0].itemId).toBe('mushroom-pasta');
    expect(String(fetcher.mock.calls[0][0])).toContain('https://hackathon.api.qloo.com/search?');
    const url = new URL(String(fetcher.mock.calls[1][0])); expect(url.searchParams.get('signal.interests.entities')).toBe(fakeId); expect(url.searchParams.get('filter.type')).toBe('urn:tag');
    expect(fetcher.mock.calls[1][1]?.redirect).toBe('error'); expect(JSON.stringify(profile)).not.toContain('synthetic-key');
  });
  it('rejects cross-session, unknown, expired and restarted profiles instead of trusting client scores', async () => {
    const found = await searchRestaurants('Example', owner); const profile = await createTasteProfile([found.restaurants[0].id], owner);
    expect(() => getTasteProfile(profile.id, 'other-owner')).toThrow(/expired/);
    await expect(createTasteProfile([fakeId], owner)).rejects.toMatchObject({ code: 'QLOO_SELECTION' });
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3600001); expect(() => getTasteProfile(profile.id, owner)).toThrow(/expired/);
  });
  it('handles empty results, malformed output, HTTP errors and timeouts without retrying', async () => {
    live(); const empty = await searchRestaurants('Unknown', owner, vi.fn().mockResolvedValue(Response.json({ results: [] }))); expect(empty.restaurants).toEqual([]);
    for (const status of [402, 429, 500]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status })); await expect(searchRestaurants('Test', owner, fetcher)).rejects.toMatchObject({ code: 'QLOO_PROVIDER' }); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('Synthetic timeout', 'TimeoutError')); await expect(searchRestaurants('Test', owner, fetcher)).rejects.toMatchObject({ code: 'QLOO_RESPONSE' }); expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(searchRestaurants('Test', owner, vi.fn().mockResolvedValue(Response.json({ results: 'invalid' })))).rejects.toMatchObject({ code: 'QLOO_RESPONSE' });
    await searchRestaurants('Test', owner, vi.fn().mockResolvedValue(Response.json(fakeSearch)));
    await expect(createTasteProfile([fakeId], owner, vi.fn().mockResolvedValue(Response.json({ success: true, results: { tags: [] } })))).resolves.toMatchObject({ cuisines: [], matches: [] });
    await expect(createTasteProfile([fakeId], owner, vi.fn().mockResolvedValue(Response.json({ success: true, results: { tags: [{ tag_id: 'bad' }] } })))).rejects.toMatchObject({ code: 'QLOO_RESPONSE' });
  });
  it('enforces one concurrent request, 20 calls and rejects an unexpected provider host', async () => {
    live(); gate().busy = true; const fetcher = vi.fn<typeof fetch>(); await expect(searchRestaurants('Test', owner, fetcher)).rejects.toMatchObject({ code: 'QLOO_BUSY' });
    gate().busy = false; gate().calls = 20; await expect(searchRestaurants('Test', owner, fetcher)).rejects.toMatchObject({ code: 'QLOO_LIMIT' });
    vi.stubEnv('QLOO_API_URL', 'https://outside.example'); await expect(searchRestaurants('Test', owner, fetcher)).rejects.toMatchObject({ code: 'QLOO_CONFIG' }); expect(fetcher).not.toHaveBeenCalled();
  });
  it('filters non-restaurant search records, preserves branch identity and validates origin/input', async () => {
    live(); const cafe = { ...fakeSearch.results[0], entity_id: '00000000-0000-4000-8000-000000000012', properties: { primary_genre: { id: 'urn:tag:genre:place:restaurant:cocktail_bar' } } };
    const found = await searchRestaurants('Test', owner, vi.fn().mockResolvedValue(Response.json({ results: [cafe, ...fakeSearch.results] })));
    expect(found.restaurants.map(r => r.id)).toEqual([fakeId]);
    expect((await searchRoute(new Request(base + '/api/taste/search', { method: 'POST', body: '{}' }))).status).toBe(403);
    expect((await searchRoute(http('/api/taste/search', { query: 'x' }))).status).toBe(400);
    expect((await profileRoute(http('/api/taste/profile', { ids: [fakeId, fakeId] }))).status).toBe(400);
  });
  it('uses server-held taste scores and retains final edited quantities through mocked PayPal verification', async () => {
    const found = await (await searchRoute(http('/api/taste/search', { query: 'Pasta' }))).json();
    const profile = await (await profileRoute(http('/api/taste/profile', { ids: [found.restaurants[0].id] }))).json();
    const request = { ...newSegmentRequest(2), exclusiveConfirmed: true, segments: [{ ...newSegment('a', 'Team'), headcount: 2, confirmed: true }] };
    const result = await (await allocateRoute(http('/api/allocate', { request, tasteId: profile.id }))).json();
    expect(result.allocation.assignments).toEqual([{ segmentId: 'a', itemId: 'mushroom-pasta', quantity: 2 }]);
    expect((await allocateRoute(http('/api/allocate', { request, tasteId: profile.id, scores: { 'roast-chicken': 1 } }))).status).toBe(400);
    const assignments = [{ segmentId: 'a', itemId: 'mushroom-pasta', quantity: 1 }, { segmentId: 'a', itemId: 'roast-chicken', quantity: 1 }];
    expect((await orderRoute(http('/api/orders', { request, assignments, totalCents: 1 }))).status).toBe(400);
    const saved = await (await orderRoute(http('/api/orders', { request, assignments }))).json() as PublicSegmentOrder;
    expect(saved.allocation.totalCents).toBe(23400); expect(saved.allocation.assignments).toEqual(assignments);
    const store = getStore(); const order = store.get(saved.id, owner); order.mode = 'sandbox'; store.save(order);
    vi.stubEnv('PAYPAL_CLIENT_ID', 'synthetic-client'); vi.stubEnv('PAYPAL_CLIENT_SECRET', 'synthetic-secret');
    const remote = { id: 'pp-taste-test', status: 'COMPLETED', purchase_units: [{ reference_id: order.id, custom_id: order.id, amount: { value: '234.00', currency_code: 'HKD' }, payments: { captures: [{ id: 'capture-taste-test', status: 'COMPLETED', amount: { value: '234.00', currency_code: 'HKD' } }] } }] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes('/oauth2/token') ? Response.json({ access_token: 'synthetic-token', expires_in: 300 }) : String(url).endsWith('/v2/checkout/orders') ? Response.json({ id: remote.id, links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=pp-taste-test' }] }) : Response.json(remote));
    const payments = new Payments(store, new PayPalClient(fetcher)); await payments.create(order.id, owner);
    const create = fetcher.mock.calls.find(([url]) => String(url).endsWith('/v2/checkout/orders'))!;
    const unit = JSON.parse(String(create[1]!.body)).purchase_units[0];
    expect(unit.amount.value).toBe('234.00'); expect(unit.items.map((i: { name: string }) => i.name)).toEqual(['Mushroom cream pasta', 'Roast chicken rice']);
    expect((await payments.capture(order.id, owner, remote.id)).status).toBe('paid');
    expect(store.get(order.id, owner).allocation.assignments).toEqual(assignments);
  });
});
