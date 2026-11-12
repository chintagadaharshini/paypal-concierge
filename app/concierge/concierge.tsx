'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AgentDraft, AgentResult } from '@/lib/agent';
import { askAgent, Progress, type AgentState } from '../agent-test/agent-chat';
import { PayPalCheckout } from '../checkout-test/paypal-checkout';
import { RuleResults } from '../checkout-test/rule-results';

// One example per outcome the demo needs to show. The rules decide on the server; these only
// tend to land in each case (Channel3 picks the real product and price).
const EXAMPLES = [
  { tag: 'Allowed', tone: 'bg-green-50 text-green-800', prompt: 'A gift under $50 for my brother who likes cricket' },
  { tag: 'Over spend limit', tone: 'bg-red-50 text-red-800', prompt: 'The best English willow cricket bat' },
  { tag: 'Blocked category', tone: 'bg-red-50 text-red-800', prompt: 'A bottle of single malt Scotch whisky for my dad' },
];

export function Concierge({ clientId }: { clientId: string | null }) {
  const [message, setMessage] = useState('');
  const [state, setState] = useState<AgentState>({ kind: 'idle' });
  const thinking = state.kind === 'thinking';

  async function run(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setState({ kind: 'thinking' });
    setState(await askAgent(trimmed));
  }

  return (
    <div className="min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(message);
        }}
        className="rounded-xl border border-pp-border bg-white p-4 sm:p-5"
      >
        <label htmlFor="concierge-request" className="text-sm font-semibold text-pp-navy">
          What should I buy for you?
        </label>
        <textarea
          id="concierge-request"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run(message);
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="e.g. a gift under $50 for my brother who likes cricket"
          className="mt-2 w-full resize-none rounded-lg border border-pp-border px-3 py-2.5 text-base focus:border-pp-blue focus:outline-none focus:ring-2 focus:ring-pp-blue/20"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
          <button
            type="submit"
            disabled={thinking || !message.trim()}
            className="shrink-0 rounded-full bg-pp-blue px-6 py-2.5 font-semibold text-white hover:bg-pp-blue-dark disabled:opacity-50"
          >
            {thinking ? 'Working…' : 'Ask Concierge'}
          </button>
          <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end">
            <span className="w-full text-xs text-pp-muted sm:text-right">Try an example:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.tag}
                type="button"
                disabled={thinking}
                onClick={() => {
                  setMessage(example.prompt);
                  run(example.prompt);
                }}
                title={example.prompt}
                className="flex items-center gap-2 rounded-full border border-pp-border px-3 py-1.5 text-left text-xs hover:border-pp-blue disabled:opacity-50"
              >
                <span className={`rounded-full px-2 py-0.5 font-semibold ${example.tone}`}>{example.tag}</span>
                <span className="max-w-[16rem] truncate text-pp-ink">{example.prompt}</span>
              </button>
            ))}
          </div>
        </div>
      </form>

      {thinking && <Progress />}
      {state.kind === 'error' && <ErrorNotice message={state.message} limit={state.limit} onRetry={() => run(message)} />}
      {state.kind === 'done' && <Answer key={state.result.draft?.draftId ?? state.result.recommendation} result={state.result} clientId={clientId} />}
    </div>
  );
}

function ErrorNotice({ message, limit, onRetry }: { message: string; limit: boolean; onRetry: () => void }) {
  const busy = !limit && /busy|slow/i.test(message);
  if (limit || busy) {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">{limit ? 'Demo limit reached' : 'Gemini is busy'}</p>
        <p className="mt-1 text-sm">{message}</p>
        {busy && (
          <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-amber-900 px-4 py-1.5 text-sm font-semibold text-white">
            Try again
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}

function Answer({ result, clientId }: { result: AgentResult; clientId: string | null }) {
  const [paid, setPaid] = useState(false);
  const { draft } = result;

  if (!draft) {
    return (
      <section className="mt-6 rounded-xl border border-pp-border bg-white p-5">
        <p className="font-semibold">{result.recommendation}</p>
        {result.reason && <p className="mt-1 text-sm text-pp-muted">{result.reason}</p>}
      </section>
    );
  }

  const status = paid
    ? { label: 'Paid', className: 'bg-green-600 text-white' }
    : draft.blocked
      ? { label: 'Blocked', className: 'bg-red-600 text-white' }
      : { label: 'Within your rules', className: 'bg-green-50 text-green-800' };

  return (
    <div className="mt-6 space-y-4">
      <ProductCard draft={draft} result={result} status={status} />

      <section className={`rounded-xl border bg-white p-5 ${draft.blocked ? 'border-red-200' : 'border-pp-border'}`}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-pp-muted">Why</h2>
        {draft.categoryFlag && (
          <p className="mt-2 text-sm text-pp-muted">
            Treated as “{draft.categoryFlag.category}” ({draft.categoryFlag.by === 'server' ? 'matched by the server' : 'flagged by the AI'}).
          </p>
        )}
        <div className="mt-3">
          {draft.blocked ? (
            <>
              <RuleResults results={draft.rules} pending={['confirmation']} />
              <div role="alert" className="mt-4 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-800">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-lg font-bold text-white">
                  ✕
                </span>
                <div>
                  <p className="font-semibold">Blocked, no payment possible</p>
                  <p className="text-sm">Your guardrails stopped this purchase. No PayPal order was created.</p>
                </div>
              </div>
            </>
          ) : clientId ? (
            // Re-checks the rules with the server as the confirm box changes; the server checks again on payment.
            <PayPalCheckout
              clientId={clientId}
              item={{ draftId: draft.draftId }}
              amount={draft.product.price}
              currency={draft.product.currency}
              onPaid={() => setPaid(true)}
              paidExtra={
                <Link href="/dashboard" className="mt-3 inline-block rounded-full bg-green-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-800">
                  See it on the dashboard →
                </Link>
              }
            />
          ) : (
            <p className="text-sm text-red-700">PAYPAL_CLIENT_ID is not set (see env.example).</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ProductCard({ draft, result, status }: { draft: AgentDraft; result: AgentResult; status: { label: string; className: string } }) {
  const { product } = draft;
  return (
    <section className="rounded-xl border border-pp-border bg-white p-5">
      <div className="flex gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pp-canvas sm:h-32 sm:w-32">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote merchant images from any host
            <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-pp-muted">No image</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
          <p className="mt-1.5 line-clamp-2 font-semibold leading-snug">{product.title}</p>
          <p className="mt-1 text-2xl font-semibold text-pp-navy">
            {product.price} <span className="text-sm font-normal text-pp-muted">{product.currency}</span>
          </p>
          <p className="truncate text-sm text-pp-muted">
            {product.merchant ? `from ${product.merchant}` : 'Merchant unknown'}
            {' · '}
            <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="text-pp-blue hover:underline">
              View ↗
            </a>
          </p>
        </div>
      </div>
      {(result.reason || result.recommendation) && (
        <div className="mt-4 rounded-lg bg-pp-highlight p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-pp-blue-dark">Concierge says</p>
          <p className="mt-1">{result.reason || result.recommendation}</p>
        </div>
      )}
    </section>
  );
}
