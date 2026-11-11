import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchForm } from './search-form';

export const metadata: Metadata = { title: 'Product search test' };

// Step 5 of the Concierge: try Channel3 product search through GET /api/products/search.
export default function SearchTestPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-16 font-paypal text-pp-ink">
      <Link href="/" className="text-sm font-semibold text-pp-blue hover:underline">
        ← All pages
      </Link>
      <h1 className="mt-3 text-[28px] font-semibold text-pp-navy">Product search test</h1>
      <p className="mt-2 text-sm text-pp-muted">
        Searches real products with the Channel3 API. Read-only: nothing is bought here.
      </p>
      <SearchForm />
    </main>
  );
}
