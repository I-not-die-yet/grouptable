import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
import { createTasteProfile, tasteProfileInput } from '@/lib/qloo';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(async () => {
  checkOrigin(request); const input = tasteProfileInput.parse(await readJson(request)); const owner = session(request);
  return json(await createTasteProfile(input.ids, owner), owner);
}); }
