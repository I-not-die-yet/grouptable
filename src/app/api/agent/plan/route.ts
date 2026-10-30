import { agentInput, planWithAgent } from '@/lib/agent';
import { checkOrigin, handle, json, readJson, session } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(async () => {
  checkOrigin(request); const input = agentInput.parse(await readJson(request)); const owner = session(request);
  return json(await planWithAgent(input, owner, { signal: request.signal }), owner);
}); }
