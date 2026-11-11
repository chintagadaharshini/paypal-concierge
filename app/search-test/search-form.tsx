'use client';

import { useState } from 'react';
import type { ProductResult } from '@/lib/channel3';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; query: string; products: ProductResult[] };

export function SearchForm() {
  const [query, setQuery] = useState('cricket gift');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (!res.ok) setState({ kind: 'error', message: body.error ?? `HTTP ${res.status}` });
      else setState({ kind: 'done', query: body.query, products: body.products });
    } catch {
      setState({ kind: 'error', message: 'Network error' });
    }
  }

  return (
    <>
      <form onSubmit={search} className="mt-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. cricket bat under 50"
          className="flex-1 rounded-md border border-pp-border bg-white px-3 py-2"
        />
        <button
          type="submit"
          disabled={state.kind === 'loading'}
          className="rounded-md bg-pp-blue px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {state.kind === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {state.kind === 'error' && <p className="mt-4 text-sm text-red-700">{state.message}</p>}
      {state.kind === 'done' && state.products.length === 0 && (
        <p className="mt-4 text-sm text-pp-muted">No products found for “{state.query}”.</p>
      )}
      {state.kind === 'done' && state.products.length > 0 && (
        <ul className="mt-6 divide-y divide-pp-border border-y border-pp-border">
          {state.products.map((p) => (
            <li key={p.id} className="flex gap-4 py-4">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote merchant images from any host
                <img src={p.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded object-contain" />
              ) : (
                <div className="h-20 w-20 shrink-0 rounded bg-pp-border" />
              )}
              <div className="min-w-0">
                <p className="font-semibold">{p.title}</p>
                <p className="mt-1 text-lg font-semibold text-pp-navy">
                  {p.price.toFixed(2)} <span className="text-sm font-normal text-pp-muted">{p.currency}</span>
                </p>
                <p className="mt-1 text-sm text-pp-muted">
                  {[p.brand, p.category, p.merchant].filter(Boolean).join(' · ')}
                </p>
                <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-pp-blue hover:underline">
                  View at merchant ↗
                </a>
                <p className="mt-1 font-mono text-xs text-pp-muted">{p.id}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
