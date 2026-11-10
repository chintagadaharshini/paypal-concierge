// POST /api/orders { sku } -> { orderId }
// Creates a PayPal sandbox order for an item the server knows, at the server's price.

import { findItem, rememberOrder } from '@/lib/checkout';
import { createOrder, PayPalApiError } from '@/lib/paypal';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sku?: unknown } | null;
  const item = typeof body?.sku === 'string' ? findItem(body.sku) : undefined;
  if (!item) return Response.json({ error: 'Unknown item' }, { status: 400 });

  try {
    const order = await createOrder(item, crypto.randomUUID());
    rememberOrder(order.id, item);
    return Response.json({ orderId: order.id });
  } catch (error) {
    logPayPalError('create order', error);
    return Response.json({ error: 'PayPal could not create the order' }, { status: 502 });
  }
}

function logPayPalError(action: string, error: unknown) {
  if (error instanceof PayPalApiError) {
    console.error(`[orders] ${action} failed: PayPal ${error.status}, debug_id ${error.debugId ?? 'none'}, issue ${error.issue ?? 'none'}`);
  } else {
    console.error(`[orders] ${action} failed:`, error instanceof Error ? error.message : error);
  }
}
