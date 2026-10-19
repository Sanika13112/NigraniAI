import { request } from './api';
import type {
  Address, AddressInput, AnalyticsOverview, AnalyticsTrends, AppNotification, AuthResponse, CheckoutSession,
  Customer, Order, Page, Payment, PaymentConfig, Product, Quote, Review, ReviewSummary, SessionUser, StockAdjustment,
} from './types';

const AUTH = '/authentication-service/auth';
const PRODUCTS = '/product-service/products';
const CUSTOMERS = '/customer-service/customers';
const ORDERS = '/order-service/orders';
const PAYMENTS = '/payment-service/payments';
const NOTIFICATIONS = '/notification-service/notifications';
const ANALYTICS = '/analytics-service/analytics';

export interface CartLine {
  productId: number;
  quantity: number;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>(`${AUTH}/login`, { method: 'POST', body: { email, password }, authRetry: false }),
  register: (body: RegisterBody) =>
    request<AuthResponse>(`${AUTH}/register`, { method: 'POST', body, authRetry: false }),
  refresh: () => request<AuthResponse>(`${AUTH}/refresh`, { method: 'POST', authRetry: false, timeoutMs: 10000 }),
  logout: () => request<void>(`${AUTH}/logout`, { method: 'POST', authRetry: false }),
  me: () => request<SessionUser>(`${AUTH}/me`),
};

export interface ProductQuery {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: string;
  page?: number;
  size?: number;
}

export const productApi = {
  search: (query: ProductQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== false) params.set(k, String(v));
    });
    return request<Page<Product>>(`${PRODUCTS}/search?${params.toString()}`, { signal });
  },
  all: () => request<Product[]>(PRODUCTS),
  get: (id: number) => request<Product>(`${PRODUCTS}/${id}`),
  categories: () => request<string[]>(`${PRODUCTS}/categories`),
  create: (body: ProductInput) => request<Product>(PRODUCTS, { method: 'POST', body }),
  update: (id: number, body: ProductInput) => request<Product>(`${PRODUCTS}/${id}`, { method: 'PUT', body }),
  remove: (id: number) => request<void>(`${PRODUCTS}/${id}`, { method: 'DELETE' }),
  adjustStock: (id: number, delta: number, reason: string) =>
    request<Product>(`${PRODUCTS}/${id}/stock`, { method: 'PATCH', body: { delta, reason } }),
  reviews: (id: number, sort = 'recent', page = 0, size = 10) =>
    request<{ summary: ReviewSummary; reviews: Page<Review> }>(`${PRODUCTS}/${id}/reviews?sort=${sort}&page=${page}&size=${size}`),
  myReview: (id: number) => request<{ canReview: boolean; review: Review | null }>(`${PRODUCTS}/${id}/reviews/me`),
  saveReview: (id: number, body: { rating: number; title?: string; comment?: string }) =>
    request<Review>(`${PRODUCTS}/${id}/reviews/me`, { method: 'PUT', body }),
  deleteReview: (id: number) => request<void>(`${PRODUCTS}/${id}/reviews/me`, { method: 'DELETE' }),
  recentReviews: () => request<Review[]>(`${PRODUCTS}/reviews`),
  moderateReview: (reviewId: number) => request<void>(`${PRODUCTS}/reviews/${reviewId}`, { method: 'DELETE' }),
  stockAdjustments: (productId?: number) =>
    request<StockAdjustment[]>(`${PRODUCTS}/stock-adjustments${productId ? `?productId=${productId}` : ''}`),
};

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  category: string;
  stockQuantity: number;
  imageUrl: string | null;
}

export interface RegisterBody {
  name: string; email: string; password: string; phone?: string;
  acceptPrivacyNotice: boolean; marketingConsent: boolean;
  /** Terms and Conditions: required, separate from the privacy notice and from marketing. */
  termsAccepted: boolean; termsVersion: string;
}

export interface ConsentState {
  noticeVersion: string;
  purposes: string[];
  marketingConsent: boolean;
  consentedAt: string | null;
  consentUpdatedAt: string | null;
  deletionRequestedAt: string | null;
  privacyNoticeAccepted: boolean;
  termsAccepted: boolean;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
}

export interface DemoSwitch { name: string; enabled: boolean; updatedAt: string | null }

export const demoApi = {
  switches: () => request<DemoSwitch[]>(`${CUSTOMERS}/admin/demo-violations`),
  set: (name: string, enabled: boolean) =>
    request<{ name: string; enabled: boolean }>(`${CUSTOMERS}/admin/demo-violations/${encodeURIComponent(name)}`, { method: 'PUT', body: { enabled } }),
  sendCampaign: (message?: string) =>
    request<{ campaignId: string; recipients: number; sentAt: string }>(`${CUSTOMERS}/admin/campaigns`, { method: 'POST', body: { message } }),
};

export const customerApi = {
  consent: () => request<ConsentState>(`${CUSTOMERS}/me/consent`),
  updateConsent: (marketingConsent: boolean) => request<ConsentState>(`${CUSTOMERS}/me/consent`, { method: 'PUT', body: { marketingConsent } }),
  requestDeletion: () => request<{ deletionRequestedAt: string; eraseDueAt: string }>(`${CUSTOMERS}/me/deletion-request`, { method: 'POST' }),
  me: () => request<Customer>(`${CUSTOMERS}/me`),
  updateMe: (body: { name: string; phone: string }) => request<Customer>(`${CUSTOMERS}/me`, { method: 'PUT', body }),
  addresses: () => request<Address[]>(`${CUSTOMERS}/me/addresses`),
  addAddress: (body: AddressInput) => request<Address>(`${CUSTOMERS}/me/addresses`, { method: 'POST', body }),
  updateAddress: (id: number, body: AddressInput) =>
    request<Address>(`${CUSTOMERS}/me/addresses/${id}`, { method: 'PUT', body }),
  deleteAddress: (id: number) => request<void>(`${CUSTOMERS}/me/addresses/${id}`, { method: 'DELETE' }),
  makeDefault: (id: number) => request<Address>(`${CUSTOMERS}/me/addresses/${id}/default`, { method: 'POST' }),
  wishlist: () => request<{ productIds: number[] }>(`${CUSTOMERS}/me/wishlist`),
  addWishlist: (productId: number) =>
    request<{ productIds: number[] }>(`${CUSTOMERS}/me/wishlist/${productId}`, { method: 'PUT' }),
  removeWishlist: (productId: number) =>
    request<{ productIds: number[] }>(`${CUSTOMERS}/me/wishlist/${productId}`, { method: 'DELETE' }),
  // admin
  list: () => request<Customer[]>(CUSTOMERS),
  get: (id: number) => request<{ customer: Customer; addresses: Address[] }>(`${CUSTOMERS}/${id}`),
};

export const orderApi = {
  quote: (items: CartLine[]) => request<Quote>(`${ORDERS}/quote`, { method: 'POST', body: { items } }),
  create: (
    body: {
      items: CartLine[];
      shippingAddress: Omit<Address, 'id' | 'label' | 'defaultAddress'>;
      paymentMethod: 'ONLINE' | 'COD';
      expectedTotal: number;
    },
    idempotencyKey: string,
  ) => request<Order>(ORDERS, { method: 'POST', body, idempotencyKey, timeoutMs: 30000 }),
  mine: (page = 0, size = 10, status?: string) =>
    request<Page<Order>>(`${ORDERS}/me?page=${page}&size=${size}${status ? `&status=${status}` : ''}`),
  returns: (page = 0, size = 10) => request<Page<Order>>(`${ORDERS}/me/returns?page=${page}&size=${size}`),
  mineOne: (id: number) => request<Order>(`${ORDERS}/me/${id}`),
  cancel: (id: number, reason?: string) => request<Order>(`${ORDERS}/me/${id}/cancel`, { method: 'POST', body: { reason } }),
  requestReturn: (id: number, reason: string) =>
    request<Order>(`${ORDERS}/me/${id}/return`, { method: 'POST', body: { reason } }),
  // admin
  all: (status: string | undefined, page = 0, size = 20) =>
    request<Page<Order>>(`${ORDERS}?page=${page}&size=${size}${status ? `&status=${status}` : ''}`),
  get: (id: number) => request<Order>(`${ORDERS}/${id}`),
  updateStatus: (id: number, status: string, note?: string) =>
    request<Order>(`${ORDERS}/${id}/status`, { method: 'PATCH', body: { status, note } }),
};

export const paymentApi = {
  config: () => request<PaymentConfig>(`${PAYMENTS}/config`),
  checkout: (orderId: number) => request<CheckoutSession>(`${PAYMENTS}/checkout`, { method: 'POST', body: { orderId } }),
  verify: (body: { orderId: number; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    request<Payment>(`${PAYMENTS}/verify`, { method: 'POST', body, timeoutMs: 30000 }),
  forOrder: (orderId: number, refresh = false) =>
    request<Payment>(`${PAYMENTS}/order/${orderId}${refresh ? '?refresh=true' : ''}`),
  // admin
  all: () => request<Payment[]>(PAYMENTS),
  refund: (id: number, reason: string) => request<Payment>(`${PAYMENTS}/${id}/refund`, { method: 'POST', body: { reason } }),
};

export const notificationApi = {
  mine: (limit = 50) => request<AppNotification[]>(`${NOTIFICATIONS}/me?limit=${limit}`),
  unread: () => request<{ unread: number }>(`${NOTIFICATIONS}/me/unread-count`, { retries: 0 }),
  markRead: (id: number) => request<AppNotification>(`${NOTIFICATIONS}/me/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<{ updated: number }>(`${NOTIFICATIONS}/me/read-all`, { method: 'POST' }),
  // admin
  recent: (limit = 100) => request<AppNotification[]>(`${NOTIFICATIONS}?limit=${limit}`),
  send: (recipientId: number, message: string) =>
    request<AppNotification>(NOTIFICATIONS, { method: 'POST', body: { recipientId, message } }),
};

export const analyticsApi = {
  overview: () => request<AnalyticsOverview>(`${ANALYTICS}/overview`),
  trends: (days: number, mode: 'LIVE' | 'TEST') => request<AnalyticsTrends>(`${ANALYTICS}/trends?days=${days}&mode=${mode}`),
  topProducts: (limit = 5) =>
    request<{ products: { productId: number; name: string; units: number; value: number }[] }>(
      `${ANALYTICS}/top-products?limit=${limit}`,
    ),
};
