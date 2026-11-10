'use client';

import { useEffect, useState } from 'react';

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
  | { kind: 'error'; message: string };

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

async function createOrder(sku: string): Promise<{ orderId: string }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku }),
  });
  const data = (await res.json()) as { orderId?: string; error?: string };
  if (!res.ok || !data.orderId) throw new Error(data.error ?? 'Could not create the order');
  return { orderId: data.orderId };
}

export function PayPalCheckout({ clientId, sku, amount, currency }: { clientId: string; sku: string; amount: string; currency: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [session, setSession] = useState<OneTimeSession | null>(null);

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
          onCancel: () => setStatus({ kind: 'cancelled' }),
          onError: (error) => setStatus({ kind: 'error', message: error.message ?? 'PayPal reported an error.' }),
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
    try {
      // v6 wants the order as a Promise, not a function that returns one.
      await session.start({ presentationMode: 'auto' }, createOrder(sku));
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Checkout failed.' });
    }
  }

  if (status.kind === 'paid') {
    return (
      <div className="rounded-md bg-green-50 p-4 text-sm text-green-900">
        <p className="font-semibold">Payment captured: {status.amount}</p>
        <p className="mt-1 font-mono text-xs">Capture ID {status.captureId}</p>
      </div>
    );
  }

  const canPay = status.kind === 'ready' || status.kind === 'cancelled' || status.kind === 'error';
  return (
    <div>
      {status.kind === 'loading' && <p className="text-sm text-pp-muted">Loading PayPal…</p>}
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
    </div>
  );
}
