// POST /api/agent { message } -> 200 AgentResult | 4xx/5xx { error, limit? }
// Runs the Concierge shopping agent (lib/agent.ts) on one request. It searches, explains its pick
// and returns a draftId with the rule results; it never pays. Limited per visitor and per day so
// the free Gemini and Channel3 keys survive a public demo.

import { AgentError, runAgent } from '@/lib/agent';
import { AGENT_LIMITS } from '@/lib/config';
import { geminiConfigured } from '@/lib/gemini';
import { takeAgentRun, visitorId } from '@/lib/rate-limit';

// Leave room for the agent's own timeout (AGENT_LIMITS.timeoutMs) on hosts that cap run time.
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };
const error = (status: number, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  Response.json({ error: message, ...extra }, { status, headers: { ...noStore, ...headers } });

export async function POST(request: Request) {
  if (!geminiConfigured()) return error(503, 'The agent is not configured: set GOOGLE_GENERATIVE_AI_API_KEY in .env.local.');

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return error(400, 'Tell the agent what you are looking for.');
  if (message.length > AGENT_LIMITS.maxMessageChars) return error(400, `Please keep it under ${AGENT_LIMITS.maxMessageChars} characters.`);

  const limit = takeAgentRun(visitorId(request.headers));
  if (!limit.ok) {
    const wait = limit.reason === 'daily' ? 'Please come back tomorrow.' : `Please try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`;
    return error(429, `Demo limit reached. ${wait}`, { limit: limit.reason }, { 'Retry-After': String(limit.retryAfterSeconds) });
  }

  try {
    return Response.json(await runAgent(message), { headers: noStore });
  } catch (e) {
    if (e instanceof AgentError) return error(e.status, e.message, e.status === 429 ? { limit: 'model' } : {});
    console.error('[agent] failed:', e instanceof Error ? e.message : 'unknown error');
    return error(500, 'The agent could not answer. Please try again.');
  }
}
