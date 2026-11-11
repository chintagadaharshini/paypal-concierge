// Purchase drafts: a product the agent proposed, frozen at the price and category the SERVER
// read from Channel3. The browser and the agent only ever hold the draftId; POST /api/orders
// creates the PayPal order from the stored draft and checks every rule again.
//
// In memory, like pending orders (lib/checkout.ts): a restart forgets drafts and the buyer asks
// the agent again.

import { blockedCategoryOf } from './categories';
import { findCachedProduct, type ProductResult } from './channel3';
import { findItem, type CatalogItem } from './checkout';
import type { SpendingRules } from './config';

export type Draft = {
  id: string;
  createdAt: number;
  item: CatalogItem;
  product: ProductResult;
  /** Set when the product was mapped to a blocked category, and by whom. */
  categoryFlag: { category: string; by: 'server' | 'agent' } | null;
};

const DRAFT_TTL_MS = 3 * 60 * 60 * 1000; // PayPal orders expire after about 3 hours unapproved.
const MAX_DRAFTS = 1_000;

const store = globalThis as typeof globalThis & { __drafts?: Map<string, Draft> };
const drafts = (store.__drafts ??= new Map<string, Draft>());

/**
 * Freezes a recently searched product into a draft. Price, currency, title, merchant and category
 * all come from the server's own Channel3 cache. `agentFlag` lets the agent mark the product as a
 * blocked category the keyword rules missed; it can only make a purchase stricter.
 * Returns undefined if the product is not in the cache (unknown id, or the search expired).
 */
export function createDraft(productId: string, request: string, rules: SpendingRules, agentFlag?: string | null): Draft | undefined {
  const product = findCachedProduct(productId);
  if (!product) return undefined;

  const serverFlag = blockedCategoryOf(product.title, product.categoryPath, rules.blockedCategories);
  const agentCategory = agentFlag && rules.blockedCategories.includes(agentFlag) ? agentFlag : null;
  const categoryFlag = serverFlag
    ? { category: serverFlag, by: 'server' as const }
    : agentCategory
      ? { category: agentCategory, by: 'agent' as const }
      : null;

  const id = `draft_${crypto.randomUUID()}`;
  const draft: Draft = {
    id,
    createdAt: Date.now(),
    product,
    categoryFlag,
    item: {
      sku: `c3_${product.id}`,
      name: product.title,
      // PayPal and the rules engine take decimal strings; Channel3 sends a number.
      price: product.price.toFixed(2),
      currency: product.currency,
      // A flagged product is checked (and recorded) as the blocked category it matched.
      category: categoryFlag?.category ?? product.category?.toLowerCase() ?? 'uncategorized',
      merchant: product.merchant,
      request: request.slice(0, 500),
    },
  };

  const now = Date.now();
  for (const [key, old] of drafts) if (now - old.createdAt > DRAFT_TTL_MS || drafts.size >= MAX_DRAFTS) drafts.delete(key);
  drafts.set(id, draft);
  return draft;
}

export function findDraft(draftId: string): Draft | undefined {
  const draft = drafts.get(draftId);
  if (draft && Date.now() - draft.createdAt > DRAFT_TTL_MS) {
    drafts.delete(draftId);
    return undefined;
  }
  return draft;
}

/** The item behind a checkout request: a test item by sku, or an agent draft by draftId. */
export function resolveCheckoutItem(ref: { sku?: unknown; draftId?: unknown }): CatalogItem | undefined {
  if (typeof ref.draftId === 'string' && ref.draftId) return findDraft(ref.draftId)?.item;
  if (typeof ref.sku === 'string' && ref.sku) return findItem(ref.sku);
  return undefined;
}
