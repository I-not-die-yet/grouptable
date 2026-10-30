import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { AppError } from './extraction';

export function session(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith('gt_session='))?.slice(11);
  return cookie && /^[a-f0-9-]{36}$/.test(cookie) ? cookie : randomUUID();
}
export function checkOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || 'http://127.0.0.1:3000');
  // Next may construct an internal Request URL with a different host. Check the actual Host header.
  const host = request.headers.get('host') || new URL(request.url).host;
  if (host !== expected.host || request.headers.get('origin') !== expected.origin) throw new AppError(403, 'ORIGIN', 'Open the application at its configured local URL and try again.');
}
export function json(body: unknown, owner?: string, status = 200) {
  const secure = new URL(process.env.APP_URL || 'http://127.0.0.1:3000').protocol === 'https:';
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(owner ? { 'Set-Cookie': `gt_session=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? '; Secure' : ''}` } : {}) } });
}
export async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'INVALID_JSON', 'A JSON request body is required.');
  const parts: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 100000) { await reader.cancel(); throw new AppError(413, 'INPUT_LIMIT', 'The request is too large.'); } parts.push(value); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new AppError(400, 'INVALID_JSON', 'The request must contain valid JSON.'); }
}
export async function handle(fn: () => Promise<Response>) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof AppError) return json({ error: error.message, code: error.code }, undefined, error.status);
    if (error instanceof ZodError) return json({ error: 'Some fields are invalid. Review the headcount, budget and guest requirements.', code: 'VALIDATION' }, undefined, 400);
    // Never include provider responses, credentials, raw replies or request headers in errors.
    return json({ error: 'The request could not be completed. Your input has been kept.', code: 'INTERNAL' }, undefined, 500);
  }
}
