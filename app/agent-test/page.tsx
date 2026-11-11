import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { DEFAULT_RULES } from '@/lib/config';
import { AgentChat } from './agent-chat';

export const metadata: Metadata = { title: 'Agent test' };

// Step 6 of the Concierge: ask the Gemini shopping agent for something, see its pick, the reason and
// the rule results, then pay in the PayPal sandbox if the rules allow it.
export default async function AgentTestPage() {
  // Read env at request time, so a deploy picks up the client id without a rebuild.
  await connection();
  const clientId = process.env.PAYPAL_CLIENT_ID ?? null;
  const rules = DEFAULT_RULES;

  return (
    <main className="mx-auto w-full max-w-2xl p-16 font-paypal text-pp-ink">
      <Link href="/" className="text-sm font-semibold text-pp-blue hover:underline">
        ← All pages
      </Link>
      <h1 className="mt-3 text-[28px] font-semibold text-pp-navy">Agent test</h1>
      <p className="mt-2 text-sm text-pp-muted">
        The agent searches real products and proposes one. It never pays: you confirm and click PayPal (sandbox only).
      </p>
      <p className="mt-2 text-sm text-pp-muted">
        Your rules: spend up to {rules.spendLimit} {rules.currency}
        {rules.requireConfirmation && ', confirm before paying'}, never buy {rules.blockedCategories.join(', ')}.
      </p>
      <AgentChat clientId={clientId} />
    </main>
  );
}
