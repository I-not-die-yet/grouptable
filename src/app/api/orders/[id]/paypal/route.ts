import { getStore, publicOrder } from '@/lib/store';
import { Payments } from '@/lib/paypal';
import { checkOrigin, handle, json, session } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(async () => {
  checkOrigin(request); const result = await new Payments(getStore()).create((await context.params).id, session(request));
  return json({ order: publicOrder(result.order), approvalUrl: result.approvalUrl });
}); }
