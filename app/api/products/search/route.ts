// GET /api/products/search?q=...&limit=10 -> 200 { query, products } | 4xx/5xx { error }
// Read-only product search through Channel3 (lib/channel3.ts). Prices here are for display;
// checkout re-checks the price on the server.

import type { NextRequest } from 'next/server';
import { Channel3Error, DEFAULT_LIMIT, searchProducts } from '@/lib/channel3';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get('q')?.trim() ?? '';
  if (!query) return Response.json({ error: 'Add a search query: ?q=...' }, { status: 400, headers: noStore });
  const limit = Number(params.get('limit') ?? DEFAULT_LIMIT);

  try {
    const products = await searchProducts(query, { limit: Number.isFinite(limit) ? limit : DEFAULT_LIMIT });
    return Response.json({ query, products }, { headers: noStore });
  } catch (error) {
    if (error instanceof Channel3Error) {
      return Response.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    console.error('[products/search] failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Product search failed' }, { status: 500, headers: noStore });
  }
}
