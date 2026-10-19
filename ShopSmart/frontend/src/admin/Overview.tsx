import { useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { ErrorState, Notice, Skeleton } from '../components/ui';
import { ORDER_STATUS_LABEL, money } from '../lib/format';

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className={`stat card ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

/** Zero-fills every day in the window so the chart reads as a real timeline. */
function fillDays(points: { day: string; value: number }[], days: number) {
  const byDay = new Map(points.map((p) => [p.day.slice(0, 10), p.value]));
  const out: { day: string; value: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}

function BarChart({ data, label, format }: { data: { day: string; value: number }[]; label: string; format: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (max === 0) return <p className="muted small chart-empty">No captured payments in this period.</p>;
  const w = 100 / data.length;
  return (
    <figure className="chart" aria-label={label}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1="0" y1="39.8" x2="100" y2="39.8" className="chart-base" />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max((d.value / max) * 36, 0.8) : 0;
          return (
            <rect key={d.day} x={i * w + w * 0.18} y={40 - h} width={w * 0.64} height={h} rx={0.4} className="chart-bar">
              <title>{`${d.day}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="chart-axis"><span>{data[0].day}</span><span>Peak {format(max)}</span><span>{data[data.length - 1].day}</span></figcaption>
    </figure>
  );
}

export default function Overview() {
  useDocumentTitle('Admin overview');
  const overview = useAsync(() => analyticsApi.overview(), []);
  const [mode, setMode] = useState<'TEST' | 'LIVE'>('TEST');
  const trends = useAsync(() => analyticsApi.trends(30, mode), [mode]);
  const top = useAsync(() => analyticsApi.topProducts(5), []);
  const o = overview.data;

  return (
    <div className="stack">
      <div className="admin-head"><h1>Overview</h1><button className="btn btn-secondary btn-sm" onClick={() => { overview.reload(); trends.reload(); top.reload(); }}>Refresh</button></div>
      {overview.error ? <ErrorState message={overview.error} onRetry={overview.reload} /> : !o ? (
        <div className="stat-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="card"><Skeleton width="100%" height={60} /></div>)}</div>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Live revenue (captured)" value={money(o.revenue.liveCaptured)} hint={o.revenue.liveRefunded > 0 ? `${money(o.revenue.liveRefunded)} refunded` : 'Verified Razorpay live payments'} tone="brand" />
            <Stat label="Cash on delivery collected" value={money(o.revenue.codCollected)} hint={`${money(o.revenue.codOutstanding)} outstanding`} />
            <Stat label="Orders" value={String(o.orders.total)} hint="All time" />
            <Stat label="Customers" value={String(o.customers.total)} hint={`${o.catalogue.products} products listed`} />
          </div>
          {(o.revenue.sandboxCaptured > 0 || o.revenue.legacySimulated > 0) && (
            <Notice tone="warning" title="Not real revenue">
              {o.revenue.sandboxCaptured > 0 && <>Sandbox (test-mode) payments: {money(o.revenue.sandboxCaptured)}. </>}
              {o.revenue.legacySimulated > 0 && <>Simulated payments from the earlier system: {money(o.revenue.legacySimulated)}. </>}
              These are excluded from revenue above.
            </Notice>
          )}
          <div className="admin-grid-2">
            <section className="card">
              <div className="section-head">
                <h2>Daily captured payments (30 days)</h2>
                <div className="segmented" role="tablist">
                  {(['TEST', 'LIVE'] as const).map((m) => (
                    <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{m === 'TEST' ? 'Sandbox' : 'Live'}</button>
                  ))}
                </div>
              </div>
              {trends.error ? <ErrorState message={trends.error} onRetry={trends.reload} /> : !trends.data ? <Skeleton width="100%" height={140} /> : (
                <>
                  <BarChart label="Captured amount per day" format={(n) => money(n)} data={fillDays(trends.data.dailyCaptured.map((d) => ({ day: String(d.day), value: Number(d.amount) })), 30)} />
                  <p className="small muted">Total {money(trends.data.dailyCaptured.reduce((n, d) => n + Number(d.amount), 0))} across {trends.data.dailyCaptured.reduce((n, d) => n + Number(d.payments), 0)} payments.</p>
                </>
              )}
            </section>
            <section className="card">
              <h2>Orders by status</h2>
              <ul className="bar-list">
                {o.orders.byStatus.map((s) => (
                  <li key={s.status}>
                    <Link to={`/admin/orders?status=${s.status}`}>{ORDER_STATUS_LABEL[s.status] ?? s.status}</Link>
                    <span className="bar"><span style={{ width: `${(Number(s.total) / Math.max(1, o.orders.total)) * 100}%` }} /></span>
                    <strong>{s.total}</strong>
                  </li>
                ))}
                {o.orders.byStatus.length === 0 && <li className="muted">No orders yet.</li>}
              </ul>
            </section>
            <section className="card">
              <h2>Low stock</h2>
              {o.catalogue.lowStock.length === 0 ? <p className="muted">All products have more than 5 units.</p> : (
                <table className="table compact">
                  <thead><tr><th>Product</th><th>Category</th><th className="num">Stock</th></tr></thead>
                  <tbody>{o.catalogue.lowStock.map((p) => (
                    <tr key={p.id}><td><Link to={`/admin/inventory?product=${p.id}`}>{p.name}</Link></td><td>{p.category}</td><td className={`num ${p.stockQuantity === 0 ? 'text-danger' : 'text-warning'}`}>{p.stockQuantity}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
            <section className="card">
              <h2>Top products (units sold)</h2>
              {top.error ? <ErrorState message={top.error} onRetry={top.reload} /> : !top.data ? <Skeleton width="100%" height={100} /> : top.data.products.length === 0 ? <p className="muted">No completed sales yet.</p> : (
                <table className="table compact">
                  <thead><tr><th>Product</th><th className="num">Units</th><th className="num">Value</th></tr></thead>
                  <tbody>{top.data.products.map((p) => <tr key={p.productId}><td>{p.name}</td><td className="num">{p.units}</td><td className="num">{money(p.value)}</td></tr>)}</tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
