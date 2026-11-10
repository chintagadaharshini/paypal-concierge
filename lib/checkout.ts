// Server-side checkout state for the Concierge. Prices are decided here, never by the browser or
// the AI: a client only names an item, and the server looks its price up.
//
// Step 1 sells one fixed test item. Later steps add items the agent found on Channel3, with the
// price the server read from Channel3, before an order can be created for them.

import type { OrderItem } from './paypal';

const TEST_ITEMS: Record<string, OrderItem> = {
  'test-cricket-ball': { sku: 'test-cricket-ball', name: 'Leather cricket ball (test item)', price: '24.99', currency: 'USD' },
};

export function findItem(sku: string): OrderItem | undefined {
  return Object.hasOwn(TEST_ITEMS, sku) ? TEST_ITEMS[sku] : undefined;
}

// Orders this server created and has not yet captured, with the amount it expects to capture.
// Kept on globalThis so dev-mode hot reloads don't forget them. In memory only: a restart forgets
// pending orders, and the buyer just starts checkout again.
type PendingOrder = { item: OrderItem; createdAt: number };
const store = globalThis as typeof globalThis & { __pendingOrders?: Map<string, PendingOrder> };
const pending = (store.__pendingOrders ??= new Map());

const PENDING_TTL_MS = 3 * 60 * 60 * 1000; // PayPal orders expire after about 3 hours unapproved.

export function rememberOrder(orderId: string, item: OrderItem) {
  const now = Date.now();
  for (const [id, order] of pending) if (now - order.createdAt > PENDING_TTL_MS) pending.delete(id);
  pending.set(orderId, { item, createdAt: now });
}

export const pendingOrder = (orderId: string) => pending.get(orderId);
export const forgetOrder = (orderId: string) => pending.delete(orderId);
