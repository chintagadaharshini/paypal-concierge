import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { DEFAULT_RULES } from '@/lib/config';
import { Concierge } from './concierge';

export const metadata: Metadata = {
  title: { absolute: 'PayPal Concierge' },
  description: 'An AI shopping agent that can pay, but only within your rules. PayPal sandbox only.',
};

// Step 7: the main demo page. Ask the agent for something, see its pick and why, then pay in the
// PayPal sandbox if (and only if) your guardrails allow it.
export default async function ConciergePage() {
  // Read env at request time, so a deploy picks up the client id without a rebuild.
  await connection();
  const clientId = process.env.PAYPAL_CLIENT_ID ?? null;
  const rules = DEFAULT_RULES;

  return (
    <div className="flex min-h-screen flex-col font-paypal text-pp-ink">
      <header className="border-b border-pp-border bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-baseline gap-1.5 text-lg">
            <span className="font-bold italic tracking-tight">
              <span className="text-pp-blue-dark">Pay</span>
              <span className="text-pp-sky">Pal</span>
            </span>
            <span className="font-semibold text-pp-navy">Concierge</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm font-semibold">
            <Link href="/dashboard" className="rounded-full bg-pp-highlight px-4 py-1.5 text-pp-blue-dark hover:bg-pp-blue hover:text-white">
              Dashboard →
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold text-pp-navy sm:text-4xl">PayPal Concierge</h1>
        <p className="mt-2 max-w-2xl text-base text-pp-muted">
          An AI shopping agent that finds what you ask for and can pay with PayPal, but only within the rules you set.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <Concierge clientId={clientId} />

          <aside className="rounded-xl border border-pp-border bg-white p-5 lg:sticky lg:top-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-pp-muted">Active guardrails</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li>
                <p className="font-semibold">Spend limit</p>
                <p className="text-pp-muted">
                  Up to {rules.spendLimit} {rules.currency} per purchase
                </p>
              </li>
              <li>
                <p className="font-semibold">Confirm before paying</p>
                <p className="text-pp-muted">{rules.requireConfirmation ? 'On: you tick a box before PayPal opens' : 'Off'}</p>
              </li>
              <li>
                <p className="font-semibold">Blocked categories</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {rules.blockedCategories.map((category) => (
                    <span key={category} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                      {category}
                    </span>
                  ))}
                </div>
              </li>
            </ul>
            <p className="mt-4 border-t border-pp-border pt-3 text-xs text-pp-muted">
              The server checks every rule again before it creates a PayPal order. The agent never pays or sets a price.
            </p>
          </aside>
        </div>
      </main>

      <footer className="border-t border-pp-border bg-white">
        <p className="mx-auto w-full max-w-5xl px-4 py-4 text-center text-xs text-pp-muted sm:px-6">
          Runs on the PayPal sandbox. No real money moves.
        </p>
      </footer>
    </div>
  );
}
