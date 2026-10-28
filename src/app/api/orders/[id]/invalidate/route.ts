import { getStore, publicOrder } from '@/lib/store';
import { checkOrigin, handle, json, session } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => { checkOrigin(request); return json(publicOrder(getStore().invalidate((await context.params).id, session(request)))); }); }
