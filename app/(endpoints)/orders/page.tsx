import type { Metadata } from 'next';
import { connection } from 'next/server';
import { listOrders } from '@/lib/orders-store';
import { EndpointPage } from '../endpoint-page';

export const metadata: Metadata = { title: 'Concierge orders' };

// Read-only view of the Concierge's orders store: seed history plus orders made in this app.
export default async function OrdersPage() {
  // The store changes as orders are made: render per request.
  await connection();
  const orders = listOrders();

  return (
    <EndpointPage
      title="Concierge orders"
      calls={['POST /v2/checkout/orders', 'POST /v2/checkout/orders/{id}/capture']}
      source="listOrders() in lib/orders-store.ts"
      note="Read from this app's in-memory store, not from PayPal. Seed orders are sample history and never went to PayPal. Live orders were made in this app: captured and declined payments (with sandbox PayPal ids) and purchases the spending rules blocked (which never reached PayPal). A server restart keeps the seed and drops live orders."
      rows={orders.map((o) => ({
        ...o,
        // The grid's dateTimeString type wants whole seconds: 'YYYY-MM-DDThh:mm:ssZ'.
        createdAt: `${o.createdAt.slice(0, 19)}Z`,
      }))}
      columns={[
        { field: 'createdAt', headerName: 'Date', cellDataType: 'dateTimeString', sort: 'desc' },
        { field: 'source', headerName: 'Source' },
        { field: 'status', headerName: 'Status' },
        { field: 'product', headerName: 'Product' },
        { field: 'category', headerName: 'Category' },
        { field: 'amount', headerName: 'Amount', type: 'money' },
        { field: 'currency', headerName: 'Currency' },
        { field: 'blockedBy', headerName: 'Blocked by' },
        { field: 'request', headerName: 'Request' },
        { field: 'merchant', headerName: 'Merchant' },
        { field: 'paypalOrderId', headerName: 'PayPal order ID' },
        { field: 'captureId', headerName: 'Capture ID' },
        { field: 'sku', headerName: 'SKU' },
        { field: 'id', headerName: 'ID' },
      ]}
    />
  );
}
