import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from './extraction';
import { menu } from './menu';
import { isCuisineId, matchMeals, type Cuisine, type Restaurant, type TasteProfile } from './taste';

export const tasteSearchInput = z.object({ query: z.string().trim().min(2).max(100) }).strict();
export const tasteProfileInput = z.object({ ids: z.array(z.uuid()).min(1).max(3).refine(ids => new Set(ids).size === ids.length) }).strict();
type Entry<T> = { owner: string; expires: number; value: T };
type State = { calls: number; busy: boolean; restaurants: Map<string, Entry<Restaurant>>; profiles: Map<string, Entry<TasteProfile>> };
const globals = globalThis as typeof globalThis & { grouptableQloo?: State };
const state = globals.grouptableQloo ??= { calls: 0, busy: false, restaurants: new Map(), profiles: new Map() };
const ttl = 60 * 60 * 1000;
function remember<T>(map: Map<string, Entry<T>>, id: string, owner: string, value: T) {
  for (const [key, entry] of map) if (entry.expires < Date.now()) map.delete(key);
  if (map.size >= 100) map.delete(map.keys().next().value!);
  map.set(id, { owner, expires: Date.now() + ttl, value });
}
export const qlooMode = () => process.env.QLOO_MODE === 'live' ? 'live' as const : 'fixture' as const;
async function qloo(path: string, params: Record<string, string>, fetcher: typeof fetch) {
  if (!process.env.QLOO_API_KEY || process.env.QLOO_API_URL !== 'https://hackathon.api.qloo.com') throw new AppError(503, 'QLOO_CONFIG', 'Qloo requires the hackathon server URL and a server-side key. Use fixture mode or check local settings.');
  if (state.busy) throw new AppError(429, 'QLOO_BUSY', 'A Qloo request is already running. Wait for it to finish.');
  if (state.calls >= 20) throw new AppError(429, 'QLOO_LIMIT', 'The 20-call Qloo process limit has been reached. Review usage before restarting.');
  state.busy = true; state.calls++;
  try {
    const url = new URL(path, 'https://hackathon.api.qloo.com');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetcher(url, { headers: { 'X-Api-Key': process.env.QLOO_API_KEY }, signal: AbortSignal.timeout(30000), cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new AppError(response.status === 429 ? 429 : 502, 'QLOO_PROVIDER', response.status === 401 || response.status === 403 ? 'Qloo rejected access. Check the hackathon key and its validity.' : response.status === 429 ? 'Qloo is rate limited. No automatic retry was made.' : 'Qloo could not complete this request. Your order is unchanged.');
    const body: unknown = await response.json();
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'QLOO_RESPONSE', 'Qloo timed out or returned an unreadable response. Your order is unchanged; no automatic retry was made.');
  } finally { state.busy = false; }
}

// Entirely invented fixtures; these are not cached Qloo restaurant records or scores.
const fixtureRestaurants: Restaurant[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Example Cantonese Kitchen', address: 'Invented fixture restaurant' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Example Pasta Table', address: 'Invented fixture restaurant' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Example Indian Kitchen', address: 'Invented fixture restaurant' },
];
const searchResponse = z.object({ results: z.array(z.object({ entity_id: z.uuid(), name: z.string().min(1).max(300), types: z.array(z.string()), properties: z.object({ address: z.string().max(1000).optional(), primary_genre: z.object({ id: z.string() }).passthrough().optional() }).passthrough().optional(), tags: z.array(z.object({ tag_id: z.string().optional(), id: z.string().optional() }).passthrough()).optional() }).passthrough()).max(20) }).passthrough();
const tagsResponse = z.object({ success: z.literal(true), results: z.object({ tags: z.array(z.object({ tag_id: z.string(), name: z.string().min(1).max(150), query: z.object({ affinity: z.number().finite().min(0).max(1) }).passthrough() }).passthrough()).max(100) }).passthrough() }).passthrough();
export async function searchRestaurants(query: string, owner: string, fetcher: typeof fetch = fetch) {
  let restaurants: Restaurant[];
  if (qlooMode() === 'fixture') restaurants = fixtureRestaurants.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
  else {
    const parsed = searchResponse.safeParse(await qloo('/search', { query, take: '10' }, fetcher));
    if (!parsed.success) throw new AppError(502, 'QLOO_RESPONSE', 'Qloo returned an unexpected search response. Your order is unchanged.');
    restaurants = parsed.data.results.filter(r => r.types.includes('urn:entity:place') && [r.properties?.primary_genre?.id, ...(r.tags ?? []).map(t => t.tag_id ?? t.id)].some(id => id === 'urn:tag:genre:place:restaurant' || id?.startsWith('urn:tag:genre:place:restaurant:')) && !/:(cocktail_bar|coffee_shop|cafe|bar)$/.test(r.properties?.primary_genre?.id ?? '')).slice(0,5).map(r => ({ id: r.entity_id, name: r.name, address: r.properties?.address ?? 'Address unavailable — check the branch before selecting.' }));
  }
  for (const restaurant of restaurants) remember(state.restaurants, `${owner}:${restaurant.id}`, owner, restaurant);
  return { mode: qlooMode(), restaurants };
}
export async function createTasteProfile(ids: string[], owner: string, fetcher: typeof fetch = fetch): Promise<TasteProfile> {
  const seeds = ids.map(id => {
    const entry = state.restaurants.get(`${owner}:${id}`);
    if (!entry || entry.owner !== owner || entry.expires < Date.now()) throw new AppError(409, 'QLOO_SELECTION', 'Search again and select the exact restaurant branches before building a taste profile.');
    return entry.value;
  });
  let cuisines: Cuisine[];
  if (qlooMode() === 'fixture') {
    if (seeds.some(s => !fixtureRestaurants.some(f => f.id === s.id))) throw new AppError(409, 'QLOO_SELECTION', 'Search again after changing service mode.');
    const names = seeds.map(s => s.id.endsWith('1') ? 'Cantonese' : s.id.endsWith('2') ? 'Italian' : 'Indian');
    cuisines = names.map(name => ({ id: `urn:tag:cuisine:qloo:${name.toLowerCase()}`, name, affinity: 0.8 }));
  } else {
    const parsed = tagsResponse.safeParse(await qloo('/v2/insights', { 'filter.type': 'urn:tag', 'signal.interests.entities': ids.join(','), 'filter.tag.types': 'urn:tag:cuisine:qloo', take: '30' }, fetcher));
    if (!parsed.success) throw new AppError(502, 'QLOO_RESPONSE', 'Qloo returned an unexpected taste response. Your order is unchanged.');
    cuisines = parsed.data.results.tags.filter(t => isCuisineId(t.tag_id)).map(t => ({ id: t.tag_id, name: t.name, affinity: t.query.affinity }));
  }
  const profile: TasteProfile = { id: randomUUID(), mode: qlooMode(), seeds, cuisines, matches: matchMeals(cuisines, menu) };
  remember(state.profiles, profile.id, owner, profile);
  return profile;
}
export function getTasteProfile(id: string, owner: string) {
  const entry = state.profiles.get(id);
  if (!entry || entry.owner !== owner || entry.expires < Date.now() || entry.value.mode !== qlooMode()) throw new AppError(409, 'QLOO_EXPIRED', 'This taste profile expired or the server restarted. Build it again, or clear it to allocate without taste preferences.');
  return entry.value;
}
