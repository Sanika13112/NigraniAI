import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orderApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { EmptyState, ErrorState, OrderStatusBadge, Pagination, PaymentStatusBadge, ProductImage, Skeleton } from '../components/ui';
import { dateTime, money, pluralize } from '../lib/format';
import type { Order, Page } from '../lib/types';
import { AccountNav } from './Account';

const FILTERS: [string, string][] = [
  ['', 'All orders'],
  ['PENDING_PAYMENT', 'Awaiting payment'],
  ['CONFIRMED', 'Confirmed'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
];

export function OrderList({ data, emptyTitle, emptyText }: { data: Page<Order>; emptyTitle: string; emptyText: string }) {
  if (data.content.length === 0) {
    return <EmptyState icon="box" title={emptyTitle} action={<Link to="/shop" className="btn btn-primary">Start shopping</Link>}>{emptyText}</EmptyState>;
  }
  return (
    <ul className="order-list">
      {data.content.map((o) => (
        <li key={o.id} className="order-row">
          <Link to={`/account/orders/${o.id}`} className="order-row-link">
            <div className="order-thumbs">
              {o.items.slice(0, 3).map((i) => <ProductImage key={i.productId} src={i.imageUrl} alt={i.name} />)}
            </div>
            <div className="order-row-info">
              <strong>Order #{o.id}</strong>
              <span className="muted small">{dateTime(o.createdAt)}, {pluralize(o.items.reduce((n, i) => n + i.quantity, 0), 'item')}</span>
              <span className="small">{o.items.map((i) => i.name).join(', ')}</span>
            </div>
            <div className="order-row-status">
              <OrderStatusBadge status={o.status} />
              <PaymentStatusBadge status={o.paymentStatus} />
              <strong>{money(o.totalAmount, true)}</strong>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Orders() {
  useDocumentTitle('Order history');
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useAsync(() => orderApi.mine(page, 10, status || undefined), [page, status]);

  return (
    <div className="container section account-layout">
      <AccountNav />
      <div className="account-main">
        <h1>Order history</h1>
        <div className="chip-row" role="tablist" aria-label="Filter orders">
          {FILTERS.map(([v, l]) => (
            <button key={v || 'all'} role="tab" aria-selected={status === v} className={`chip ${status === v ? 'active' : ''}`}
              onClick={() => { setStatus(v); setPage(0); }}>{l}</button>
          ))}
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading || !data ? (
          <div className="stack">{Array.from({ length: 3 }, (_, i) => <div key={i} className="card"><Skeleton width="100%" height={70} /></div>)}</div>
        ) : (
          <>
            <OrderList data={data} emptyTitle={status ? 'No orders with this status' : 'No orders yet'} emptyText={status ? 'Try another filter.' : 'Orders you place will appear here.'} />
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

export function Returns() {
  useDocumentTitle('Returns & refunds');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAsync(() => orderApi.returns(page, 10), [page]);
  return (
    <div className="container section account-layout">
      <AccountNav />
      <div className="account-main">
        <h1>Returns & refunds</h1>
        <p className="muted">Return requests and refunds for your orders. A refund shows as complete only after the payment provider confirms it.</p>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading || !data ? <Skeleton width="100%" height={120} /> : (
          <>
            <OrderList data={data} emptyTitle="No returns or refunds" emptyText="To return a delivered item, open the order and choose Request a return." />
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
