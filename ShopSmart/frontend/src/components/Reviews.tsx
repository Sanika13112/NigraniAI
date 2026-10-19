import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { date } from '../lib/format';
import { Stars, StarInput } from './Stars';
import { ConfirmDialog, ErrorState, Pagination, Skeleton, Spinner } from './ui';
import { Icon } from './Icon';

function ReviewForm({ productId, onSaved }: { productId: number; onSaved: () => void }) {
  const toast = useToast();
  const mine = useAsync(() => productApi.myReview(productId), [productId]);
  const existing = mine.data?.review ?? null;
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (mine.loading) return <Skeleton width="100%" height={60} />;
  if (mine.error) return <ErrorState message={mine.error} onRetry={mine.reload} />;
  if (!mine.data?.canReview) {
    return <p className="review-note"><Icon name="lock" size={14} /> Reviews come from customers who received this product. Once your order is delivered, you can rate it here.</p>;
  }

  const startEdit = () => {
    setRating(existing?.rating ?? 0);
    setTitle(existing?.title ?? '');
    setComment(existing?.comment ?? '');
    setError(null);
    setEditing(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return setError('Choose a star rating.');
    setBusy(true);
    setError(null);
    try {
      await productApi.saveReview(productId, { rating, title: title.trim() || undefined, comment: comment.trim() || undefined });
      toast.success(existing ? 'Review updated' : 'Thanks for your review');
      setEditing(false);
      mine.reload();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return existing ? (
      <div className="my-review">
        <div>
          <strong>Your review</strong>
          <Stars value={existing.rating} />
          {existing.title && <p className="review-title">{existing.title}</p>}
        </div>
        <div className="my-review-actions">
          <button className="btn btn-ghost btn-sm" onClick={startEdit}>Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
        <ConfirmDialog
          open={confirmDelete}
          title="Delete your review?"
          message="Your rating will be removed from this product's average."
          confirmLabel="Delete review"
          busy={busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            try { await productApi.deleteReview(productId); setConfirmDelete(false); mine.reload(); onSaved(); toast.success('Review deleted'); }
            catch (err) { toast.error(errorMessage(err)); }
            finally { setBusy(false); }
          }}
        />
      </div>
    ) : (
      <button className="btn btn-secondary" onClick={startEdit}>Write a review</button>
    );
  }

  return (
    <form className="review-form" onSubmit={submit} noValidate>
      {error && <div className="form-error" role="alert">{error}</div>}
      <StarInput value={rating} onChange={setRating} />
      <label className="field"><span>Headline (optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What stood out?" /></label>
      <label className="field"><span>Your review (optional)</span><textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="How was the quality, fit or performance?" /></label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy && <Spinner />} {existing ? 'Update review' : 'Post review'}</button>
      </div>
    </form>
  );
}

export function Reviews({ productId, onChanged }: { productId: number; onChanged?: () => void }) {
  const { isCustomer, status } = useAuth();
  const location = useLocation();
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAsync(() => productApi.reviews(productId, sort, page, 6), [productId, sort, page]);

  const summary = data?.summary;
  const total = summary?.count ?? 0;

  return (
    <section className="reviews" id="reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title">Ratings & reviews</h2>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton width="100%" height={120} /> : (
        <div className="reviews-layout">
          <div className="reviews-summary">
            {total > 0 && summary?.average != null ? (
              <>
                <div className="review-score"><span>{Number(summary.average).toFixed(1)}</span><Stars value={Number(summary.average)} size={18} /></div>
                <p className="muted small">Based on {total} verified {total === 1 ? 'review' : 'reviews'}</p>
                <ul className="review-bars">
                  {['5', '4', '3', '2', '1'].map((s) => {
                    const n = summary.distribution[s] ?? 0;
                    return (
                      <li key={s}>
                        <span>{s}★</span>
                        <span className="bar"><span style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
                        <span className="muted">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="muted">No reviews yet.</p>
            )}
            <div className="review-cta">
              {isCustomer ? (
                <ReviewForm productId={productId} onSaved={() => { reload(); onChanged?.(); }} />
              ) : status === 'anonymous' ? (
                <p className="review-note"><Link to="/login" state={{ from: location.pathname }}>Sign in</Link> to rate a product you've received.</p>
              ) : null}
            </div>
          </div>
          <div className="reviews-list">
            {total > 0 && (
              <div className="reviews-toolbar">
                <span className="muted small">{total} {total === 1 ? 'review' : 'reviews'}</span>
                <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Sort reviews">
                  <option value="recent">Most recent</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </div>
            )}
            {data?.reviews.content.map((r) => (
              <article key={r.id} className="review">
                <div className="review-head">
                  <Stars value={r.rating} />
                  {r.title && <strong className="review-title">{r.title}</strong>}
                </div>
                {r.comment && <p>{r.comment}</p>}
                <p className="review-meta">
                  {r.reviewerName}
                  {r.verifiedPurchase && <span className="verified"><Icon name="check" size={12} /> Verified purchase</span>}
                  <span>{date(r.createdAt)}</span>
                </p>
              </article>
            ))}
            {data && <Pagination page={data.reviews.page} totalPages={data.reviews.totalPages} onChange={setPage} />}
          </div>
        </div>
      )}
    </section>
  );
}
