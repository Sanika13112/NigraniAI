import { useMemo, useState } from 'react';
import { paymentApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { Badge, ConfirmDialog, EmptyState, ErrorState, ModeBadge, Notice, Skeleton } from '../components/ui';
import { PAYMENT_STATUS_LABEL, dateTime, money, statusTone } from '../lib/format';
import type { Payment } from '../lib/types';

export default function Payments() {
  useDocumentTitle('Payments');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => paymentApi.all(), []);
  const config = useAsync(() => paymentApi.config(), []);
  const [mode, setMode] = useState('');
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => (data ?? []).filter((p) => !mode || p.mode === mode), [data, mode]);

  return (
    <div className="stack">
      <div className="admin-head"><h1>Payments</h1><button className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button></div>
      {config.data && (
        <Notice tone={config.data.mode === 'LIVE' ? 'success' : config.data.onlineEnabled ? 'warning' : 'danger'} title={`Razorpay: ${config.data.onlineEnabled ? (config.data.mode === 'LIVE' ? 'live mode' : 'sandbox (test) mode') : 'not configured'}`}>
          {config.data.onlineEnabled
            ? config.data.webhookConfigured ? 'Webhooks are configured for automatic reconciliation.' : 'Webhook secret is not set; payments rely on browser verification and manual status checks.'
            : 'Online payments are disabled. Customers can only choose cash on delivery.'}
        </Notice>
      )}
      <div className="chip-row">
        {[['', 'All'], ['LIVE', 'Live'], ['TEST', 'Sandbox'], ['SIMULATED', 'Simulated (legacy)']].map(([v, l]) => (
          <button key={v} className={`chip ${mode === v ? 'active' : ''}`} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="card"><Skeleton width="100%" height={200} /></div> : rows.length === 0 ? <EmptyState icon="card" title="No payments" /> : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>ID</th><th>Order</th><th>Created</th><th className="num">Amount</th><th>Mode</th><th>Status</th><th>Gateway refs</th><th aria-label="Actions" /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td>#{p.id}</td>
                <td>#{p.orderId}</td>
                <td>{dateTime(p.createdAt)}</td>
                <td className="num">{money(p.amount, true)}</td>
                <td><ModeBadge mode={p.mode} /></td>
                <td><Badge tone={statusTone(p.status)}>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</Badge>{p.failureReason && p.status === 'CREATED' && <span className="small text-danger d-block">{p.failureReason}</span>}</td>
                <td className="mono small">{p.providerPaymentId ?? p.providerOrderId ?? '—'}{p.refundId && <span className="d-block">refund {p.refundId}</span>}</td>
                <td className="actions">
                  {(p.status === 'CAPTURED' || p.status === 'REFUND_FAILED') && p.mode !== 'SIMULATED' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setReason(''); setRefunding(p); }}>Refund</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!refunding}
        title={`Refund ${refunding ? money(refunding.amount, true) : ''}?`}
        message="A full refund will be requested from Razorpay. This is only allowed for orders that are cancelled or returned. The refund is marked complete only when Razorpay confirms it."
        confirmLabel="Request refund"
        busy={busy}
        onClose={() => setRefunding(null)}
        onConfirm={async () => {
          if (!refunding) return;
          setBusy(true);
          try {
            const updated = await paymentApi.refund(refunding.id, reason || 'Refund by ShopSmart');
            setData((all) => (all ?? []).map((x) => (x.id === updated.id ? updated : x)));
            setRefunding(null);
            toast.success('Refund requested');
          } catch (err) { toast.error(errorMessage(err)); }
          finally { setBusy(false); }
        }}
      >
        <label className="field"><span>Reason</span><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></label>
      </ConfirmDialog>
    </div>
  );
}
