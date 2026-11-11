// Channel3 product search client: POST https://api.trychannel3.com/v1/search with an x-api-key header.
// Docs: https://channel3.ai/docs (API reference: /docs/api-reference/v1/search).
// Server-side only: it reads CHANNEL3_API_KEY from the environment and never logs it.
//
// Channel3 returns rich products whose price, merchant and buy link live on `offers[]`. This turns
// them into a small, flat list the Concierge can show and reason about. A product with no offer
// (so no price) is dropped, since the agent could never buy it.
//
// Two in-memory caches protect the free credits and keep prices on the server:
// - identical searches within 10 minutes are answered from memory, without calling Channel3;
// - every product returned is remembered by id, so checkout can look up its price and category
//   on the server (findCachedProduct) instead of trusting a price from the browser or the AI.

const SEARCH_URL = 'https://api.trychannel3.com/v1/search';
const TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 200;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const PRODUCT_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // As long as a pending PayPal order lives.
const MAX_CACHE_ENTRIES = 2_000;
export const MAX_LIMIT = 30; // Channel3's own cap per request.
export const DEFAULT_LIMIT = 10;

export type ProductResult = {
  id: string;
  title: string;
  /** Price in `currency` as Channel3 lists it. Display only: checkout must re-verify it on the server. */
  price: number;
  currency: string;
  imageUrl: string | null;
  /** Merchant domain selling the item, e.g. "nike.com". */
  merchant: string;
  productUrl: string;
  brand: string | null;
  category: string | null;
  /** The category's parents then the category, without the top level, e.g. ["Sports", "Cricket Bats"]. */
  categoryPath: string[];
  inStock: boolean;
};

export class Channel3Error extends Error {
  constructor(
    /** HTTP status to send the browser: 503 not configured, 504 timeout, else mirrors Channel3. */
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'Channel3Error';
  }
}

// The parts of Channel3's Product model this file reads (see the OpenAPI spec for the full shape).
type Channel3Product = {
  id: string;
  title: string;
  brands?: { id: string; name: string }[];
  images?: { url: string; is_main_image?: boolean }[];
  category?: { slug: string; title: string; path?: { slug?: string; title?: string }[] } | null;
  offers?: {
    url: string;
    domain: string;
    price: { price: number; currency: string };
    availability: 'InStock' | 'OutOfStock';
  }[];
};

// Kept on globalThis so dev-mode hot reloads don't empty them.
type Cached<T> = { value: T; at: number };
const store = globalThis as typeof globalThis & {
  __channel3Searches?: Map<string, Cached<ProductResult[]>>;
  __channel3Products?: Map<string, Cached<ProductResult>>;
};
const searchCache = (store.__channel3Searches ??= new Map<string, Cached<ProductResult[]>>());
const productCache = (store.__channel3Products ??= new Map<string, Cached<ProductResult>>());

function fresh<T>(cache: Map<string, Cached<T>>, key: string, ttlMs: number): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit) cache.delete(key);
  return undefined;
}

function put<T>(cache: Map<string, Cached<T>>, key: string, value: T) {
  cache.delete(key);
  cache.set(key, { value, at: Date.now() });
  // Maps iterate oldest first: drop the oldest entries past the cap.
  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_CACHE_ENTRIES) break;
    cache.delete(oldest);
  }
}

/** A product from a recent search, as the server saw it. Undefined if unknown or expired. */
export const findCachedProduct = (id: string) => fresh(productCache, id, PRODUCT_CACHE_TTL_MS);

export type SearchOptions = { limit?: number; /** Highest price in USD, inclusive. */ maxPrice?: number };

export async function searchProducts(query: string, { limit = DEFAULT_LIMIT, maxPrice }: SearchOptions = {}): Promise<ProductResult[]> {
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Channel3Error(503, 'Product search is not configured: set CHANNEL3_API_KEY in .env.local.');

  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return [];
  const size = Math.min(Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const max = maxPrice !== undefined && Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined;

  const cacheKey = JSON.stringify([q.toLowerCase().replace(/\s+/g, ' '), size, max ?? null]);
  const cached = fresh(searchCache, cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query: q,
        limit: size,
        // Channel3's defaults, stated explicitly: new items that are in stock.
        filters: { conditions: ['new'], availability: ['InStock'], ...(max && { price: { max_price: max } }) },
        config: { currency: 'USD', country: 'US' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Channel3Error(504, `Product search timed out after ${TIMEOUT_MS / 1000}s.`);
    }
    console.error('[channel3] search request failed:', error instanceof Error ? error.message : error);
    throw new Channel3Error(502, 'Could not reach the product search service.');
  }

  if (!res.ok) {
    // Channel3 errors are { detail: string } (or a list for 422). Log the status and detail only.
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error(`[channel3] search failed: HTTP ${res.status} ${detail}`);
    throw new Channel3Error(res.status === 429 ? 429 : 502, upstreamMessage(res.status));
  }

  const data = (await res.json().catch(() => null)) as { products?: Channel3Product[] } | null;
  if (!Array.isArray(data?.products)) {
    console.error('[channel3] search returned an unexpected body');
    throw new Channel3Error(502, 'Product search returned an unexpected response.');
  }
  const products = data.products.map(normalize).filter((p): p is ProductResult => p !== null);
  put(searchCache, cacheKey, products);
  for (const product of products) put(productCache, product.id, product);
  return products;
}

function normalize(product: Channel3Product): ProductResult | null {
  const offers = product.offers ?? [];
  const offer = offers.find((o) => o.availability === 'InStock') ?? offers[0];
  if (!product.id || !product.title || !offer || typeof offer.price?.price !== 'number') return null;

  const images = product.images ?? [];
  const image = images.find((i) => i.is_main_image) ?? images[0];
  return {
    id: product.id,
    title: product.title,
    price: offer.price.price,
    currency: offer.price.currency,
    imageUrl: image?.url ?? null,
    merchant: offer.domain,
    productUrl: offer.url,
    brand: product.brands?.[0]?.name ?? null,
    category: product.category?.title ?? null,
    categoryPath: categoryPath(product.category),
    inStock: offer.availability === 'InStock',
  };
}

function categoryPath(category: Channel3Product['category']): string[] {
  if (!category) return [];
  const parents = (category.path ?? []).map((p) => p.title).filter((t): t is string => !!t);
  // Some responses include the category itself as the last path entry; keep it once.
  if (parents.at(-1) !== category.title) parents.push(category.title);
  return parents.slice(1).length ? parents.slice(1) : parents.slice(-1);
}

function upstreamMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Product search rejected the API key (check CHANNEL3_API_KEY).';
    case 402:
      return 'Product search credits are used up for this API key.';
    case 429:
      return 'Product search is rate limited. Try again in a few seconds.';
    default:
      return `Product search failed (Channel3 HTTP ${status}).`;
  }
}
