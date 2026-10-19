const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: number | string | null | undefined, exact = false): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (exact ? inrExact : inr).format(n);
}

/** Accepts ISO strings or epoch seconds/milliseconds (Jackson may emit either). */
export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateTime(value: string | number | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

export function date(value: string | number | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function relative(value: string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return date(value);
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Not paid',
  PAID: 'Paid',
  COD_PENDING: 'Pay on delivery',
  COD_COLLECTED: 'Paid on delivery',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
  REFUND_FAILED: 'Refund failed',
  REFUND_ACTION_REQUIRED: 'Refund being arranged',
  CREATED: 'Awaiting payment',
  CAPTURED: 'Captured',
  SUCCESS: 'Simulated success',
  PENDING: 'Pending',
};

export function statusTone(status: string | null | undefined): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' {
  switch (status) {
    case 'DELIVERED':
    case 'PAID':
    case 'CAPTURED':
    case 'COD_COLLECTED':
    case 'REFUNDED':
      return 'success';
    case 'CONFIRMED':
    case 'PROCESSING':
    case 'SHIPPED':
      return 'brand';
    case 'PENDING_PAYMENT':
    case 'PENDING':
    case 'UNPAID':
    case 'COD_PENDING':
    case 'REFUND_PENDING':
    case 'RETURN_REQUESTED':
    case 'CREATED':
      return 'warning';
    case 'CANCELLED':
    case 'REFUND_FAILED':
    case 'REFUND_ACTION_REQUIRED':
      return 'danger';
    case 'RETURNED':
      return 'info';
    default:
      return 'neutral';
  }
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}
