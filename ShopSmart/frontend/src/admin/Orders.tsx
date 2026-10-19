import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { orderApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { ConfirmDialog, EmptyState, ErrorState, Modal, OrderStatusBadge, Pagination, PaymentStatusBadge, Skeleton } from '../components/ui';
import { AddressBlock } from '../components/AddressForm';
import { ORDER_STATUS_LABEL, dateTime, money } from '../lib/format';
import type { Order } from '../lib/types';

/** Mirrors the server's transition table for button display; the server enforces it. */
const NEXT: Record<string, { status: string; label: string; danger?: boolean }[]> = {
  PENDING_PAYMENT: [{ status: 'CANCELLED', label: 'Cancel order', danger: true }],
  PENDING: [{ status: 'CONFIRMED', label: 'Confirm' }, { status: 'CANCELLED', label: 'Cancel order', danger: true }],
  CONFIRMED: [{ status: 'PROCESSING', label: 'Start processing' }, { status: 'CANCELLED', label: 'Cancel order', danger: true }],
  PROCESSING: [{ status: 'SHIPPED', label: 'Mark shipped' }, { status: 'CANCELLED', label: 'Cancel order', danger: true }],
  SHIPPED: [{ status: 'DELIVERED', label: 'Mark delivered' }],
  RETURN_REQUESTED: [{ status: 'RETURNED', label: 'Accept return & refund' }, { status: 'DELIVERED', label: 'Decline return', danger: true }],
};

const FILTERS = ['', 'PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED'];

export default function AdminOrders() {
  useDocumentTitle('Orders');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAsync(() => orderApi.all(status || undefined, page, 20), [status, page]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [pending, setPending] = useState<{ status: string; label: string; danger?: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (!selected || !pending) return;
    setBusy(true);
    try {
      const updated = await orderApi.updateStatus(selected.id, pending.status, note || undefined);
      setSelected(updated);
      setPending(null);
      setNote('');
      toast.success(`Order #${updated.id} is now ${ORDER_STATUS_LABEL[updated.status] ?? updated.status}`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="admin-head"><h1>Orders</h1><button className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button></div>
      <div className="chip-row" role="tablist" aria-label="Filter by status">
        {FILTERS.map((s) => (
          <button key={s || 'all'} role="tab" aria-selected={status === s} className={`chip ${status === s ? 'active' : ''}`}
            onClick={() => { setPage(0); setParams(s ? { status: s } : {}); }}>
            {s ? ORDER_STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading || !data ? <div className="card"><Skeleton width="100%" height={240} /></div> : data.content.length === 0 ? (
        <EmptyState icon="box" title="No orders here" />
      ) : (
        <>
          <div className="table-wrap card">
            <table className="table">
              <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th className="num">Total</th><th>Status</th><th>Payment</th></tr></thead>
              <tbody>{data.content.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setSelected(o)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(o)}>
                  <td><strong>#{o.id}</strong></td>
                  <td>{dateTime(o.createdAt)}</td>
                  <td>{o.shippingAddress?.fullName ?? `Customer #${o.customerId}`}</td>
                  <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                  <td className="num">{money(o.totalAmount, true)}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td><PaymentStatusBadge status={o.paymentStatus} /> <span className="muted small">{o.paymentMethod ?? ''}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <Modal open={!!selected} title={selected ? `Order #${selected.id}` : ''} onClose={() => setSelected(null)} size="lg">
        {selected && (
          <div className="stack">
            <div className="order-head-badges"><OrderStatusBadge status={selected.status} /><PaymentStatusBadge status={selected.paymentStatus} /><span className="muted small">{selected.paymentMethod} · customer #{selected.customerId}</span></div>
            <div className="admin-grid-2">
              <div>
                <h3>Items</h3>
                <ul className="review-list">{selected.items.map((i) => <li key={i.productId}><span>{i.name} × {i.quantity}</span><span>{money(i.unitPrice * i.quantity, true)}</span></li>)}</ul>
                <dl className="summary-rows">
                  <div><dt>Subtotal</dt><dd>{money(selected.subtotal, true)}</dd></div>
                  <div><dt>Delivery</dt><dd>{money(selected.shippingFee, true)}</dd></div>
                  <div className="summary-total"><dt>Total</dt><dd>{money(selected.totalAmount, true)}</dd></div>
                </dl>
                {selected.paymentReference && <p className="small">Payment ref: <span className="mono">{selected.paymentReference}</span></p>}
              </div>
              <div>
                <h3>Ship to</h3>
                {selected.shippingAddress ? <AddressBlock a={selected.shippingAddress} /> : <p className="muted">No address recorded (legacy order).</p>}
                <h3>History</h3>
                <ol className="timeline">{[...(selected.statusHistory ?? [])].reverse().map((h, i) => (
                  <li key={i}><strong>{ORDER_STATUS_LABEL[h.status] ?? h.status}</strong><span className="muted small">{dateTime(h.changedAt)} · {h.actor}</span>{h.note && <span className="small">{h.note}</span>}</li>
                ))}</ol>
                {selected.returnReason && <p className="small">Return reason: {selected.returnReason}</p>}
                {selected.cancelReason && <p className="small">Cancel reason: {selected.cancelReason}</p>}
              </div>
            </div>
            <div className="form-actions">
              {(NEXT[selected.status] ?? []).map((n) => (
                <button key={n.status + n.label} className={`btn ${n.danger ? 'btn-danger-outline' : 'btn-primary'}`} onClick={() => setPending(n)}>{n.label}</button>
              ))}
              {!(NEXT[selected.status] ?? []).length && <span className="muted small">No further actions for this status.</span>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pending}
        title={pending?.label ?? ''}
        tone={pending?.danger ? 'danger' : 'primary'}
        confirmLabel={pending?.label}
        busy={busy}
        message={pending?.status === 'CANCELLED' && selected?.paymentStatus === 'PAID'
          ? 'Stock is released and a full refund is requested from Razorpay. The customer will be notified.'
          : pending?.status === 'RETURNED' ? 'Stock is returned to inventory and a refund is requested if the order was paid online.'
          : 'The customer will be notified of this update.'}
        onClose={() => setPending(null)}
        onConfirm={apply}
      >
        <label className="field"><span>Note (optional, shown in order history)</span><textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </ConfirmDialog>
    </div>
  );
}
