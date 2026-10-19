import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { EmptyState, ErrorState, Skeleton } from '../components/ui';
import { dateTime } from '../lib/format';
import { StockAdjustDialog } from './Products';
import type { Product } from '../lib/types';

export default function Inventory() {
  useDocumentTitle('Inventory');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const productId = Number(params.get('product')) || undefined;
  const products = useAsync(() => productApi.all(), []);
  const log = useAsync(() => productApi.stockAdjustments(productId), [productId]);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const sorted = [...(products.data ?? [])].sort((a, b) => a.stockQuantity - b.stockQuantity);

  return (
    <div className="stack">
      <div className="admin-head"><h1>Inventory</h1></div>
      <div className="admin-grid-2">
        <section className="card">
          <h2>Stock levels (lowest first)</h2>
          {products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : products.loading ? <Skeleton width="100%" height={200} /> : (
            <div className="table-wrap scroll-y">
              <table className="table compact">
                <thead><tr><th>Product</th><th className="num">Stock</th><th aria-label="Actions" /></tr></thead>
                <tbody>{sorted.map((p) => (
                  <tr key={p.id} className={productId === p.id ? 'selected' : ''}>
                    <td><button className="link-btn" onClick={() => setParams({ product: String(p.id) })}>{p.name}</button></td>
                    <td className={`num ${p.stockQuantity === 0 ? 'text-danger' : p.stockQuantity <= 5 ? 'text-warning' : ''}`}>{p.stockQuantity}</td>
                    <td className="actions"><button className="btn btn-ghost btn-sm" onClick={() => setAdjusting(p)}>Adjust</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <div className="section-head">
            <h2>Adjustment log{productId ? ` · #${productId}` : ''}</h2>
            {productId && <button className="btn btn-ghost btn-sm" onClick={() => setParams({})}>Show all</button>}
          </div>
          <p className="small muted">Manual changes made by staff. Stock reserved and released by orders is applied automatically and isn’t listed here.</p>
          {log.error ? <ErrorState message={log.error} onRetry={log.reload} /> : log.loading ? <Skeleton width="100%" height={200} /> : !log.data?.length ? (
            <EmptyState icon="activity" title="No adjustments recorded" />
          ) : (
            <ul className="log-list">
              {log.data.map((a) => (
                <li key={a.id}>
                  <strong className={a.delta > 0 ? 'text-success' : 'text-danger'}>{a.delta > 0 ? `+${a.delta}` : a.delta}</strong>
                  <div><span>{a.productName}</span><span className="muted small">{a.reason} · now {a.resultingStock} · admin #{a.actorUserId}</span></div>
                  <span className="muted small">{dateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <StockAdjustDialog product={adjusting} onClose={() => setAdjusting(null)} onDone={(p) => {
        products.setData((all) => (all ?? []).map((x) => (x.id === p.id ? p : x)));
        setAdjusting(null); log.reload(); toast.success('Stock updated');
      }} />
    </div>
  );
}
