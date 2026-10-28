import { z } from 'zod';
import { assignmentSchema, mealRequestSchema } from '@/lib/domain';
import { validateAllocation } from '@/lib/allocation';
import { menu } from '@/lib/menu';
import { AppError } from '@/lib/extraction';
import { getStore, publicOrder } from '@/lib/store';
import { paymentMode } from '@/lib/paypal';
import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
import { segmentAssignmentSchema, segmentRequestSchema } from '@/lib/segments';
import { validateSegments } from '@/lib/segment-allocation';
import { LIMITS } from '@/lib/limits';
export const runtime = 'nodejs';
const input = z.object({ request: mealRequestSchema, assignments: z.array(assignmentSchema).min(1).max(30) }).strict();
const segmentInput = z.object({ request: segmentRequestSchema, assignments: z.array(segmentAssignmentSchema).min(1).max(LIMITS.assignmentLines) }).strict();
export async function POST(request: Request) { return handle(async () => {
  checkOrigin(request); const raw = await readJson(request);
  if (raw?.request?.version === 2) {
    const body = segmentInput.parse(raw);
    const checked = validateSegments(body.request, body.assignments, menu);
    if (!checked.ok) throw new AppError(422, 'INVALID_ALLOCATION', checked.issues.map(i => i.message).join(' '));
    const owner = session(request);
    return json(publicOrder(getStore().create(owner, body.request, checked.allocation, paymentMode())), owner, 201);
  }
  const body = input.parse(raw);
  const checked = validateAllocation(body.request, body.assignments, menu);
  if (!checked.ok) throw new AppError(422, 'INVALID_ALLOCATION', checked.message);
  const owner = session(request);
  return json(publicOrder(getStore().create(owner, body.request, checked.allocation, paymentMode())), owner, 201);
}); }
