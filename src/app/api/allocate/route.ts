import { mealRequestSchema } from '@/lib/domain';
import { allocate } from '@/lib/allocation';
import { menu } from '@/lib/menu';
import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
import { isSegmentRequest, segmentRequestSchema } from '@/lib/segments';
import { allocateSegments } from '@/lib/segment-allocation';
import { z } from 'zod';
import { getTasteProfile } from '@/lib/qloo';
import { tasteScores } from '@/lib/taste';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(async () => {
  checkOrigin(request); const raw = await readJson(request);
  if (raw?.request?.version === 2) {
    const body = z.object({ request: segmentRequestSchema, tasteId: z.uuid() }).strict().parse(raw);
    const owner = session(request); const profile = getTasteProfile(body.tasteId, owner);
    return json(allocateSegments(body.request, menu, undefined, tasteScores(profile.matches)), owner);
  }
  if (isSegmentRequest(raw)) return json(allocateSegments(segmentRequestSchema.parse(raw), menu), session(request));
  return json(allocate(mealRequestSchema.parse(raw), menu), session(request));
}); }
