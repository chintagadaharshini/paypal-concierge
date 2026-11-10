'use client';

import { useEffect, useState } from 'react';
import type { RuleResult } from '@/lib/rules';
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
  | { kind: 'blocked'; message: string }
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

export function PayPalCheckout({ clientId, sku, amount, currency }: { clientId: string; sku: string; amount: string; currency: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [session, setSession] = useState<OneTimeSession | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rules, setRules] = useState<RuleResult[] | null>(null);

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

  async function pay() {
    if (!session) return;
    setStatus({ kind: 'paying' });
    setRules(null);
    // The server checks the rules when it creates the order; show the result either way.
    const order = createOrder(sku, confirmed).then(
      (created) => {
        setRules(created.rules);
        return { orderId: created.orderId };
      },
      (error: unknown) => {
        if (error instanceof BlockedError) {
          setRules(error.rules);
          setStatus({ kind: 'blocked', message: error.message });
        }
        throw error;
      },
    );
    try {
      // v6 wants the order as a Promise, not a function that returns one.
      await session.start({ presentationMode: 'auto' }, order);
    } catch (error) {
      setStatus(unlessBlocked({ kind: 'error', message: error instanceof Error ? error.message : 'Checkout failed.' }));
    }
  }

  if (status.kind === 'paid') {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Payment captured: {status.amount}</p>
          <p className="mt-1 font-mono text-xs">Capture ID {status.captureId}</p>
        </div>
        {rules && <RuleResults results={rules} />}
      </div>
    );
  }

  const canPay = status.kind !== 'loading' && status.kind !== 'paying';
  return (
    <div>
      {status.kind === 'loading' && <p className="text-sm text-pp-muted">Loading PayPal…</p>}
      {session && (
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!canPay} />
          I confirm I want to buy this for {amount} {currency}
        </label>
      )}
      {session && (
        <paypal-button
          type="pay"
          className="paypal-gold"
          onClick={canPay ? pay : undefined}
          aria-disabled={!canPay}
          style={{ display: 'block', maxWidth: 350, opacity: canPay ? 1 : 0.6 }}
        />
      )}
      {status.kind === 'paying' && <p className="mt-3 text-sm text-pp-muted">Waiting for PayPal…</p>}
      {status.kind === 'cancelled' && <p className="mt-3 text-sm text-pp-muted">Payment cancelled. You can try again.</p>}
      {status.kind === 'error' && <p className="mt-3 text-sm text-red-700">{status.message}</p>}
      {status.kind === 'blocked' && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800">
          Payment blocked. No PayPal order was created.
        </p>
      )}
      {rules && status.kind !== 'paying' && (
        <div className="mt-4">
          <RuleResults results={rules} />
        </div>
      )}
    </div>
  );
}
