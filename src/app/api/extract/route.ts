import { extractionInput } from '@/lib/extraction';
import { extractSegments } from '@/lib/segment-extraction';
import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(async () => { checkOrigin(request); return json(await extractSegments(extractionInput.parse(await readJson(request))), session(request)); }); }
