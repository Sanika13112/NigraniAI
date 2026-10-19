import { useState } from 'react';
import { Link } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { Stars } from '../components/Stars';
import { dateTime } from '../lib/format';
import type { Review } from '../lib/types';

export default function AdminReviews() {
  useDocumentTitle('Reviews');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => productApi.recentReviews(), []);
  const [removing, setRemoving] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <div className="admin-head"><h1>Reviews</h1><button className="btn btn-secondary btn-sm" onClick={reload}>Refresh</button></div>
      <p className="muted small">The 100 most recent reviews. Only customers who received a product can review it. Remove reviews that are abusive or not about the product.</p>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="card"><Skeleton width="100%" height={200} /></div> : !data?.length ? (
        <EmptyState icon="heart" title="No reviews yet" />
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Product</th><th>Rating</th><th>Review</th><th>By</th><th>Posted</th><th aria-label="Actions" /></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/product/${r.productId}`}>#{r.productId}</Link></td>
                <td><Stars value={r.rating} /></td>
                <td className="review-cell">{r.title && <strong>{r.title}</strong>}{r.comment && <span className="muted small d-block">{r.comment}</span>}</td>
                <td>{r.reviewerName}</td>
                <td>{dateTime(r.createdAt)}</td>
                <td className="actions"><button className="btn btn-ghost btn-sm text-danger" onClick={() => setRemoving(r)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!removing}
        title="Remove this review?"
        message="It will be deleted and the product's average rating recalculated. This cannot be undone."
        confirmLabel="Remove review"
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          try { await productApi.moderateReview(removing.id); setData((all) => (all ?? []).filter((x) => x.id !== removing.id)); setRemoving(null); toast.success('Review removed'); }
          catch (err) { toast.error(errorMessage(err)); }
          finally { setBusy(false); }
        }}
      />
    </div>
  );
}
