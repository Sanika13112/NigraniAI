// TEST-ONLY contract stub of the ShopSmart gateway API (as implemented in the Java services).
// It enforces the same auth rules, idempotency, stock reservation and status transitions so the
// React app can be exercised end-to-end in a browser. It is NOT the real backend.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8099);
const RZP_SECRET = 'stub_test_secret';
let failMode = null; // 'down' -> 503 on everything (for resilience tests)

const products = [];
const cats = ['Electronics', 'Fashion', 'Accessories', 'Beauty', 'Home'];
const seed = [
  ['Studio Wireless Headphones', 'Electronics', 2499, 36], ['Pocket Bluetooth Speaker', 'Electronics', 1299, 52],
  ['Everyday Laptop', 'Electronics', 42999, 14], ['Home Tech Essentials Set', 'Electronics', 3499, 22],
  ['City Walk Sneakers', 'Fashion', 1799, 40], ['Everyday Shoulder Bag', 'Fashion', 1499, 28],
  ['Weekend Style Edit', 'Fashion', 2199, 19], ['Modern Layers Collection', 'Fashion', 2699, 17],
  ['Minimal Dial Watch', 'Accessories', 2199, 31], ['Everyday Sunglasses', 'Accessories', 799, 46],
  ['Style Accessories Edit', 'Accessories', 1199, 25], ['Classic Everyday Timepiece', 'Accessories', 1899, 2],
  ['Daily Hydration Skincare Set', 'Beauty', 899, 44], ['Everyday Beauty Kit', 'Beauty', 1299, 33],
  ['Gentle Skincare Collection', 'Beauty', 1099, 27], ['Soft Notes Eau de Parfum', 'Beauty', 1599, 0],
  ['Sculptural Home Accent', 'Home', 1099, 23], ['Calm Living Room Edit', 'Home', 2499, 12],
  ['Bedroom Comfort Set', 'Home', 1999, 16], ['Warm Glow Table Lamp', 'Home', 1699, 20],
];
seed.forEach(([name, category, price, stock], i) => products.push({ id: i + 1, name, description: `${name}: a dependable everyday pick.`, price, category, stockQuantity: stock, imageUrl: null, inStock: stock > 0, updatedAt: new Date().toISOString() }));

const TERMS_VERSION = '2026-10-15';
const users = []; // {id,email,password,role,customerId}
const customers = []; // {id,name,email,phone,authUserId,createdAt}
const addresses = []; // {...,customerId}
const wishlists = new Map();
const orders = [];
const payments = [];
const notifications = [];
const adjustments = [];
const refreshTokens = new Map(); // token -> userId
const accessTokens = new Map(); // token -> {userId, exp}
const reservations = new Map();
let ids = { user: 1, cust: 1, addr: 1, order: 1001, pay: 1, notif: 1, adj: 1, prod: products.length + 1 };

users.push({ id: ids.user++, email: 'admin@shopsmart.test', password: 'AdminPass123', role: 'ADMIN', customerId: null });

const now = () => new Date().toISOString();
function notify(customerId, type, message) { notifications.push({ id: ids.notif++, recipientId: customerId, type, message, status: 'UNREAD', createdAt: now() }); }
function issue(user) {
  const at = crypto.randomBytes(16).toString('hex');
  accessTokens.set(at, { userId: user.id, exp: Date.now() + 15 * 60000 });
  const rt = crypto.randomBytes(16).toString('hex');
  refreshTokens.set(rt, user.id);
  return { at, rt, body: { accessToken: at, tokenType: 'Bearer', expiresIn: 900, user: { id: user.id, customerId: user.customerId, email: user.email, role: user.role } } };
}
function err(res, status, message, extra = {}) { send(res, status, { status, error: http.STATUS_CODES[status], message, traceId: res.traceId, ...extra }); }
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Trace-Id': res.traceId, ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function principal(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const t = accessTokens.get(h.slice(7));
  if (!t || t.exp < Date.now()) return 'expired';
  return users.find((u) => u.id === t.userId) || null;
}
function requireUser(req, res) { const p = principal(req); if (!p) { err(res, 401, 'Please sign in to continue.'); return null; } if (p === 'expired') { err(res, 401, 'Your session has expired. Please sign in again.'); return null; } return p; }
function requireCustomer(req, res) { const p = requireUser(req, res); if (!p) return null; if (!p.customerId) { err(res, 403, 'A customer account is required for this action.'); return null; } return p; }
function requireAdmin(req, res) { const p = requireUser(req, res); if (!p) return null; if (p.role !== 'ADMIN') { err(res, 403, 'Administrator access is required.'); return null; } return p; }
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).find(([k]) => k === name)?.[1];
const page = (list, p, s) => ({ content: list.slice(p * s, p * s + s), page: p, size: s, totalElements: list.length, totalPages: Math.ceil(list.length / s) });

function quoteFor(items) {
  let subtotal = 0, valid = true;
  const lines = items.map((it) => {
    const p = products.find((x) => x.id === it.productId);
    if (!p) { valid = false; return { productId: it.productId, name: null, imageUrl: null, category: null, unitPrice: null, quantity: it.quantity, lineTotal: 0, availableStock: 0, problem: 'This product is no longer available' }; }
    let problem = null;
    if (p.stockQuantity <= 0) problem = 'Out of stock'; else if (p.stockQuantity < it.quantity) problem = `Only ${p.stockQuantity} left`;
    if (problem) valid = false; else subtotal += p.price * it.quantity;
    return { productId: p.id, name: p.name, imageUrl: p.imageUrl, category: p.category, unitPrice: p.price, quantity: it.quantity, lineTotal: p.price * it.quantity, availableStock: p.stockQuantity, problem };
  });
  return { lines, subtotal, shippingFee: 0, taxAmount: 0, discountAmount: 0, total: subtotal, currency: 'INR', taxInclusive: true, valid, shippingNote: 'Free delivery' };
}
function transition(o, status, note, actor) {
  o.status = status; o.updatedAt = now(); o.statusHistory.push({ status, note, actor, changedAt: now() });
  if (status === 'DELIVERED' && !o.deliveredAt) { o.deliveredAt = now(); if (o.paymentStatus === 'COD_PENDING') o.paymentStatus = 'COD_COLLECTED'; }
  if (status === 'CANCELLED' || status === 'RETURNED') {
    const r = reservations.get(o.reservationRef);
    if (r && r.status === 'RESERVED') { r.items.forEach((i) => { const p = products.find((x) => x.id === i.productId); if (p) p.stockQuantity += i.quantity; }); r.status = 'RELEASED'; }
    if (o.paymentStatus === 'PAID') { const pay = payments.find((p) => p.orderId === o.id); if (pay) { pay.status = 'REFUND_PENDING'; pay.refundId = 'rfnd_stub' + pay.id; } o.paymentStatus = 'REFUND_PENDING'; }
    else if (o.paymentStatus === 'COD_COLLECTED') o.paymentStatus = 'REFUND_ACTION_REQUIRED';
  }
  notify(o.customerId, 'ORDER', `Your order #${o.id} is now ${status}.`);
}
const ADMIN_NEXT = { PENDING_PAYMENT: ['CANCELLED'], CONFIRMED: ['PROCESSING', 'CANCELLED'], PROCESSING: ['SHIPPED', 'CANCELLED'], SHIPPED: ['DELIVERED'], RETURN_REQUESTED: ['RETURNED', 'DELIVERED'] };

async function body(req) { let d = ''; for await (const c of req) d += c; try { return d ? JSON.parse(d) : {}; } catch { return Symbol.for('bad'); } }

const server = http.createServer(async (req, res) => {
  res.traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const m = req.method;
  if (path === '/__control') { const b = await body(req); failMode = b.failMode ?? null; if (b.setStock) { const p = products.find((x) => x.id === b.setStock.id); p.stockQuantity = b.setStock.stock; } if (b.setPrice) { const p = products.find((x) => x.id === b.setPrice.id); p.price = b.setPrice.price; } return send(res, 200, { ok: true, orders: orders.length, stock: Object.fromEntries(products.map((p) => [p.id, p.stockQuantity])) }); }
  if (path.includes('/internal/')) return err(res, 404, 'The requested endpoint was not found');
  if (failMode === 'down') return err(res, 503, 'Service unavailable');
  const b = ['POST', 'PUT', 'PATCH'].includes(m) ? await body(req) : {};
  if (b === Symbol.for('bad')) return err(res, 400, 'Request body is missing or invalid');
  let mm;

  // ---------- auth ----------
  if (path === '/authentication-service/auth/register' && m === 'POST') {
    const email = String(b.email || '').trim().toLowerCase();
    const details = [];
    if (!b.name) details.push('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) details.push('Enter a valid email address');
    if (!b.password || b.password.length < 8) details.push('Password must contain between 8 and 72 characters');
    if (b.acceptPrivacyNotice !== true) details.push('Please accept the privacy notice to create an account');
    // Same contract as authentication-service: termsAccepted must be literally true, version must be current.
    if (b.termsAccepted !== true) details.push('Please accept the Terms and Conditions to continue.');
    if (!b.termsVersion) details.push('Terms version is missing. Reload the page and try again.');
    if (details.length) return err(res, 400, details[0], { details });
    if (b.termsVersion !== TERMS_VERSION) return err(res, 409, 'The Terms and Conditions have been updated. Please reload the page, review them and try again.');
    if (users.some((u) => u.email === email)) return err(res, 409, 'An account with this email already exists');
    const c = { id: ids.cust++, name: b.name, email, phone: b.phone || null, authUserId: ids.user, createdAt: now(),
      marketingConsent: b.marketingConsent === true, privacyNoticeAccepted: true, termsAccepted: true, termsVersion: b.termsVersion, termsAcceptedAt: now() };
    customers.push(c);
    const u = { id: ids.user++, email, password: b.password, role: 'CUSTOMER', customerId: c.id };
    users.push(u);
    const s = issue(u);
    return send(res, 201, s.body, { 'Set-Cookie': `ss_refresh=${s.rt}; Path=/; HttpOnly; SameSite=Strict` });
  }
  if (path === '/authentication-service/auth/login' && m === 'POST') {
    const u = users.find((x) => x.email === String(b.email || '').trim().toLowerCase());
    if (!u || u.password !== b.password) return err(res, 401, 'Invalid email or password');
    const s = issue(u);
    return send(res, 200, s.body, { 'Set-Cookie': `ss_refresh=${s.rt}; Path=/; HttpOnly; SameSite=Strict` });
  }
  if (path === '/authentication-service/auth/refresh' && m === 'POST') {
    const rt = cookie(req, 'ss_refresh');
    const uid = rt && refreshTokens.get(rt);
    if (!uid) return err(res, 401, 'Your session has expired. Please sign in again.');
    refreshTokens.delete(rt);
    const s = issue(users.find((u) => u.id === uid));
    return send(res, 200, s.body, { 'Set-Cookie': `ss_refresh=${s.rt}; Path=/; HttpOnly; SameSite=Strict` });
  }
  if (path === '/authentication-service/auth/logout' && m === 'POST') {
    const rt = cookie(req, 'ss_refresh'); if (rt) refreshTokens.delete(rt);
    return send(res, 204, undefined, { 'Set-Cookie': 'ss_refresh=; Path=/; Max-Age=0' });
  }

  // ---------- products ----------
  if (path === '/product-service/products' && m === 'GET') return send(res, 200, products);
  if (path === '/product-service/products/categories') return send(res, 200, cats);
  if (path === '/product-service/products/search') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const cat = url.searchParams.get('category');
    const min = url.searchParams.get('minPrice'), max = url.searchParams.get('maxPrice');
    const inStock = url.searchParams.get('inStock') === 'true';
    const sort = url.searchParams.get('sort') || 'relevance';
    const p = Number(url.searchParams.get('page') || 0), s = Number(url.searchParams.get('size') || 12);
    let list = products.filter((x) => (!q || `${x.name} ${x.description} ${x.category}`.toLowerCase().includes(q)) && (!cat || x.category === cat)
      && (!min || x.price >= Number(min)) && (!max || x.price <= Number(max)) && (!inStock || x.stockQuantity > 0));
    if (sort === 'price_asc') list.sort((a, b2) => a.price - b2.price); else if (sort === 'price_desc') list.sort((a, b2) => b2.price - a.price);
    else if (sort === 'newest') list.sort((a, b2) => b2.id - a.id); else if (sort === 'name') list.sort((a, b2) => a.name.localeCompare(b2.name));
    return send(res, 200, page(list, p, s));
  }
  if (path === '/product-service/products/stock-adjustments') { if (!requireAdmin(req, res)) return; const pid = Number(url.searchParams.get('productId')); return send(res, 200, adjustments.filter((a) => !pid || a.productId === pid).slice().reverse()); }
  if ((mm = path.match(/^\/product-service\/products\/(\d+)\/stock$/)) && m === 'PATCH') {
    const a = requireAdmin(req, res); if (!a) return;
    const p = products.find((x) => x.id === Number(mm[1])); if (!p) return err(res, 404, 'Product not found');
    if (p.stockQuantity + b.delta < 0) return err(res, 409, `Stock cannot go below zero. Current stock is ${p.stockQuantity}`);
    p.stockQuantity += b.delta;
    adjustments.push({ id: ids.adj++, productId: p.id, productName: p.name, delta: b.delta, resultingStock: p.stockQuantity, reason: b.reason, actorUserId: a.id, createdAt: now() });
    return send(res, 200, p);
  }
  if ((mm = path.match(/^\/product-service\/products\/(\d+)$/))) {
    const p = products.find((x) => x.id === Number(mm[1]));
    if (m === 'GET') return p ? send(res, 200, p) : err(res, 404, 'Product not found');
    if (!requireAdmin(req, res)) return;
    if (!p) return err(res, 404, 'Product not found');
    if (m === 'PUT') { Object.assign(p, { name: b.name, description: b.description, price: b.price, category: b.category, stockQuantity: b.stockQuantity, imageUrl: b.imageUrl }); return send(res, 200, p); }
    if (m === 'DELETE') { products.splice(products.indexOf(p), 1); return send(res, 204); }
  }
  if (path === '/product-service/products' && m === 'POST') {
    if (!requireAdmin(req, res)) return;
    if (products.some((x) => x.name.toLowerCase() === String(b.name).toLowerCase() && x.category === b.category)) return err(res, 409, `A product with this name already exists in ${b.category}`);
    const p = { id: ids.prod++, name: b.name, description: b.description, price: b.price, category: b.category, stockQuantity: b.stockQuantity, imageUrl: b.imageUrl, updatedAt: now() };
    products.push(p); return send(res, 201, p);
  }

  // ---------- customers ----------
  if (path.startsWith('/customer-service/customers/me')) {
    const u = requireCustomer(req, res); if (!u) return;
    const cid = u.customerId;
    const c = customers.find((x) => x.id === cid);
    if (path === '/customer-service/customers/me/consent' && m === 'GET') {
      return send(res, 200, { noticeVersion: 'v1-2026-10', purposes: ['account', 'order_fulfilment', 'delivery', 'payment', ...(c.marketingConsent ? ['marketing'] : [])],
        marketingConsent: !!c.marketingConsent, consentedAt: c.createdAt, consentUpdatedAt: c.createdAt, deletionRequestedAt: null, privacyNoticeAccepted: !!c.privacyNoticeAccepted,
        termsAccepted: !!c.termsAccepted, termsVersion: c.termsVersion ?? null, termsAcceptedAt: c.termsAcceptedAt ?? null });
    }
    if (path === '/customer-service/customers/me') { if (m === 'PUT') { c.name = b.name; c.phone = b.phone || null; } return send(res, 200, c); }
    if (path === '/customer-service/customers/me/addresses') {
      if (m === 'GET') return send(res, 200, addresses.filter((a) => a.customerId === cid).sort((a, b2) => Number(b2.defaultAddress) - Number(a.defaultAddress)));
      if (!/^[6-9]\d{9}$/.test(b.phone || '') || !/^[1-9]\d{5}$/.test(b.pincode || '')) return err(res, 400, 'Enter a valid 6-digit PIN code');
      const first = !addresses.some((a) => a.customerId === cid);
      const a = { id: ids.addr++, customerId: cid, label: b.label || null, fullName: b.fullName, phone: b.phone, line1: b.line1, line2: b.line2 || null, city: b.city, state: b.state, pincode: b.pincode, defaultAddress: false };
      addresses.push(a);
      if (first || b.makeDefault) addresses.filter((x) => x.customerId === cid).forEach((x) => (x.defaultAddress = x.id === a.id));
      return send(res, 201, a);
    }
    if ((mm = path.match(/addresses\/(\d+)(\/default)?$/))) {
      const a = addresses.find((x) => x.id === Number(mm[1]) && x.customerId === cid); if (!a) return err(res, 404, 'Address not found');
      if (mm[2] || b.makeDefault) addresses.filter((x) => x.customerId === cid).forEach((x) => (x.defaultAddress = x.id === a.id));
      if (m === 'PUT') Object.assign(a, { label: b.label || null, fullName: b.fullName, phone: b.phone, line1: b.line1, line2: b.line2 || null, city: b.city, state: b.state, pincode: b.pincode });
      if (m === 'DELETE') { addresses.splice(addresses.indexOf(a), 1); return send(res, 204); }
      return send(res, 200, a);
    }
    if (path === '/customer-service/customers/me/wishlist') return send(res, 200, { productIds: wishlists.get(cid) || [] });
    if ((mm = path.match(/wishlist\/(\d+)$/))) {
      let w = wishlists.get(cid) || []; const pid = Number(mm[1]);
      w = m === 'PUT' ? (w.includes(pid) ? w : [pid, ...w]) : w.filter((x) => x !== pid);
      wishlists.set(cid, w); return send(res, 200, { productIds: w });
    }
  }
  if (path === '/customer-service/customers') { if (!requireAdmin(req, res)) return; return send(res, 200, customers); }
  if ((mm = path.match(/^\/customer-service\/customers\/(\d+)$/))) { if (!requireAdmin(req, res)) return; const c = customers.find((x) => x.id === Number(mm[1])); return c ? send(res, 200, { customer: c, addresses: addresses.filter((a) => a.customerId === c.id) }) : err(res, 404, 'Customer not found'); }

  // ---------- orders ----------
  if (path === '/order-service/orders/quote' && m === 'POST') return send(res, 200, quoteFor(b.items || []));
  if (path === '/order-service/orders' && m === 'POST') {
    const u = requireCustomer(req, res); if (!u) return;
    const key = req.headers['idempotency-key'];
    if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) return err(res, 400, 'A valid Idempotency-Key header is required');
    const prev = orders.find((o) => o.customerId === u.customerId && o.idem === key);
    if (prev) return send(res, 200, prev, { 'Idempotent-Replayed': 'true' });
    await new Promise((r) => setTimeout(r, 400)); // simulate latency (double-click window)
    const again = orders.find((o) => o.customerId === u.customerId && o.idem === key);
    if (again) return send(res, 200, again, { 'Idempotent-Replayed': 'true' });
    const q = quoteFor(b.items || []);
    const bad = q.lines.find((l) => l.problem);
    if (bad) return err(res, 409, bad.problem === 'Out of stock' ? `${bad.name} is out of stock` : `${bad.problem} of ${bad.name}`);
    if (b.expectedTotal != null && Number(b.expectedTotal) !== q.total) return err(res, 409, 'Prices in your cart have changed. Please review your order before paying.');
    if (!['ONLINE', 'COD'].includes(b.paymentMethod)) return err(res, 400, 'Payment method must be ONLINE or COD');
    const ref = 'ord-' + crypto.randomUUID();
    reservations.set(ref, { status: 'RESERVED', items: b.items });
    b.items.forEach((i) => { products.find((p) => p.id === i.productId).stockQuantity -= i.quantity; });
    const cod = b.paymentMethod === 'COD';
    const o = { id: ids.order++, customerId: u.customerId, items: q.lines.map((l) => ({ productId: l.productId, name: l.name, category: l.category, imageUrl: l.imageUrl, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.lineTotal })),
      subtotal: q.subtotal, shippingFee: 0, taxAmount: 0, discountAmount: 0, totalAmount: q.total, currency: 'INR', taxInclusive: true, paymentMethod: b.paymentMethod,
      paymentStatus: cod ? 'COD_PENDING' : 'UNPAID', paymentReference: null, status: cod ? 'CONFIRMED' : 'PENDING_PAYMENT', shippingAddress: b.shippingAddress, statusHistory: [],
      cancelReason: null, returnReason: null, createdAt: now(), updatedAt: now(), deliveredAt: null, idem: key, reservationRef: ref };
    o.statusHistory.push({ status: o.status, note: cod ? 'Order placed with cash on delivery' : 'Order placed; awaiting online payment', actor: 'customer', changedAt: now() });
    orders.push(o);
    notify(u.customerId, 'ORDER', `Your order #${o.id} was placed.`);
    return send(res, 201, o, { 'Idempotent-Replayed': 'false' });
  }
  if (path === '/order-service/orders/me') { const u = requireCustomer(req, res); if (!u) return; const list = orders.filter((o) => o.customerId === u.customerId).slice().reverse(); return send(res, 200, page(list, Number(url.searchParams.get('page') || 0), Number(url.searchParams.get('size') || 10))); }
  if ((mm = path.match(/^\/order-service\/orders\/me\/(\d+)(\/cancel|\/return)?$/))) {
    const u = requireCustomer(req, res); if (!u) return;
    const o = orders.find((x) => x.id === Number(mm[1]) && x.customerId === u.customerId); if (!o) return err(res, 404, 'Order not found');
    if (mm[2] === '/cancel') { if (!['PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING'].includes(o.status)) return err(res, 409, 'This order can no longer be cancelled'); o.cancelReason = b.reason || 'Cancelled by customer'; transition(o, 'CANCELLED', o.cancelReason, 'customer'); }
    if (mm[2] === '/return') { if (o.status !== 'DELIVERED') return err(res, 409, 'Only delivered orders can be returned'); if (!b.reason) return err(res, 400, 'Please tell us why you are returning this order'); o.returnReason = b.reason; transition(o, 'RETURN_REQUESTED', b.reason, 'customer'); }
    return send(res, 200, o);
  }
  if (path === '/order-service/orders' && m === 'GET') { if (!requireAdmin(req, res)) return; const st = url.searchParams.get('status'); const list = orders.filter((o) => !st || o.status === st).slice().reverse(); return send(res, 200, page(list, Number(url.searchParams.get('page') || 0), Number(url.searchParams.get('size') || 20))); }
  if ((mm = path.match(/^\/order-service\/orders\/(\d+)(\/status)?$/))) {
    const a = requireAdmin(req, res); if (!a) return;
    const o = orders.find((x) => x.id === Number(mm[1])); if (!o) return err(res, 404, 'Order not found');
    if (mm[2] && m === 'PATCH') { if (!(ADMIN_NEXT[o.status] || []).includes(b.status)) return err(res, 409, `Invalid order status transition from ${o.status} to ${b.status}`); transition(o, b.status, b.note || null, `admin:${a.id}`); }
    return send(res, 200, o);
  }

  // ---------- payments ----------
  if (path === '/payment-service/payments/config') return send(res, 200, { provider: 'RAZORPAY', onlineEnabled: true, mode: 'TEST', webhookConfigured: true });
  if (path === '/payment-service/payments/checkout' && m === 'POST') {
    const u = requireCustomer(req, res); if (!u) return;
    const o = orders.find((x) => x.id === b.orderId && x.customerId === u.customerId); if (!o) return err(res, 404, 'Order not found');
    if (o.status !== 'PENDING_PAYMENT') return err(res, 409, 'This order is no longer awaiting payment');
    let p = payments.find((x) => x.orderId === o.id);
    if (!p) { p = { id: ids.pay++, orderId: o.id, customerId: o.customerId, amount: o.totalAmount, currency: 'INR', status: 'CREATED', paymentMethod: 'ONLINE', provider: 'RAZORPAY', mode: 'TEST', providerOrderId: 'order_stub' + crypto.randomBytes(6).toString('hex'), providerPaymentId: null, providerMethod: null, failureReason: null, refundId: null, createdAt: now(), updatedAt: now(), capturedAt: null }; payments.push(p); }
    return send(res, 200, { provider: 'RAZORPAY', mode: 'TEST', keyId: 'rzp_test_stubkey', providerOrderId: p.providerOrderId, amount: Math.round(p.amount * 100), currency: 'INR', orderId: o.id, merchantName: 'ShopSmart', prefill: { name: o.shippingAddress?.fullName, email: u.email, contact: o.shippingAddress?.phone } });
  }
  if (path === '/payment-service/payments/verify' && m === 'POST') {
    const u = requireCustomer(req, res); if (!u) return;
    const p = payments.find((x) => x.orderId === b.orderId && x.customerId === u.customerId); if (!p) return err(res, 404, 'Payment not found');
    const expected = crypto.createHmac('sha256', RZP_SECRET).update(`${p.providerOrderId}|${b.razorpayPaymentId}`).digest('hex');
    if (b.razorpayOrderId !== p.providerOrderId || expected !== b.razorpaySignature) return err(res, 400, 'Payment verification failed. If money was debited, it will be reconciled automatically.');
    if (p.status === 'CREATED') {
      Object.assign(p, { status: 'CAPTURED', providerPaymentId: b.razorpayPaymentId, providerMethod: 'upi', capturedAt: now() });
      const o = orders.find((x) => x.id === p.orderId);
      o.paymentStatus = 'PAID'; o.paymentReference = b.razorpayPaymentId; transition(o, 'CONFIRMED', 'Payment verified', 'payment-service');
      notify(o.customerId, 'PAYMENT', `Payment of ₹${p.amount} received for order #${o.id} (sandbox test payment, no real money moved).`);
    }
    return send(res, 200, p);
  }
  if ((mm = path.match(/^\/payment-service\/payments\/order\/(\d+)$/))) { const u = requireCustomer(req, res); if (!u) return; const p = payments.find((x) => x.orderId === Number(mm[1]) && x.customerId === u.customerId); return p ? send(res, 200, p) : err(res, 404, 'No payment has been started for this order'); }
  if (path === '/payment-service/payments' && m === 'GET') { if (!requireAdmin(req, res)) return; return send(res, 200, payments.slice().reverse()); }
  if ((mm = path.match(/^\/payment-service\/payments\/(\d+)\/refund$/))) { if (!requireAdmin(req, res)) return; const p = payments.find((x) => x.id === Number(mm[1])); const o = orders.find((x) => x.id === p?.orderId); if (!p) return err(res, 404, 'Payment not found'); if (!['CANCELLED', 'RETURNED'].includes(o.status)) return err(res, 409, 'Cancel the order or accept the return before refunding'); p.status = 'REFUND_PENDING'; return send(res, 200, p); }

  // ---------- notifications ----------
  if (path === '/notification-service/notifications/me') { const u = requireCustomer(req, res); if (!u) return; return send(res, 200, notifications.filter((n) => n.recipientId === u.customerId).slice().reverse()); }
  if (path === '/notification-service/notifications/me/unread-count') { const u = requireCustomer(req, res); if (!u) return; return send(res, 200, { unread: notifications.filter((n) => n.recipientId === u.customerId && n.status === 'UNREAD').length }); }
  if (path === '/notification-service/notifications/me/read-all') { const u = requireCustomer(req, res); if (!u) return; let n = 0; notifications.forEach((x) => { if (x.recipientId === u.customerId && x.status === 'UNREAD') { x.status = 'READ'; n++; } }); return send(res, 200, { updated: n }); }
  if ((mm = path.match(/^\/notification-service\/notifications\/me\/(\d+)\/read$/))) { const u = requireCustomer(req, res); if (!u) return; const x = notifications.find((n) => n.id === Number(mm[1]) && n.recipientId === u.customerId); if (!x) return err(res, 404, 'Notification not found'); x.status = 'READ'; return send(res, 200, x); }
  if (path === '/notification-service/notifications' && m === 'POST') { if (!requireAdmin(req, res)) return; notify(b.recipientId, 'GENERAL', b.message); return send(res, 201, notifications.at(-1)); }

  // ---------- analytics ----------
  if (path.startsWith('/analytics-service/analytics/')) {
    if (!requireAdmin(req, res)) return;
    if (path.endsWith('/overview')) {
      const by = {}; orders.forEach((o) => (by[o.status] = (by[o.status] || 0) + 1));
      const sum = (f) => payments.filter(f).reduce((n, p) => n + p.amount, 0);
      return send(res, 200, { orders: { total: orders.length, byStatus: Object.entries(by).map(([status, total]) => ({ status, total })) }, payments: [],
        revenue: { currency: 'INR', liveCaptured: sum((p) => p.mode === 'LIVE' && p.status === 'CAPTURED'), liveRefunded: 0, sandboxCaptured: sum((p) => p.mode === 'TEST' && p.status === 'CAPTURED'), sandboxRefunded: 0,
          codCollected: orders.filter((o) => o.paymentStatus === 'COD_COLLECTED').reduce((n, o) => n + o.totalAmount, 0), codOutstanding: orders.filter((o) => o.paymentStatus === 'COD_PENDING').reduce((n, o) => n + o.totalAmount, 0), legacySimulated: 0 },
        catalogue: { products: products.length, lowStock: products.filter((p) => p.stockQuantity <= 5).map(({ id, name, category, stockQuantity }) => ({ id, name, category, stockQuantity })) }, customers: { total: customers.length } });
    }
    if (path.endsWith('/trends')) return send(res, 200, { days: 30, mode: url.searchParams.get('mode'), dailyCaptured: payments.filter((p) => p.capturedAt && p.mode === url.searchParams.get('mode')).map((p) => ({ day: p.capturedAt.slice(0, 10), payments: 1, amount: p.amount })), dailyOrders: [] });
    if (path.endsWith('/top-products')) { const agg = {}; orders.filter((o) => !['CANCELLED', 'PENDING_PAYMENT'].includes(o.status)).forEach((o) => o.items.forEach((i) => { agg[i.productId] ??= { productId: i.productId, name: i.name, units: 0, value: 0 }; agg[i.productId].units += i.quantity; agg[i.productId].value += i.lineTotal; })); return send(res, 200, { products: Object.values(agg).sort((a, b2) => b2.units - a.units).slice(0, 5) }); }
  }
  return err(res, 404, 'The requested endpoint was not found');
});
server.listen(PORT, () => console.log(`contract stub on :${PORT}`));
