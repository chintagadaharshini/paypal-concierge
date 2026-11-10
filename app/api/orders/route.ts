// POST /api/orders { sku, confirmed } -> 200 { orderId, rules } | 403 { error, rules }
// Runs the spending rules on the server's own price and category for the item. Only if every rule
// passes does it create a PayPal sandbox order; a blocked purchase never reaches PayPal.

import { findItem, rememberOrder } from '@/lib/checkout';
import { DEFAULT_RULES } from '@/lib/config';
import { addLiveOrder } from '@/lib/orders-store';
import { createOrder, PayPalApiError } from '@/lib/paypal';
import { checkPurchase, failedRuleNames } from '@/lib/rules';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sku?: unknown; confirmed?: unknown } | null;
  const item = typeof body?.sku === 'string' ? findItem(body.sku) : undefined;
  if (!item) return Response.json({ error: 'Unknown item' }, { status: 400 });

  // Only the buyer's yes/no comes from the browser; price and category are the server's.
  const check = checkPurchase(item, { confirmed: body?.confirmed === true }, DEFAULT_RULES);
  if (!check.allowed) {
    const failed = check.results.filter((r) => !r.passed).map((r) => r.label);
    console.info(`[orders] blocked ${item.sku}: ${failed.join(', ')}`);
    addLiveOrder({
      request: null,
      product: item.name,
      sku: item.sku,
      category: item.category,
      merchant: null,
      amount: Number(item.price),
      currency: item.currency,
      status: 'BLOCKED',
      blockedBy: failedRuleNames(check.results),
      paypalOrderId: null,
      captureId: null,
    });
    return Response.json({ error: `Blocked by your spending rules: ${failed.join(', ')}`, rules: check.results }, { status: 403 });
  }

  try {
    const order = await createOrder(item, crypto.randomUUID());
    rememberOrder(order.id, item);
    return Response.json({ orderId: order.id, rules: check.results });
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
