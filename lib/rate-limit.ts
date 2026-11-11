// In-memory limits for POST /api/agent, so a public demo can't drain the free Gemini and Channel3
// keys: a sliding window per visitor (by IP address) and a cap for everyone per UTC day.
// One server process, so memory is enough; a restart resets the counts.

import { AGENT_LIMITS } from './config';

type LimitState = { visitors: Map<string, number[]>; day: string; dayCount: number };
const store = globalThis as typeof globalThis & { __agentLimits?: LimitState };
const state = (store.__agentLimits ??= { visitors: new Map<string, number[]>(), day: '', dayCount: 0 });

export type LimitResult = { ok: true } | { ok: false; reason: 'visitor' | 'daily'; retryAfterSeconds: number };

/** Counts one agent run for `visitor` if the limits allow it. */
export function takeAgentRun(visitor: string, now = Date.now()): LimitResult {
  const today = new Date(now).toISOString().slice(0, 10);
  if (state.day !== today) {
    state.day = today;
    state.dayCount = 0;
  }
  if (state.dayCount >= AGENT_LIMITS.perDay) {
    const midnight = Date.parse(`${today}T00:00:00Z`) + 24 * 60 * 60 * 1000;
    return { ok: false, reason: 'daily', retryAfterSeconds: Math.ceil((midnight - now) / 1000) };
  }

  // Forget visitors whose window has passed, so the map stays small.
  for (const [key, times] of state.visitors) {
    if (times.every((t) => now - t >= AGENT_LIMITS.windowMs)) state.visitors.delete(key);
  }
  const recent = (state.visitors.get(visitor) ?? []).filter((t) => now - t < AGENT_LIMITS.windowMs);
  if (recent.length >= AGENT_LIMITS.perVisitor) {
    return { ok: false, reason: 'visitor', retryAfterSeconds: Math.ceil((recent[0] + AGENT_LIMITS.windowMs - now) / 1000) };
  }

  recent.push(now);
  state.visitors.set(visitor, recent);
  state.dayCount++;
  return { ok: true };
}

/**
 * The visitor's IP address. A client can send its own X-Forwarded-For, so its first entry can't be
 * trusted; the proxy in front of the app (Render's) appends the address it actually saw, so the
 * last entry is the real one.
 */
export function visitorId(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || headers.get('x-real-ip') || 'local';
}
