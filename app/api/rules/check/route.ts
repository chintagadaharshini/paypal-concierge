// GET /api/rules/check?sku=...&confirmed=true|false -> { allowed, results }
// Read-only preview of the spending rules for an item, so the page can show the result and hide
// the PayPal button before any click. It creates nothing; POST /api/orders checks again for real.

import type { NextRequest } from 'next/server';
import { findItem } from '@/lib/checkout';
import { DEFAULT_RULES } from '@/lib/config';
import { checkPurchase } from '@/lib/rules';

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const item = findItem(params.get('sku') ?? '');
  if (!item) return Response.json({ error: 'Unknown item' }, { status: 400 });

  const check = checkPurchase(item, { confirmed: params.get('confirmed') === 'true' }, DEFAULT_RULES);
  return Response.json(check, { headers: { 'Cache-Control': 'no-store' } });
}
