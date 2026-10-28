import { z } from 'zod';
import { getStore, publicOrder } from '@/lib/store';
import { Payments } from '@/lib/paypal';
import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => {
  checkOrigin(request); const body = z.object({ token: z.string().max(100).optional() }).parse(await readJson(request));
  return json(publicOrder(await new Payments(getStore()).capture((await context.params).id, session(request), body.token)));
}); }
