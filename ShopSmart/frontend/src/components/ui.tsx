import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, money, statusTone } from '../lib/format';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Skeleton({ width, height = 16, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card is-skeleton" aria-hidden="true">
      <div className="product-media"><Skeleton width="100%" height="100%" radius={0} /></div>
      <div className="product-body">
        <Skeleton width="40%" height={12} />
        <Skeleton width="85%" height={16} />
        <Skeleton width="30%" height={20} />
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'box', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} size={30} /></div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = "We couldn't load this" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="error-state" role="alert">
      <Icon name="alert" size={26} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; title?: string }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={18} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{ORDER_STATUS_LABEL[status] ?? status}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge>—</Badge>;
  return <Badge tone={statusTone(status)}>{PAYMENT_STATUS_LABEL[status] ?? status}</Badge>;
}

export function ModeBadge({ mode }: { mode: string }) {
  if (mode === 'LIVE') return <Badge tone="success">Live</Badge>;
  if (mode === 'TEST') return <Badge tone="warning">Sandbox</Badge>;
  return <Badge tone="danger">Simulated (legacy)</Badge>;
}

/**
 * Marketplace-style price: small rupee sign, large whole part, small raised paise.
 * The text content stays exactly money(value) (for example "₹1,499.50"), so it reads and copies normally.
 */
export function Price({ value, className = '' }: { value: number; className?: string }) {
  const text = money(value);
  const m = /^(\D*)([\d,]+)(?:\.(\d+))?$/.exec(text);
  if (!m) return <span className={`price ${className}`}>{text}</span>;
  return (
    <span className={`price ${className}`}>
      <span className="price-symbol">{m[1]}</span>
      <span className="price-whole">{m[2]}</span>
      {m[3] && <><span className="price-dot">.</span><span className="price-fraction">{m[3].padEnd(2, '0')}</span></>}
    </span>
  );
}

export function ProductImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => {
    setFailed(!src);
  }, [src]);
  if (failed) {
    return (
      <div className={`img-fallback ${className ?? ''}`} role="img" aria-label={alt}>
        <Icon name="box" size={32} />
      </div>
    );
  }
  return <img src={src!} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function QuantityStepper({ value, min = 1, max, onChange, disabled, label = 'Quantity' }: {
  value: number; min?: number; max: number; onChange: (v: number) => void; disabled?: boolean; label?: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={16} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not(.modal-close)')?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn modal-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onClose, children }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; busy?: boolean;
  onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Keep it</button>
          <button className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner label="Working" /> : null} {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{message}</p>
      {children}
    </Modal>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
  for (let p = start; p < Math.min(totalPages, start + 5); p++) pages.push(p);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        <Icon name="chevronLeft" size={16} /> Prev
      </button>
      {pages.map((p) => (
        <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>
          {p + 1}
        </button>
      ))}
      <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>
        Next <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string | null; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
