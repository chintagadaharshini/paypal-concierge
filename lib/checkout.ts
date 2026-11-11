// Server-side checkout state for the Concierge. Prices are decided here, never by the browser or
// the AI: a client only names an item, and the server looks its price up.
//
// Steps 1-2 sell fixed test items. Later steps add items the agent found on Channel3, with the
// price the server read from Channel3, before an order can be created for them.

import type { OrderItem } from './paypal';

export type CatalogItem = OrderItem & {
  category: string;
  /** Where the agent found it (merchant domain); unset for test items. */
  merchant?: string | null;
  /** What the buyer asked the agent for; unset for test items. */
  request?: string | null;
};

const TEST_ITEMS: Record<string, CatalogItem> = {
  'test-cricket-ball': {
    sku: 'test-cricket-ball',
    name: 'Leather cricket ball (test item)',
    price: '24.99',
    currency: 'USD',
    category: 'sports',
  },
  // Priced over the default spend limit (lib/config.ts), to demo a blocked payment.
  'test-cricket-bat': {
    sku: 'test-cricket-bat',
    name: 'English willow cricket bat (test item)',
    price: '89.00',
    currency: 'USD',
    category: 'sports',
  },
};

export const TEST_SKUS = Object.keys(TEST_ITEMS);

export function findItem(sku: string): CatalogItem | undefined {
  return Object.hasOwn(TEST_ITEMS, sku) ? TEST_ITEMS[sku] : undefined;
}

// Orders this server created and has not yet captured, with the amount it expects to capture.
// Kept on globalThis so dev-mode hot reloads don't forget them. In memory only: a restart forgets
// pending orders, and the buyer just starts checkout again.
type PendingOrder = { item: CatalogItem; createdAt: number };
const store = globalThis as typeof globalThis & { __pendingOrders?: Map<string, PendingOrder> };
const pending = (store.__pendingOrders ??= new Map());

const PENDING_TTL_MS = 3 * 60 * 60 * 1000; // PayPal orders expire after about 3 hours unapproved.

export function rememberOrder(orderId: string, item: CatalogItem) {
  const now = Date.now();
  for (const [id, order] of pending) if (now - order.createdAt > PENDING_TTL_MS) pending.delete(id);
  pending.set(orderId, { item, createdAt: now });
}

export const pendingOrder = (orderId: string) => pending.get(orderId);
export const forgetOrder = (orderId: string) => pending.delete(orderId);
