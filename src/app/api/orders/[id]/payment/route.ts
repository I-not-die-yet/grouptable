import { getStore, publicOrder } from '@/lib/store';
import { Payments } from '@/lib/paypal';
import { handle, json, session } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => json(publicOrder(await new Payments(getStore()).status((await context.params).id, session(request))))); }
