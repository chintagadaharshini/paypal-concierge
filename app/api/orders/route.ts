// POST /api/orders { sku | draftId, confirmed } -> 200 { orderId, rules } | 403 { error, rules }
// The item is a test item (sku) or a draft the shopping agent proposed (draftId, lib/drafts.ts).
// Never a price: the server runs the spending rules on its own price and category for the item, and
// only if every rule passes does it create a PayPal sandbox order. A blocked purchase never reaches
// PayPal.

import { rememberOrder } from '@/lib/checkout';
import { DEFAULT_RULES } from '@/lib/config';
import { resolveCheckoutItem } from '@/lib/drafts';
import { addLiveOrder } from '@/lib/orders-store';
import { createOrder, PayPalApiError } from '@/lib/paypal';
import { checkPurchase, failedRuleNames } from '@/lib/rules';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sku?: unknown; draftId?: unknown; confirmed?: unknown } | null;
  const item = body ? resolveCheckoutItem(body) : undefined;
  if (!item) return Response.json({ error: 'Unknown item, or the draft has expired. Ask the agent again.' }, { status: 400 });

  // Only the buyer's yes/no comes from the browser; price and category are the server's.
  const check = checkPurchase(item, { confirmed: body?.confirmed === true }, DEFAULT_RULES);
  if (!check.allowed) {
    const failed = check.results.filter((r) => !r.passed).map((r) => r.label);
    console.info(`[orders] blocked ${item.sku}: ${failed.join(', ')}`);
    addLiveOrder({
      request: item.request ?? null,
      product: item.name,
      sku: item.sku,
      category: item.category,
      merchant: item.merchant ?? null,
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
