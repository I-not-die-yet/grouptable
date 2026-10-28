import { mealRequestSchema } from '@/lib/domain';
import { allocate } from '@/lib/allocation';
import { menu } from '@/lib/menu';
import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
import { isSegmentRequest, segmentRequestSchema } from '@/lib/segments';
import { allocateSegments } from '@/lib/segment-allocation';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(async () => {
  checkOrigin(request); const raw = await readJson(request);
  if (isSegmentRequest(raw)) return json(allocateSegments(segmentRequestSchema.parse(raw), menu), session(request));
  return json(allocate(mealRequestSchema.parse(raw), menu), session(request));
}); }
