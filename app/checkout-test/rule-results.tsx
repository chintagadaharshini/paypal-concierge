import type { RuleResult } from '@/lib/rules';

// One line per spending rule: pass or fail, and why. The start of the Concierge's "why" panel.
export function RuleResults({ results }: { results: RuleResult[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {results.map((r) => (
        <li key={r.id} className="flex gap-2">
          <span
            aria-hidden
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${r.passed ? 'bg-green-600' : 'bg-red-600'}`}
          >
            {r.passed ? '✓' : '✕'}
          </span>
          <span>
            <span className="font-semibold">{r.label}</span>
            <span className="sr-only">{r.passed ? ' passed' : ' failed'}</span>
            <span className="text-pp-muted">: {r.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
