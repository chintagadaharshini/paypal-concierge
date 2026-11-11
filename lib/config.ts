// App-wide settings for the Concierge, in one place.

export type SpendingRules = {
  /** Most the agent may spend on one purchase, as a decimal string in `currency`. */
  spendLimit: string;
  currency: string;
  /** The buyer must explicitly confirm before PayPal is opened. */
  requireConfirmation: boolean;
  /** Product categories the agent may never buy (lower case). */
  blockedCategories: string[];
};

// The default rules for every visitor. Kept low so the demo can show a blocked payment.
export const DEFAULT_RULES: SpendingRules = {
  spendLimit: '50.00',
  currency: 'USD',
  requireConfirmation: true,
  blockedCategories: ['alcohol', 'tobacco', 'weapons', 'gambling', 'gift cards'],
};

// --- Shopping agent (POST /api/agent) ---------------------------------------------------

// The one place the Gemini model is named. Checked against Google's docs and model list on
// 2026-11-11: gemini-3.5-flash-lite is a stable, free-tier Flash model with function calling, and it
// handled the agent's tools well in testing. Alternatives: gemini-3.6-flash also works, but its free
// tier allows only 20 requests a day per project (about 6 agent runs); gemini-3.8-flash was timing
// out under load; gemini-2.5-flash is closed to new keys. Check your limits at
// https://aistudio.google.com/rate-limit before a demo.
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Used only when GEMINI_MODEL times out or keeps returning 503: the run restarts on this model with
// the time left. Checked on 2026-11-11: gemini-3.6-flash is a stable model with function calling
// (default thinking: medium). Its free tier allows 20 requests a day per project
// (GenerateRequestsPerDayPerProjectPerModel-FreeTier), a separate quota from GEMINI_MODEL's.
export const GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';

// Guards that keep the free Gemini and Channel3 keys from being drained by a public demo.
export const AGENT_LIMITS = {
  /** Agent runs one visitor (IP address) may start per window. */
  perVisitor: 5,
  windowMs: 10 * 60 * 1000,
  /** Agent runs for all visitors together per UTC day. */
  perDay: 100,
  maxMessageChars: 500,
  /** Model round trips per run (each tool result is one more). */
  maxSteps: 6,
  /** Channel3 searches and drafts the agent may make in one run. */
  maxSearches: 2,
  maxProposals: 2,
  /** Output tokens per model call, thinking included. */
  maxOutputTokens: 1500,
  /**
   * Cap on thinking tokens per call. gemini-3.5-flash-lite defaults to "minimal" thinking and, in a
   * test on 2026-11-11, used 0 thinking tokens at budgets 512 and 128 alike; 0 is rejected (400).
   * So this is a ceiling against spikes, not a speed-up: call latency comes from Gemini's load.
   */
  thinkingBudget: 128,
  /** The whole run, fallback included. Below the route's 60s maxDuration (app/api/agent/route.ts). */
  timeoutMs: 55_000,
  /** The primary model's share; the fallback gets the rest. */
  primaryTimeoutMs: 28_000,
} as const;
