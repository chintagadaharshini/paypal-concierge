// POST /api/orders/{id}/capture -> { status, captureId, amount }
// Captures an order the buyer approved. Only orders this server created can be captured, and the
// captured amount is checked against the price the server set. The outcome is saved to the orders
// store as a live order.

import type { NextRequest } from 'next/server';
import { forgetOrder, pendingOrder, type CatalogItem } from '@/lib/checkout';
import { addLiveOrder, type StoredOrderStatus } from '@/lib/orders-store';
import { captureOrder, PayPalApiError } from '@/lib/paypal';

export async function POST(_request: NextRequest, ctx: RouteContext<'/api/orders/[id]/capture'>) {
  const { id } = await ctx.params;
  const expected = pendingOrder(id);
  if (!expected) return Response.json({ error: 'Unknown or already captured order' }, { status: 404 });

  try {
    // A fresh request id per attempt: after INSTRUMENT_DECLINED the buyer retries with another funding
    // source, and a reused id would replay the cached decline. PayPal itself refuses a second capture.
    const order = await captureOrder(id, crypto.randomUUID());
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (order.status !== 'COMPLETED' || !capture) {
      return Response.json({ error: `Payment not completed (status ${order.status})` }, { status: 402 });
    }
    forgetOrder(id);

    const { price, currency } = expected.item;
    if (capture.amount.value !== price || capture.amount.currency_code !== currency) {
      // Should never happen: the server set the amount. Flag it rather than hide it.
      console.error(`[orders] capture ${capture.id} amount ${capture.amount.value} ${capture.amount.currency_code} != expected ${price} ${currency}`);
    }
    // Record what PayPal actually captured.
    saveLiveOrder(expected.item, 'COMPLETED', id, capture.id, capture.amount);
    return Response.json({ status: capture.status, captureId: capture.id, amount: capture.amount });
  } catch (error) {
    if (error instanceof PayPalApiError) {
      console.error(`[orders] capture failed: PayPal ${error.status}, debug_id ${error.debugId ?? 'none'}, issue ${error.issue ?? 'none'}`);
      if (error.issue === 'INSTRUMENT_DECLINED') {
        saveLiveOrder(expected.item, 'DECLINED', id, null);
        return Response.json({ error: 'Payment method declined. Choose another one in PayPal.', issue: error.issue }, { status: 422 });
      }
      if (error.issue === 'ORDER_NOT_APPROVED') {
        return Response.json({ error: 'The buyer has not approved this order yet.', issue: error.issue }, { status: 409 });
      }
    } else {
      console.error('[orders] capture failed:', error instanceof Error ? error.message : error);
    }
    return Response.json({ error: 'PayPal could not capture the payment' }, { status: 502 });
  }
}

function saveLiveOrder(
  item: CatalogItem,
  status: StoredOrderStatus,
  paypalOrderId: string,
  captureId: string | null,
  amount = { value: item.price, currency_code: item.currency },
) {
  addLiveOrder({
    request: null,
    product: item.name,
    sku: item.sku,
    category: item.category,
    merchant: null,
    amount: Number(amount.value),
    currency: amount.currency_code,
    status,
    blockedBy: null,
    paypalOrderId,
    captureId,
  });
}
