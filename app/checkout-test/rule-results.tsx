import type { RuleId, RuleResult } from '@/lib/rules';

// One line per spending rule: pass or fail, and why. The start of the Concierge's "why" panel.
// `pending` rules failed only because the buyer hasn't acted yet (e.g. confirming), so they get a
// neutral marker instead of a red cross.
export function RuleResults({ results, pending = [] }: { results: RuleResult[]; pending?: RuleId[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {results.map((r) => {
        const state = r.passed ? 'passed' : pending.includes(r.id) ? 'pending' : 'failed';
        return (
          <li key={r.id} className="flex gap-2">
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${MARKER[state].className}`}
            >
              {MARKER[state].symbol}
            </span>
            <span>
              <span className="font-semibold">{r.label}</span>
              <span className="sr-only"> {state === 'pending' ? 'waiting for you' : state}</span>
              <span className="text-pp-muted">: {r.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const MARKER = {
  passed: { symbol: '✓', className: 'bg-green-600' },
  failed: { symbol: '✕', className: 'bg-red-600' },
  pending: { symbol: '…', className: 'bg-gray-400' },
} as const;
