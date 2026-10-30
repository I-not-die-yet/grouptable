import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
import { searchRestaurants, tasteSearchInput } from '@/lib/qloo';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(async () => {
  checkOrigin(request); const input = tasteSearchInput.parse(await readJson(request)); const owner = session(request);
  return json(await searchRestaurants(input.query, owner), owner);
}); }
