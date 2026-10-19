import { useState } from 'react';

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17.1l-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z';

/** Read-only star rating; partial stars are drawn with a clip. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(5, value)) / 5;
  return (
    <span className="stars" style={{ width: size * 5, height: size }} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="stars-row stars-empty">{[0, 1, 2, 3, 4].map((i) => <svg key={i} width={size} height={size} viewBox="0 0 24 24"><path d={STAR} /></svg>)}</span>
      <span className="stars-row stars-fill" style={{ width: `${pct * 100}%` }}>{[0, 1, 2, 3, 4].map((i) => <svg key={i} width={size} height={size} viewBox="0 0 24 24"><path d={STAR} /></svg>)}</span>
    </span>
  );
}

/** Compact "★ 4.3 (12)" label. Renders nothing until a product has reviews. */
export function RatingBadge({ average, count }: { average?: number | null; count?: number }) {
  if (!average || !count) return null;
  return (
    <span className="rating-badge" aria-label={`Rated ${Number(average).toFixed(1)} out of 5 from ${count} reviews`}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>
      {Number(average).toFixed(1)}
      <span className="rating-count">({count})</span>
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const shown = hover || value;
  return (
    <div className="star-input" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= shown ? 'on' : ''}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
        >
          <svg width="28" height="28" viewBox="0 0 24 24"><path d={STAR} /></svg>
        </button>
      ))}
      <span className="star-input-label">{labels[shown]}</span>
    </div>
  );
}
