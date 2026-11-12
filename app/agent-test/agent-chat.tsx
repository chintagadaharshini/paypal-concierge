'use client';

import { useEffect, useState } from 'react';
import type { AgentResult } from '@/lib/agent';
import { PayPalCheckout } from '../checkout-test/paypal-checkout';
import { RuleResults } from '../checkout-test/rule-results';

export type AgentState =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  /** `limit`: a demo or AI quota was hit (the server sent `limit`), so retrying now won't help. */
  | { kind: 'error'; message: string; limit: boolean }
  | { kind: 'done'; result: AgentResult };

// The agent answers in one response, so progress follows the clock: a typical run spends its
// first seconds searching, then proposes (the rules run on the server), then writes the answer.
// Past AGENT_LIMITS.primaryTimeoutMs the server restarts on its fallback model.
const STAGES: { from: number; label: string }[] = [
  { from: 0, label: 'Searching products…' },
  { from: 9, label: 'Checking your rules…' },
  { from: 18, label: 'Writing the recommendation…' },
  { from: 28, label: 'Gemini is slow right now, still working…' },
];

export function Progress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const stage = STAGES.findLast((s) => seconds >= s.from) ?? STAGES[0];
  return (
    <div role="status" aria-live="polite" className="mt-6 flex items-center gap-3 rounded-lg border border-pp-border bg-white p-4 text-sm">
      <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-pp-border border-t-pp-blue" />
      <span className="font-semibold">{stage.label}</span>
      <span className="ml-auto tabular-nums text-pp-muted">{seconds}s</span>
    </div>
  );
}

/** POST /api/agent, as the state to show next (never 'thinking'). */
export async function askAgent(message: string): Promise<AgentState> {
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const body = await res.json();
    if (!res.ok) return { kind: 'error', message: body.error ?? `HTTP ${res.status}`, limit: !!body.limit };
    return { kind: 'done', result: body as AgentResult };
  } catch {
    return { kind: 'error', message: 'Network error', limit: false };
  }
}

const EXAMPLES = ['A gift under $50 for my brother who likes cricket', 'The best English willow cricket bat', 'A bottle of single malt Scotch whisky for my dad'];

export function AgentChat({ clientId }: { clientId: string | null }) {
  const [message, setMessage] = useState(EXAMPLES[0]);
  const [state, setState] = useState<AgentState>({ kind: 'idle' });

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || state.kind === 'thinking') return;
    setState({ kind: 'thinking' });
    setState(await askAgent(message));
  }

  return (
    <>
      <form onSubmit={ask} className="mt-6">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-md border border-pp-border bg-white px-3 py-2"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={state.kind === 'thinking'}
            className="rounded-md bg-pp-blue px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {state.kind === 'thinking' ? 'Working…' : 'Ask the agent'}
          </button>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setMessage(example)} className="text-xs text-pp-blue hover:underline">
              {example}
            </button>
          ))}
        </div>
      </form>

      {state.kind === 'thinking' && <Progress />}
      {state.kind === 'error' && (
        <p className={`mt-4 rounded-md p-3 text-sm ${state.limit ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>{state.message}</p>
      )}
      {state.kind === 'done' && <AgentAnswer result={state.result} clientId={clientId} />}
    </>
  );
}

function AgentAnswer({ result, clientId }: { result: AgentResult; clientId: string | null }) {
  const { draft } = result;
  return (
    <section className="mt-6 space-y-4 rounded-lg border border-pp-border bg-white p-6">
      <div>
        <p className="font-semibold">{result.recommendation}</p>
        {result.reason && <p className="mt-1 text-sm text-pp-muted">{result.reason}</p>}
      </div>

      {draft && (
        <>
          <div className="flex gap-4">
            {draft.product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote merchant images from any host
              <img src={draft.product.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded object-contain" />
            ) : null}
            <div className="min-w-0">
              <p className="font-semibold">{draft.product.title}</p>
              <p className="mt-1 text-lg font-semibold text-pp-navy">
                {draft.product.price} <span className="text-sm font-normal text-pp-muted">{draft.product.currency}</span>
              </p>
              <p className="text-sm text-pp-muted">
                {[draft.product.brand, draft.product.category, draft.product.merchant].filter(Boolean).join(' · ')}
              </p>
              <a href={draft.product.productUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-pp-blue hover:underline">
                View at merchant ↗
              </a>
            </div>
          </div>

          {draft.categoryFlag && (
            <p className="text-sm text-pp-muted">
              Treated as “{draft.categoryFlag.category}” ({draft.categoryFlag.by === 'server' ? 'matched by the server' : 'flagged by the AI'}).
            </p>
          )}

          {draft.blocked ? (
            <>
              <RuleResults results={draft.rules} pending={['confirmation']} />
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800">
                Blocked by your spending rules, no payment possible.
              </p>
            </>
          ) : clientId ? (
            // Re-checks the rules with the server as the confirm box changes; the server checks again on payment.
            <PayPalCheckout key={draft.draftId} clientId={clientId} item={{ draftId: draft.draftId }} amount={draft.product.price} currency={draft.product.currency} />
          ) : (
            <p className="text-sm text-red-700">PAYPAL_CLIENT_ID is not set (see env.example).</p>
          )}
          <p className="font-mono text-xs text-pp-muted">Draft {draft.draftId}</p>
        </>
      )}

      {result.toolsUsed.length > 0 && <p className="text-xs text-pp-muted">Tools used: {result.toolsUsed.join(' → ')}</p>}
    </section>
  );
}
