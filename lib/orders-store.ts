// The Concierge's orders: what the agent bought, or tried to buy. Kept in memory and started from
// seed data (data/seed-orders.json) so the dashboard has history to show. Orders made in this app
// are added with source 'live'. A restart (or a Render deploy) drops live orders and keeps the seed.

import seedFile from '@/data/seed-orders.json';

export type OrderSource = 'seed' | 'live';
export type StoredOrderStatus = 'COMPLETED' | 'BLOCKED' | 'DECLINED';

export type StoredOrder = {
  id: string;
  source: OrderSource;
  /** ISO 8601, UTC. */
  createdAt: string;
  /** What the buyer asked the agent for, when there was a request. */
  request: string | null;
  product: string;
  sku: string | null;
  category: string;
  merchant: string | null;
  amount: number;
  currency: string;
  status: StoredOrderStatus;
  /** Names of the rules that refused the purchase, e.g. 'Spend limit'; null unless BLOCKED. */
  blockedBy: string | null;
  /** PayPal sandbox ids; null for seed orders and for purchases that never reached PayPal. */
  paypalOrderId: string | null;
  captureId: string | null;
};

type SeedOrder = Omit<StoredOrder, 'source' | 'createdAt' | 'amount' | 'sku' | 'paypalOrderId' | 'captureId'> & {
  daysAgo: number;
  /** Local time of day, 'HH:MM'. */
  time: string;
  amount: string;
};

// Seed dates are relative to when the server starts, so the history always looks recent.
function fromSeed(seed: SeedOrder, now: Date): StoredOrder {
  const [hours, minutes] = seed.time.split(':').map(Number);
  const date = new Date(now);
  date.setDate(date.getDate() - seed.daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return {
    id: seed.id,
    source: 'seed',
    createdAt: date.toISOString(),
    request: seed.request,
    product: seed.product,
    sku: null,
    category: seed.category,
    merchant: seed.merchant,
    amount: Number(seed.amount),
    currency: seed.currency,
    status: seed.status,
    blockedBy: seed.blockedBy,
    paypalOrderId: null,
    captureId: null,
  };
}

// Live orders kept at most, so repeated requests can't grow memory without bound.
const MAX_LIVE_ORDERS = 500;

// On globalThis so dev-mode hot reloads keep the same store.
const holder = globalThis as typeof globalThis & { __ordersStore?: StoredOrder[] };
const orders = (holder.__ordersStore ??= (seedFile as SeedOrder[]).map((seed) => fromSeed(seed, new Date())));

/** Every order, newest first. Copies, so callers can't change the store. */
export function listOrders(): StoredOrder[] {
  return orders.map((o) => ({ ...o })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Records an order made in this app (source 'live'). */
export function addLiveOrder(order: Omit<StoredOrder, 'id' | 'source' | 'createdAt'>): StoredOrder {
  const stored: StoredOrder = { ...order, id: `live-${crypto.randomUUID().slice(0, 8)}`, source: 'live', createdAt: new Date().toISOString() };
  orders.push(stored);

  const live = orders.filter((o) => o.source === 'live');
  if (live.length > MAX_LIVE_ORDERS) orders.splice(orders.indexOf(live[0]), 1);
  return stored;
}
