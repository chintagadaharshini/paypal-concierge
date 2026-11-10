'use client';

import { useEffect, useState } from 'react';
import type { RuleCheck, RuleResult } from '@/lib/rules';
import { RuleResults } from './rule-results';

// PayPal JS SDK v6, sandbox. The browser only names the item (sku); the server creates the order at
// its own price and captures it after the buyer approves.
const SDK_URL = 'https://www.sandbox.paypal.com/web-sdk/v6/core';

// The parts of the v6 SDK this component uses.
type OneTimeSession = {
  start(options: { presentationMode: 'auto' }, order: Promise<{ orderId: string }>): Promise<void>;
};
type SdkInstance = {
  findEligibleMethods(options: { currencyCode: string; amount: string }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(callbacks: {
    onApprove(data: { orderId: string }): Promise<void>;
    onCancel(): void;
    onError(error: { code?: string; message?: string }): void;
  }): OneTimeSession;
};
declare global {
  interface Window {
    paypal?: { createInstance(options: { clientId: string; components: string[]; pageType?: string }): Promise<SdkInstance> };
  }
}
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'paypal-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
    }
  }
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'paying' }
  | { kind: 'paid'; captureId: string; amount: string }
  | { kind: 'cancelled' }
  // The server refused at order creation (a fallback: the preview should have caught it first).
  | { kind: 'blocked'; rules: RuleResult[] }
  | { kind: 'error'; message: string };

// Thrown when the server's spending rules refuse the purchase; no PayPal order exists.
class BlockedError extends Error {
  constructor(
    message: string,
    readonly rules: RuleResult[],
  ) {
    super(message);
  }
}

let sdkLoad: Promise<void> | undefined;
function loadSdk(): Promise<void> {
  return (sdkLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoad = undefined;
      reject(new Error('Could not load the PayPal SDK'));
    };
    document.head.appendChild(script);
  }));
}

type CreateOrderResponse = { orderId?: string; error?: string; rules?: RuleResult[] };

async function createOrder(sku: string, confirmed: boolean): Promise<{ orderId: string; rules: RuleResult[] }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, confirmed }),
  });
  const data = (await res.json()) as CreateOrderResponse;
  if (res.status === 403 && data.rules) throw new BlockedError(data.error ?? 'Blocked by your spending rules', data.rules);
  if (!res.ok || !data.orderId) throw new Error(data.error ?? 'Could not create the order');
  return { orderId: data.orderId, rules: data.rules ?? [] };
}

// Once blocked, the block stays on screen: PayPal may report its own error as its window closes.
const unlessBlocked = (next: Status) => (prev: Status) => (prev.kind === 'blocked' ? prev : next);

// The rules preview for one tick state of the confirmation box. Read-only: it creates nothing.
type Preview = { confirmed: boolean } & ({ check: RuleCheck } | { error: string });

export function PayPalCheckout({ clientId, sku, amount, currency }: { clientId: string; sku: string; amount: string; currency: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [session, setSession] = useState<OneTimeSession | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSdk();
        const sdk = await window.paypal!.createInstance({ clientId, components: ['paypal-payments'], pageType: 'checkout' });
        const methods = await sdk.findEligibleMethods({ currencyCode: currency, amount });
        if (cancelled) return;
        if (!methods.isEligible('paypal')) {
          setStatus({ kind: 'error', message: 'PayPal is not available for this purchase.' });
          return;
        }
        const created = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST' });
            const data = (await res.json()) as { captureId?: string; amount?: { value: string; currency_code: string }; error?: string };
            if (res.ok && data.captureId && data.amount) {
              setStatus({ kind: 'paid', captureId: data.captureId, amount: `${data.amount.value} ${data.amount.currency_code}` });
            } else {
              setStatus({ kind: 'error', message: data.error ?? 'The payment could not be captured.' });
            }
          },
          onCancel: () => setStatus(unlessBlocked({ kind: 'cancelled' })),
          onError: (error) => setStatus(unlessBlocked({ kind: 'error', message: error.message ?? 'PayPal reported an error.' })),
        });
        setSession(created);
        setStatus({ kind: 'ready' });
      } catch (error) {
        if (!cancelled) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not start PayPal.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, currency, amount]);

  // Check the rules before any click, and again whenever the confirmation box changes, so the
  // PayPal button only exists for a purchase the rules allow.
  useEffect(() => {
    const controller = new AbortController();
    fetchPreview(sku, confirmed, controller.signal)
      .then((check) => setPreview({ confirmed, check }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPreview({ confirmed, error: error instanceof Error ? error.message : 'Could not check your rules.' });
        }
      });
    return () => controller.abort();
  }, [sku, confirmed]);

  function pay() {
    if (!session) return;
    setStatus({ kind: 'paying' });
    // The server re-checks every rule when it creates the order; it's the source of truth.
    const order = createOrder(sku, confirmed).then(
      (created) => ({ orderId: created.orderId }),
      (error: unknown) => {
        if (error instanceof BlockedError) setStatus({ kind: 'blocked', rules: error.rules });
        throw error;
      },
    );
    // Started straight from the click, with nothing awaited first, so popup blockers don't stop the
    // PayPal window. v6 wants the order as a Promise, not a function that returns one.
    session.start({ presentationMode: 'auto' }, order).catch((error: unknown) => {
      setStatus(unlessBlocked({ kind: 'error', message: error instanceof Error ? error.message : 'Checkout failed.' }));
    });
  }

  function onConfirmChange(checked: boolean) {
    setConfirmed(checked);
    // A server block was for the old answer; the new preview decides again.
    setStatus((prev) => (prev.kind === 'blocked' ? { kind: 'ready' } : prev));
  }

  // Only a preview for the box's current state counts; an older one may still be in state.
  const current = preview?.confirmed === confirmed ? preview : null;
  const check = current && 'check' in current ? current.check : null;
  const results = status.kind === 'blocked' ? status.rules : check?.results;
  const allowed = status.kind !== 'blocked' && check?.allowed === true;
  const busy = status.kind === 'paying';

  if (status.kind === 'paid') {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Payment captured: {status.amount}</p>
          <p className="mt-1 font-mono text-xs">Capture ID {status.captureId}</p>
        </div>
        {results && <RuleResults results={results} />}
      </div>
    );
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => onConfirmChange(e.target.checked)} disabled={busy} />
        I confirm I want to buy this for {amount} {currency}
      </label>

      <div className="mt-4">
        {results ? (
          <RuleResults results={results} />
        ) : current && 'error' in current ? (
          <p className="text-sm text-red-700">{current.error}</p>
        ) : (
          <p className="text-sm text-pp-muted">Checking your rules…</p>
        )}
      </div>

      <div className="mt-4">
        {results && !allowed ? (
          // No PayPal button at all: nothing to click, so no PayPal window can open.
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800">
            Blocked, no payment possible.
            {status.kind === 'blocked' && ' The server refused it, and no PayPal order was created.'}
          </p>
        ) : allowed && session ? (
          <paypal-button
            type="pay"
            className="paypal-gold"
            onClick={busy ? undefined : pay}
            aria-disabled={busy}
            style={{ display: 'block', maxWidth: 350, opacity: busy ? 0.6 : 1 }}
          />
        ) : allowed && status.kind === 'loading' ? (
          <p className="text-sm text-pp-muted">Loading PayPal…</p>
        ) : null}
      </div>

      {status.kind === 'paying' && <p className="mt-3 text-sm text-pp-muted">Waiting for PayPal…</p>}
      {status.kind === 'cancelled' && <p className="mt-3 text-sm text-pp-muted">Payment cancelled. You can try again.</p>}
      {status.kind === 'error' && <p className="mt-3 text-sm text-red-700">{status.message}</p>}
    </div>
  );
}

async function fetchPreview(sku: string, confirmed: boolean, signal: AbortSignal): Promise<RuleCheck> {
  const params = new URLSearchParams({ sku, confirmed: String(confirmed) });
  const res = await fetch(`/api/rules/check?${params}`, { signal, cache: 'no-store' });
  const data = (await res.json()) as Partial<RuleCheck> & { error?: string };
  if (!res.ok || !data.results) throw new Error(data.error ?? 'Could not check your rules.');
  return { allowed: data.allowed === true, results: data.results };
}
