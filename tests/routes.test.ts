import { afterEach, expect, it, vi } from 'vitest';
import { POST as allocateRoute } from '../src/app/api/allocate/route';
import { POST as extractRoute } from '../src/app/api/extract/route';
import { newRequest } from '../src/lib/domain';
import { segmentExamples as examples } from '../src/lib/segment-examples';
const base = 'http://127.0.0.1:3000';
function request(path: string, body: unknown, origin = base) { return new Request(`${base}${path}`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
afterEach(() => vi.unstubAllEnvs());
it('rejects cross-origin writes and missing origins', async () => {
  expect((await allocateRoute(request('/api/allocate', newRequest(), 'https://outside.example'))).status).toBe(403);
  expect((await allocateRoute(new Request(`${base}/api/allocate`, { method: 'POST', body: '{}' }))).status).toBe(403);
});
it('accepts Next internal URLs only when Host and Origin both match the configured URL', async () => {
  const valid = new Request('http://localhost:3000/api/allocate', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: base }, body: JSON.stringify(newRequest()) });
  expect((await allocateRoute(valid)).status).toBe(200);
  const invalid = new Request(`${base}/api/allocate`, { method: 'POST', headers: { host: 'outside.example', origin: base }, body: '{}' });
  expect((await allocateRoute(invalid)).status).toBe(403);
});
it('returns unresolved as a business result and validates malformed requests', async () => {
  const response = await allocateRoute(request('/api/allocate', newRequest())); expect((await response.json()).code).toBe('UNRESOLVED');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect((await allocateRoute(request('/api/allocate', { headcount: 999 }))).status).toBe(400);
});
it('serves labelled extraction fixtures with no external calls', async () => {
  vi.stubEnv('AI_MODE', 'fixture'); const example = examples[0];
  const response = await extractRoute(request('/api/extract', { headcount: example.headcount, text: example.text })); expect(response.status).toBe(200); expect((await response.json()).mode).toBe('fixture');
});
it('rejects oversized request bodies', async () => { expect((await extractRoute(request('/api/extract', { text: 'a'.repeat(100001) }))).status).toBe(413); });
