import type { SourceError } from '@/lib/dashboard-data';

// Shown above Studio when some data sources failed to load. The rest of the dashboard still works;
// widgets built on a failed source are just empty.
export function SourceErrors({ errors }: { errors: SourceError[] }) {
  if (errors.length === 0) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm text-amber-900">
      <p className="font-semibold">Some data couldn&apos;t load. Everything else on the dashboard is up to date.</p>
      <ul className="mt-1 space-y-0.5">
        {errors.map((e) => (
          <li key={e.source}>
            Couldn&apos;t load <span className="font-semibold">{e.source}</span>: {e.reason}. Charts that use it show no data.
          </li>
        ))}
      </ul>
    </div>
  );
}
