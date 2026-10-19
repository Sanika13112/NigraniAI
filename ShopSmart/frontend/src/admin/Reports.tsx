import { useState } from 'react';
import { orderApi, paymentApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { Spinner } from '../components/ui';
import { Icon } from '../components/Icon';
import { toDate } from '../lib/format';
import type { Order } from '../lib/types';

function csv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formulas
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }).join(',')).join('\n');
}

function download(name: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const iso = (v: string | number | null | undefined) => toDate(v)?.toISOString() ?? '';

export default function Reports() {
  useDocumentTitle('Reports');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const exportOrders = async () => {
    setBusy('orders');
    try {
      const all: Order[] = [];
      for (let page = 0; page < 200; page++) {
        const res = await orderApi.all(undefined, page, 100);
        all.push(...res.content);
        if (page >= res.totalPages - 1) break;
      }
      download(`shopsmart-orders-${stamp}.csv`, csv([
        ['order_id', 'created_at', 'customer_id', 'status', 'payment_method', 'payment_status', 'payment_reference', 'items', 'subtotal', 'shipping', 'total', 'currency', 'city', 'state', 'pincode'],
        ...all.map((o) => [o.id, iso(o.createdAt), o.customerId, o.status, o.paymentMethod, o.paymentStatus, o.paymentReference,
          o.items.reduce((n, i) => n + i.quantity, 0), o.subtotal, o.shippingFee, o.totalAmount, o.currency,
          o.shippingAddress?.city, o.shippingAddress?.state, o.shippingAddress?.pincode]),
      ]));
      toast.success(`Exported ${all.length} orders`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const exportPayments = async () => {
    setBusy('payments');
    try {
      const all = await paymentApi.all();
      download(`shopsmart-payments-${stamp}.csv`, csv([
        ['payment_id', 'order_id', 'created_at', 'captured_at', 'amount', 'currency', 'mode', 'status', 'provider', 'provider_order_id', 'provider_payment_id', 'method', 'refund_id'],
        ...all.map((p) => [p.id, p.orderId, iso(p.createdAt), iso(p.capturedAt), p.amount, p.currency, p.mode, p.status, p.provider,
          p.providerOrderId, p.providerPaymentId, p.providerMethod, p.refundId]),
      ]));
      toast.success(`Exported ${all.length} payments`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="admin-head"><h1>Reports</h1></div>
      <p className="muted">Exports are generated from live data at the moment you click. Sandbox and legacy simulated payments are labelled in the <em>mode</em> column; exclude them from financial reporting.</p>
      <div className="admin-grid-2">
        <section className="card report-card">
          <Icon name="box" size={26} />
          <h2>Orders</h2>
          <p className="muted small">Every order with totals, payment status and delivery region (no names or phone numbers).</p>
          <button className="btn btn-primary" onClick={exportOrders} disabled={!!busy}>{busy === 'orders' ? <Spinner /> : <Icon name="download" size={16} />} Export CSV</button>
        </section>
        <section className="card report-card">
          <Icon name="card" size={26} />
          <h2>Payments & reconciliation</h2>
          <p className="muted small">Gateway order and payment IDs for matching against your Razorpay settlement reports.</p>
          <button className="btn btn-primary" onClick={exportPayments} disabled={!!busy}>{busy === 'payments' ? <Spinner /> : <Icon name="download" size={16} />} Export CSV</button>
        </section>
      </div>
    </div>
  );
}
