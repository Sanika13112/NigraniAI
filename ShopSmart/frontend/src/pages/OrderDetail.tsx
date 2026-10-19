import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { orderApi, paymentApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { usePayment } from '../lib/usePayment';
import { useToast } from '../state/ToastContext';
import { ConfirmDialog, ErrorState, Modal, ModeBadge, Notice, OrderStatusBadge, PaymentStatusBadge, ProductImage, Skeleton, Spinner } from '../components/ui';
import { AddressBlock } from '../components/AddressForm';
import { Icon } from '../components/Icon';
import { ORDER_STATUS_LABEL, dateTime, money, toDate } from '../lib/format';
import type { Order } from '../lib/types';

const TRACK_STEPS = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

const RETURN_REASONS = [
  'Damaged or defective',
  'Wrong item received',
  'Not as described',
  'Size or fit issue',
  'Quality not as expected',
  'No longer needed',
  'Other',
];

/** Return and refund progress, driven only by backend statuses. */
function ReturnTracker({ order }: { order: Order }) {
  const hasReturn = !!order.returnReason;
  const refundStates = ['REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED', 'REFUND_ACTION_REQUIRED'];
  if (!hasReturn && !refundStates.includes(order.paymentStatus ?? '')) return null;

  const steps: { label: string; state: 'done' | 'current' | 'todo' | 'failed'; note?: string }[] = [];
  if (hasReturn) {
    const declined = order.status === 'DELIVERED';
    steps.push({ label: 'Return requested', state: 'done', note: order.returnReason ?? undefined });
    steps.push({
      label: declined ? 'Return declined' : order.status === 'RETURNED' ? 'Return accepted' : 'Return under review',
      state: order.status === 'RETURNED' ? 'done' : declined ? 'failed' : 'current',
    });
  } else {
    steps.push({ label: 'Order cancelled', state: 'done', note: order.cancelReason ?? undefined });
  }
  const p = order.paymentStatus;
  if (order.paymentMethod === 'ONLINE' || refundStates.includes(p ?? '')) {
    steps.push({
      label: p === 'REFUND_FAILED' ? 'Refund failed, our team will contact you' : 'Refund initiated',
      state: p === 'REFUND_PENDING' || p === 'REFUNDED' ? 'done' : p === 'REFUND_FAILED' ? 'failed' : 'todo',
    });
    steps.push({ label: 'Refund completed', state: p === 'REFUNDED' ? 'done' : p === 'REFUND_PENDING' ? 'current' : 'todo', note: p === 'REFUND_PENDING' ? 'Banks usually take 5–7 working days' : undefined });
  } else if (p === 'REFUND_ACTION_REQUIRED') {
    steps.push({ label: 'Cash refund being arranged by ShopSmart', state: 'current' });
  }
  return (
    <section className="card return-tracker">
      <h2>{hasReturn ? 'Return & refund' : 'Refund'}</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={i} className={`rt-${s.state}`}>
            <span className="rt-dot" aria-hidden="true">{s.state === 'done' ? <Icon name="check" size={12} /> : s.state === 'failed' ? <Icon name="x" size={12} /> : null}</span>
            <div><strong>{s.label}</strong>{s.note && <span className="muted small">{s.note}</span>}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Tracker({ order }: { order: Order }) {
  if (['CANCELLED', 'PENDING_PAYMENT', 'PENDING'].includes(order.status)) return null;
  const effective = ['RETURN_REQUESTED', 'RETURNED'].includes(order.status) ? 'DELIVERED' : order.status;
  const current = TRACK_STEPS.indexOf(effective);
  return (
    <ol className="tracker" aria-label="Order progress">
      {TRACK_STEPS.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="tracker-dot">{i <= current ? <Icon name="check" size={14} /> : null}</span>
          <span>{ORDER_STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

function Countdown({ createdAt, minutes = 30 }: { createdAt: string | number; minutes?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = toDate(createdAt)?.getTime() ?? now;
  const left = Math.max(0, start + minutes * 60000 - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <strong>{left > 0 ? `${m}:${String(s).padStart(2, '0')}` : 'expired'}</strong>;
}

export default function OrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const [params, setParams] = useSearchParams();
  const justPlaced = params.get('placed') === '1';
  const toast = useToast();
  const { pay, busy: paying } = usePayment();
  const { data: order, error, loading, reload, setData } = useAsync(() => orderApi.mineOne(orderId), [orderId]);
  const payment = useAsync(
    () => (order && order.paymentMethod === 'ONLINE' ? paymentApi.forOrder(orderId).catch(() => null) : Promise.resolve(null)),
    [order?.id, order?.paymentStatus],
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [returnType, setReturnType] = useState('');
  const [acting, setActing] = useState(false);
  const [checking, setChecking] = useState(false);
  useDocumentTitle(order ? `Order #${order.id}` : 'Order');

  // While a payment is being confirmed server-side, poll briefly for the result.
  useEffect(() => {
    if (!order || order.status !== 'PENDING_PAYMENT' || !justPlaced) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      try {
        const fresh = await orderApi.mineOne(orderId);
        if (fresh.status !== order.status) {
          setData(fresh);
          clearInterval(t);
        }
      } catch {
        /* keep the current view */
      }
      if (tries >= 6) clearInterval(t);
    }, 5000);
    return () => clearInterval(t);
  }, [order, justPlaced, orderId, setData]);

  if (loading && !order) {
    return <div className="container section"><Skeleton width="40%" height={32} /><div className="card" style={{ marginTop: 16 }}><Skeleton width="100%" height={180} /></div></div>;
  }
  if (error || !order) {
    return <div className="container section"><ErrorState message={error ?? 'Order not found'} onRetry={reload} /><p><Link to="/account/orders">Back to my orders</Link></p></div>;
  }

  const awaitingPayment = order.status === 'PENDING_PAYMENT' && order.paymentMethod === 'ONLINE';
  const canCancel = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status);
  const deliveredAt = toDate(order.deliveredAt);
  const canReturn = order.status === 'DELIVERED' && !!deliveredAt && Date.now() - deliveredAt.getTime() < 7 * 86400000;

  const payNow = async () => {
    const result = await pay(order.id);
    if (result.kind === 'paid') toast.success('Payment confirmed. Thank you!');
    else if (result.kind === 'error') toast.error(result.message);
    else toast.info(result.message);
    reload();
  };

  const checkPayment = async () => {
    setChecking(true);
    try {
      const p = await paymentApi.forOrder(order.id, true);
      if (p.status === 'CAPTURED') toast.success('Payment confirmed');
      else toast.info('We haven’t received a completed payment for this order yet.');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const doCancel = async () => {
    setActing(true);
    try {
      setData(await orderApi.cancel(order.id, reason || undefined));
      setCancelOpen(false);
      setReason('');
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const doReturn = async () => {
    if (!returnType) return;
    setActing(true);
    try {
      const full = reason.trim() ? `${returnType}: ${reason.trim()}` : returnType;
      setData(await orderApi.requestReturn(order.id, full.slice(0, 300)));
      setReturnOpen(false);
      setReason('');
      setReturnType('');
      toast.success('Return requested');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="container section">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/account/orders">My orders</Link><Icon name="chevronRight" size={14} /><span>Order #{order.id}</span></nav>

      {justPlaced && order.status !== 'PENDING_PAYMENT' && (
        <div className="success-banner" role="status">
          <Icon name="check" size={28} />
          <div>
            <h1>Thank you! Your order is {order.status === 'CONFIRMED' ? 'confirmed' : ORDER_STATUS_LABEL[order.status]?.toLowerCase()}.</h1>
            <p>Order #{order.id} · {order.paymentMethod === 'COD' ? `Pay ${money(order.totalAmount, true)} on delivery` : `Paid ${money(order.totalAmount, true)}`}</p>
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => { params.delete('placed'); setParams(params, { replace: true }); }}><Icon name="x" /></button>
        </div>
      )}

      <div className="order-head">
        <div>
          <h1>Order #{order.id}</h1>
          <p className="muted">Placed {dateTime(order.createdAt)}</p>
        </div>
        <div className="order-head-badges">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </div>

      {awaitingPayment && (
        <Notice tone="warning" title="Payment pending">
          <p>Your items are reserved. Complete payment within <Countdown createdAt={order.createdAt} /> or the order will be cancelled automatically.</p>
          <div className="notice-actions">
            <button className="btn btn-primary" onClick={payNow} disabled={paying}>{paying && <Spinner />} Pay {money(order.totalAmount, true)}</button>
            <button className="btn btn-secondary" onClick={checkPayment} disabled={checking}>{checking && <Spinner />} I already paid, check status</button>
          </div>
        </Notice>
      )}
      {order.paymentStatus === 'REFUND_PENDING' && <Notice tone="info" title="Refund in progress">Your refund has been initiated with the payment provider. Banks usually take 5–7 working days.</Notice>}
      {order.paymentStatus === 'REFUND_ACTION_REQUIRED' && <Notice tone="info" title="Refund being arranged">Our team will contact you to complete your refund.</Notice>}
      {order.paymentStatus === 'REFUNDED' && <Notice tone="success" title="Refunded">The payment provider has confirmed your refund.</Notice>}

      <Tracker order={order} />
      <ReturnTracker order={order} />

      <div className="order-detail-grid">
        <section className="card">
          <h2>Items</h2>
          <ul className="order-items">
            {order.items.map((i) => (
              <li key={i.productId}>
                <Link to={`/product/${i.productId}`} className="cart-thumb"><ProductImage src={i.imageUrl} alt={i.name} /></Link>
                <div>
                  <Link to={`/product/${i.productId}`}>{i.name}</Link>
                  <span className="muted small">Qty {i.quantity}, {money(i.unitPrice, true)} each</span>
                  {['DELIVERED', 'RETURN_REQUESTED', 'RETURNED'].includes(order.status) && (
                    <Link to={`/product/${i.productId}#reviews`} className="rate-link"><Icon name="heart" size={13} /> Rate this product</Link>
                  )}
                </div>
                <strong>{money(i.lineTotal ?? i.unitPrice * i.quantity, true)}</strong>
              </li>
            ))}
          </ul>
          <dl className="summary-rows">
            <div><dt>Items</dt><dd>{money(order.subtotal, true)}</dd></div>
            <div><dt>Delivery</dt><dd>{order.shippingFee > 0 ? money(order.shippingFee, true) : 'Free'}</dd></div>
            {order.discountAmount > 0 && <div><dt>Discount</dt><dd>−{money(order.discountAmount, true)}</dd></div>}
            <div className="summary-total"><dt>Total</dt><dd>{money(order.totalAmount, true)}</dd></div>
            {order.taxInclusive && <p className="summary-note">Prices include GST.</p>}
          </dl>
        </section>

        <div className="stack">
          {order.shippingAddress && (
            <section className="card"><h2>Delivery address</h2><AddressBlock a={order.shippingAddress} /></section>
          )}
          <section className="card">
            <h2>Payment</h2>
            <p>{order.paymentMethod === 'COD' ? 'Cash on delivery' : order.paymentMethod === 'ONLINE' ? 'Online (Razorpay)' : 'Not recorded'}</p>
            {payment.data && (
              <dl className="kv">
                <div><dt>Mode</dt><dd><ModeBadge mode={payment.data.mode} /></dd></div>
                {payment.data.providerMethod && <div><dt>Method</dt><dd>{payment.data.providerMethod.toUpperCase()}</dd></div>}
                {payment.data.providerPaymentId && <div><dt>Transaction ID</dt><dd className="mono">{payment.data.providerPaymentId}</dd></div>}
                {payment.data.failureReason && payment.data.status === 'CREATED' && <div><dt>Last attempt</dt><dd className="text-danger">{payment.data.failureReason}</dd></div>}
              </dl>
            )}
            {payment.data?.mode === 'TEST' && <p className="small muted">Sandbox transaction. No real money was charged.</p>}
          </section>
          <section className="card">
            <h2>Delivery tracking</h2>
            <p className="small muted">Carrier tracking isn’t available yet. The status below is updated by ShopSmart as your order moves.</p>
            <ol className="timeline">
              {[...(order.statusHistory ?? [])].reverse().map((h, idx) => (
                <li key={idx}>
                  <strong>{ORDER_STATUS_LABEL[h.status] ?? h.status}</strong>
                  <span className="muted small">{dateTime(h.changedAt)}</span>
                  {h.note && <span className="small">{h.note}</span>}
                </li>
              ))}
            </ol>
          </section>
          {(canCancel || canReturn) && (
            <section className="card">
              <h2>Need help?</h2>
              {canCancel && <button className="btn btn-danger-outline btn-block" onClick={() => setCancelOpen(true)}>Cancel order</button>}
              {canReturn && <button className="btn btn-secondary btn-block" onClick={() => setReturnOpen(true)}>Request a return</button>}
            </section>
          )}
          {order.cancelReason && order.status === 'CANCELLED' && <p className="small muted">Cancellation reason: {order.cancelReason}</p>}
          {order.returnReason && <p className="small muted">Return reason: {order.returnReason}</p>}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title={`Cancel order #${order.id}?`}
        message={order.paymentStatus === 'PAID'
          ? 'Your payment will be refunded to the original payment method. The refund is shown as complete only once the payment provider confirms it.'
          : 'The reserved items will be released.'}
        confirmLabel="Cancel order"
        busy={acting}
        onConfirm={doCancel}
        onClose={() => setCancelOpen(false)}
      >
        <label className="field"><span>Reason (optional)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} /></label>
      </ConfirmDialog>

      <Modal
        open={returnOpen}
        title="Request a return"
        onClose={() => setReturnOpen(false)}
        size="sm"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setReturnOpen(false)} disabled={acting}>Close</button>
          <button className="btn btn-primary" onClick={doReturn} disabled={acting || !returnType}>{acting && <Spinner />} Submit request</button>
        </>}
      >
        <p className="muted">Tell us what went wrong. Once ShopSmart accepts the return, the refund starts automatically for online payments.</p>
        <fieldset className="reason-list">
          <legend>Reason for return</legend>
          {RETURN_REASONS.map((r) => (
            <label key={r} className="radio"><input type="radio" name="return-reason" checked={returnType === r} onChange={() => setReturnType(r)} /> {r}</label>
          ))}
        </fieldset>
        <label className="field"><span>More details (optional)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={250} rows={3} /></label>
      </Modal>
    </div>
  );
}
