import { afterEach, expect, it, vi } from 'vitest';
import { json } from '../src/lib/http';
import { newSegmentRequest, segmentRequestSchema } from '../src/lib/segments';

afterEach(() => vi.unstubAllEnvs());

it('restricts HTTPS session cookies to secure transport without breaking loopback development', () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  vi.stubEnv('APP_URL', 'https://grouptable.example');
  const cookie = json({}, owner).headers.get('set-cookie')!;
  expect(cookie).toContain('; Secure');
  expect(cookie).toContain('; HttpOnly');
  expect(cookie).toContain('; SameSite=Lax');
  expect(cookie).not.toContain('Domain=');
  vi.stubEnv('APP_URL', 'http://127.0.0.1:3000');
  expect(json({}, owner).headers.get('set-cookie')).not.toContain('; Secure');
});

it('rejects an oversized group array before accumulating child validation errors', () => {
  // Below the HTTP body limit: size checks must still precede per-element parsing.
  const input = { ...newSegmentRequest(), segments: Array.from({ length: 500 }, () => ({})) };
  expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(100000);
  const parsed = segmentRequestSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues).toHaveLength(1);
    expect(parsed.error.issues[0].code).toBe('too_big');
  }
});
