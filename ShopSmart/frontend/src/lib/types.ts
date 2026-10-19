export type Role = 'CUSTOMER' | 'ADMIN';

export interface SessionUser {
  id: number;
  customerId: number | null;
  email: string;
  role: Role | string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: SessionUser;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  stockQuantity: number;
  imageUrl: string | null;
  inStock?: boolean;
  updatedAt?: string | number | null;
  ratingAverage?: number | null;
  ratingCount?: number;
}

export interface Review {
  id: number;
  productId: number;
  reviewerName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  verifiedPurchase: boolean;
  createdAt: string | number;
  updatedAt: string | number | null;
}

export interface ReviewSummary {
  average: number | null;
  count: number;
  distribution: Record<string, number>;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  authUserId?: number | null;
  createdAt?: string | number | null;
}

export interface Address {
  id: number;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  defaultAddress: boolean;
}

export type AddressInput = Omit<Address, 'id' | 'defaultAddress' | 'label' | 'line2'> & {
  label?: string;
  line2?: string;
  makeDefault?: boolean;
};

export interface QuoteLine {
  productId: number;
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  unitPrice: number | null;
  quantity: number;
  lineTotal: number;
  availableStock: number;
  problem: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  taxInclusive: boolean;
  valid: boolean;
  shippingNote: string;
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export interface OrderItem {
  productId: number;
  name: string;
  category: string | null;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface StatusChange {
  status: string;
  note: string | null;
  actor: string | null;
  changedAt: string | number;
}

export interface Order {
  id: number;
  customerId: number;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  taxInclusive: boolean;
  paymentMethod: 'ONLINE' | 'COD' | null;
  paymentStatus: string | null;
  paymentReference: string | null;
  status: OrderStatus | string;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  } | null;
  statusHistory: StatusChange[];
  cancelReason: string | null;
  returnReason: string | null;
  createdAt: string | number;
  updatedAt: string | number | null;
  deliveredAt: string | number | null;
}

export interface PaymentConfig {
  provider: string;
  onlineEnabled: boolean;
  mode: 'TEST' | 'LIVE' | 'DISABLED';
  webhookConfigured: boolean;
}

export interface CheckoutSession {
  provider: string;
  mode: 'TEST' | 'LIVE';
  keyId: string;
  providerOrderId: string;
  amount: number;
  currency: string;
  orderId: number;
  merchantName: string;
  prefill: { name: string | null; email: string | null; contact: string | null };
}

export interface Payment {
  id: number;
  orderId: number;
  customerId: number | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  provider: string;
  mode: 'TEST' | 'LIVE' | 'SIMULATED' | string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerMethod: string | null;
  failureReason: string | null;
  refundId: string | null;
  createdAt: string | number;
  updatedAt: string | number | null;
  capturedAt: string | number | null;
}

export interface AppNotification {
  id: number;
  recipientId: number;
  type: 'ORDER' | 'PAYMENT' | 'GENERAL' | string;
  message: string;
  status: 'READ' | 'UNREAD';
  createdAt: string | number;
}

export interface StockAdjustment {
  id: number;
  productId: number;
  productName: string;
  delta: number;
  resultingStock: number;
  reason: string;
  actorUserId: number;
  createdAt: string | number;
}

export interface AnalyticsOverview {
  orders: { total: number; byStatus: { status: string; total: number }[] };
  payments: { status: string; mode: string; total: number; amount: number }[];
  revenue: {
    currency: string;
    liveCaptured: number;
    liveRefunded: number;
    sandboxCaptured: number;
    sandboxRefunded: number;
    codCollected: number;
    codOutstanding: number;
    legacySimulated: number;
  };
  catalogue: { products: number; lowStock: { id: number; name: string; category: string; stockQuantity: number }[] };
  customers: { total: number };
}

export interface AnalyticsTrends {
  days: number;
  mode: string;
  dailyCaptured: { day: string; payments: number; amount: number }[];
  dailyOrders: { day: string; orders: number; value: number }[];
}
