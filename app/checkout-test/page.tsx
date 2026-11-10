import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { findItem } from '@/lib/checkout';
import { PayPalCheckout } from './paypal-checkout';

export const metadata: Metadata = { title: 'Checkout test' };

const SKU = 'test-cricket-ball';

// Step 1 of the Concierge: a fixed item paid for with the PayPal JS SDK v6 in the sandbox.
export default async function CheckoutTestPage() {
  // Read env at request time, so a deploy picks up the client id without a rebuild.
  await connection();
  const item = findItem(SKU)!;
  // The client id is public (it identifies the app, it's not a secret); the secret stays on the server.
  const clientId = process.env.PAYPAL_CLIENT_ID;

  return (
    <main className="mx-auto w-full max-w-xl p-16 font-paypal text-pp-ink">
      <Link href="/" className="text-sm font-semibold text-pp-blue hover:underline">
        ← All pages
      </Link>
      <h1 className="mt-3 text-[28px] font-semibold text-pp-navy">Checkout test</h1>
      <p className="mt-2 text-sm text-pp-muted">
        PayPal sandbox only. Pay with a sandbox personal account; no real money moves.
      </p>
      <div className="mt-6 rounded-lg border border-pp-border bg-white p-6">
        <p className="font-semibold">{item.name}</p>
        <p className="mt-1 text-2xl font-semibold text-pp-navy">
          ${item.price} <span className="text-sm font-normal text-pp-muted">{item.currency}</span>
        </p>
        <div className="mt-6">
          {clientId ? (
            <PayPalCheckout clientId={clientId} sku={item.sku} amount={item.price} currency={item.currency} />
          ) : (
            <p className="text-sm text-red-700">PAYPAL_CLIENT_ID is not set (see env.example).</p>
          )}
        </div>
      </div>
    </main>
  );
}
