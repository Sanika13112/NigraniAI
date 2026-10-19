// End-to-end browser tests of the built ShopSmart frontend against the contract stub.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const STUB = process.env.STUB_URL || 'http://localhost:8099';
const results = [];
const consoleErrors = [];

const FAKE_RAZORPAY = `
window.Razorpay = function (opts) {
  var handlers = {};
  this.on = function (ev, cb) { handlers[ev] = cb; };
  this.open = function () {
    var mode = window.__rzpMode || 'success';
    var o = document.createElement('div');
    o.id = 'fake-rzp';
    o.style = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:grid;place-items:center';
    o.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;color:#000"><p>Razorpay TEST checkout (fake) for ' + opts.order_id + ' amount ' + opts.amount + '</p><button id="rzp-pay">Pay</button> <button id="rzp-fail">Fail</button> <button id="rzp-close">Close</button></div>';
    document.body.appendChild(o);
    o.querySelector('#rzp-close').onclick = function () { o.remove(); opts.modal.ondismiss(); };
    o.querySelector('#rzp-fail').onclick = function () { handlers['payment.failed'] && handlers['payment.failed']({ error: { description: 'Card declined by bank (test)' } }); };
    o.querySelector('#rzp-pay').onclick = async function () {
      var pid = 'pay_' + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
      var key = await crypto.subtle.importKey('raw', new TextEncoder().encode('stub_test_secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      var sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(opts.order_id + '|' + pid));
      var hex = Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      if (mode === 'tamper') hex = hex.replace(/^./, hex[0] === 'a' ? 'b' : 'a');
      o.remove();
      opts.handler({ razorpay_payment_id: pid, razorpay_order_id: opts.order_id, razorpay_signature: hex });
    };
  };
};`;

async function control(body) { const r = await fetch(`${STUB}/__control`, { method: 'POST', body: JSON.stringify(body) }); return r.json(); }

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`PASS  ${name}`); }
  catch (e) { try { await (globalThis.__lastPage || page).screenshot({ path: `shots/FAIL-${results.length}.png` }); } catch {}
    results.push({ name, ok: false, error: String(e?.message || e).split('\n')[0] }); console.log(`FAIL  ${name}\n      ${String(e?.message || e).split('\n').slice(0, 3).join('\n      ')}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function newPage(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/images\.unsplash\.com/, (r) => r.abort());
  await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_RAZORPAY }));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) consoleErrors.push(`${page.url()} :: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: pageerror ${e.message}`));
  return { ctx, page };
}

const email = `asha${Date.now()}@example.com`;
const { ctx, page } = await newPage();

await test('Home renders real catalogue collections and categories', async () => {
  await page.goto(BASE);
  await page.getByRole('heading', { name: /Everyday essentials/ }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.product-card.is-skeleton').length === 0
    && document.querySelectorAll('.product-card').length >= 8, null, { timeout: 15000 });
  const cards = await page.locator('.product-card:not(.is-skeleton)').count();
  assert(cards >= 8, `expected product cards, got ${cards}`);
  await page.screenshot({ path: 'shots/01-home-desktop.png', fullPage: false });
});

await test('Search, category filter, price sort and pagination use the API', async () => {
  await page.getByLabel('Search products').fill('watch');
  await page.getByLabel('Search products').press('Enter');
  await page.getByRole('heading', { name: /Results for/ }).waitFor();
  await page.locator('.product-card:not(.is-skeleton)').first().waitFor();
  const names = await page.locator('.product-name').allTextContents();
  assert(names.some((n) => /Watch/i.test(n)), `search results ${names}`);
  await page.goto(`${BASE}/shop?category=Electronics&sort=price_asc`);
  await page.locator('.product-card:not(.is-skeleton)').first().waitFor();
  const prices = (await page.locator('.product-card .price').allTextContents()).map((t) => Number(t.replace(/[^\d.]/g, '')));
  assert(prices.length === 4 && prices.every((p, i) => i === 0 || p >= prices[i - 1]), `prices not ascending ${prices}`);
  await page.goto(`${BASE}/shop`);
  await page.locator('.product-card:not(.is-skeleton)').first().waitFor();
  assert(await page.getByRole('navigation', { name: 'Pagination' }).isVisible(), 'pagination visible for 20 products / 12 per page');
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.waitForURL(/page=1/);
  await page.locator('.product-card:not(.is-skeleton)').first().waitFor();
  assert((await page.locator('.product-card:not(.is-skeleton)').count()) === 8, 'page 2 has 8 items');
  await page.screenshot({ path: 'shots/02-catalogue.png' });
});

await test('Product page shows live price/stock; out-of-stock cannot be bought; quantity capped by stock', async () => {
  await page.goto(`${BASE}/product/16`);
  await page.getByRole('heading', { name: 'Soft Notes Eau de Parfum' }).waitFor();
  assert(await page.getByText('This product is out of stock').isVisible(), 'out of stock notice');
  assert((await page.locator('.pdp').getByRole('button', { name: /Add to cart/ }).count()) === 0, 'no add-to-cart for OOS');
  await page.goto(`${BASE}/product/12`);
  await page.getByText('Only 2 left').first().waitFor();
  const inc = page.getByRole('button', { name: 'Increase quantity' });
  await inc.click();
  assert(await inc.isDisabled(), 'increase disabled at stock limit 2');
  await page.screenshot({ path: 'shots/03-product.png' });
});

await test('Guest cart: add items, server quote total, checkout requires sign-in', async () => {
  await page.goto(`${BASE}/product/1`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/product/10`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/cart`);
  await page.getByText('Price details').waitFor();
  await page.locator('.summary-total dd').waitFor();
  const total = await page.locator('.summary-total dd').textContent();
  assert(/3,298/.test(total), `total ${total}`);
  await page.getByRole('button', { name: 'Sign in to check out' }).click();
  await page.waitForURL(/\/login/);
});

await test('Registration validates input and creates a real session', async () => {
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Use 8 to 72 characters').waitFor();
  await page.getByLabel('Password', { exact: true }).fill('Secure123');
  await page.getByLabel('Confirm password').fill('Secure123');
  await page.getByLabel(/I have read this notice/).check();
  // Terms and Conditions not ticked: the form refuses and stays on the page.
  assert(!(await page.getByLabel(/I have read and agree to the Terms and Conditions and Privacy Notice/).isChecked()), 'terms box unchecked by default');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Please accept the Terms and Conditions to continue.').waitFor();
  assert(page.url().includes('/register'), 'still on the registration page');
  await page.getByLabel(/I have read and agree to the Terms and Conditions and Privacy Notice/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/checkout/);
});

await test('Terms acceptance: API rejects false/missing/old version; saved with version and time; marketing stays independent', async () => {
  const post = (body) => page.evaluate(async (b) => {
    const r = await fetch('/api/authentication-service/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, body);
  const base = { name: 'Api Tester', email: `api${Date.now()}@example.com`, password: 'Secure123', acceptPrivacyNotice: true, marketingConsent: false };
  const noTerms = await post({ ...base, termsAccepted: false, termsVersion: '2026-10-15' });
  assert(noTerms.status === 400 && /Terms and Conditions/.test(noTerms.body?.message ?? ''), `termsAccepted=false must be 400, got ${noTerms.status}`);
  const missing = await post({ ...base, termsVersion: '2026-10-15' });
  assert(missing.status === 400, `missing termsAccepted must be 400, got ${missing.status}`);
  const stringTrue = await post({ ...base, termsAccepted: 'yes', termsVersion: '2026-10-15' });
  assert(stringTrue.status === 400, `non-boolean termsAccepted must be 400, got ${stringTrue.status}`);
  const oldVersion = await post({ ...base, termsAccepted: true, termsVersion: '2020-01-01' });
  assert(oldVersion.status === 409, `old terms version must be 409, got ${oldVersion.status}`);
  // The customer registered through the form in the previous test: acceptance saved, marketing untouched.
  await page.goto(`${BASE}/account`);
  await page.getByText(/You accepted the Terms and Conditions \(version 2026-10-15\) on /).waitFor();
  assert(!(await page.getByLabel('Send me offers and new arrivals').isChecked()), 'terms acceptance must not switch on marketing');
  await page.goto(`${BASE}/checkout`);
});

await test('Checkout: address validation, save address, COD order persisted, stock reserved', async () => {
  const before = await control({});
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('House no., building, street').fill('12 MG Road');
  await page.getByLabel('City').fill('Pune');
  await page.getByLabel('PIN code').fill('0123');
  await page.getByLabel('State').selectOption('Maharashtra');
  await page.getByRole('button', { name: 'Save and deliver here' }).click();
  await page.getByText('Enter a valid 6-digit PIN code').waitFor();
  await page.getByLabel('PIN code').fill('411001');
  await page.getByRole('button', { name: 'Save and deliver here' }).click();
  await page.getByText('12 MG Road').waitFor();
  await page.getByText('Sandbox', { exact: true }).first().waitFor();
  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  await page.screenshot({ path: 'shots/04-checkout.png' });
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/account\/orders\/\d+\?placed=1/);
  await page.getByRole('heading', { name: /Thank you! Your order is confirmed/ }).waitFor();
  const after = await control({});
  assert(after.orders === before.orders + 1, 'one order created');
  assert(after.stock[1] === before.stock[1] - 1 && after.stock[10] === before.stock[10] - 1, 'stock reserved');
  assert((await page.locator('.cart-link .count').count()) === 0, 'cart cleared');
  await page.screenshot({ path: 'shots/05-order-confirmed.png' });
});

await test('Refresh keeps session (HttpOnly refresh cookie) and order comes from backend', async () => {
  await page.reload();
  await page.getByRole('heading', { name: /^Order #\d+/ }).waitFor();
  assert(await page.getByText('Cash on delivery').first().isVisible(), 'payment method shown');
  await page.goto(`${BASE}/account/orders`);
  await page.locator('.order-row').first().waitFor();
  assert((await page.locator('.order-row').count()) === 1, 'order listed');
});

await test('Online payment: Razorpay checkout → server signature verification → order confirmed & paid', async () => {
  await page.goto(`${BASE}/product/5`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/checkout`);
  await page.getByRole('radio', { name: /Pay online/ }).check();
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await page.locator('#fake-rzp').waitFor();
  await page.locator('#rzp-pay').click();
  await page.waitForURL(/\/account\/orders\/\d+\?placed=1/);
  await page.getByRole('heading', { name: /order is confirmed/ }).waitFor();
  assert(await page.locator('.badge', { hasText: 'Paid' }).first().isVisible(), 'paid badge');
  await page.getByText('Sandbox transaction. No real money was charged.').waitFor();
  assert(await page.locator('.mono', { hasText: /^pay_/ }).isVisible(), 'transaction id shown');
  await page.screenshot({ path: 'shots/06-online-paid.png' });
});

let pendingOrderUrl = '';
await test('Dismissed payment leaves order pending with countdown; "Pay now" completes it later', async () => {
  await page.goto(`${BASE}/product/6`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/checkout`);
  await page.getByRole('radio', { name: /Pay online/ }).check();
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await page.locator('#rzp-fail').click();
  await page.locator('#rzp-close').click();
  await page.waitForURL(/\/account\/orders\/\d+/);
  pendingOrderUrl = page.url().split('?')[0];
  await page.getByText('Payment pending').waitFor();
  assert(await page.getByText(/Complete payment within \d+:\d\d/).isVisible(), 'countdown');
  await page.screenshot({ path: 'shots/07-payment-pending.png' });
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await page.locator('#rzp-pay').click();
  await page.locator('.badge', { hasText: 'Confirmed' }).first().waitFor();
});

await test('Tampered payment signature is rejected by server; order stays unpaid', async () => {
  await page.goto(`${BASE}/product/7`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/checkout`);
  await page.evaluate(() => { window.__rzpMode = 'tamper'; });
  await page.getByRole('radio', { name: /Pay online/ }).check();
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await page.locator('#rzp-pay').click();
  await page.waitForURL(/\/account\/orders\/\d+/);
  await page.getByText(/Payment verification failed/).first().waitFor();
  await page.getByText('Payment pending').waitFor();
  assert(await page.locator('.badge', { hasText: 'Awaiting payment' }).first().isVisible(), 'still awaiting payment');
  await page.evaluate(() => { window.__rzpMode = 'success'; });
});

await test('Double-click on "Place order" creates exactly one order (Idempotency-Key)', async () => {
  await page.goto(`${BASE}/product/9`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/checkout`);
  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  const before = await control({});
  const btn = page.getByRole('button', { name: 'Place order' });
  await btn.dblclick();
  await page.waitForURL(/placed=1/);
  const after = await control({});
  assert(after.orders === before.orders + 1, `orders +${after.orders - before.orders}`);
  await page.reload();
  await page.getByRole('heading', { name: /^Order #\d+/ }).waitFor();
  assert((await page.locator('.cart-link .count').count()) === 0, 'cart stays empty after reload');
});

await test('Price change between cart and order is caught (409) and cart refreshed', async () => {
  globalThis.__lastPage = page;
  await page.goto(`${BASE}/product/13`);
  await page.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await page.goto(`${BASE}/checkout`);
  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  await page.locator('.summary-total dd').waitFor();
  await control({ setPrice: { id: 13, price: 949 } });
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.getByText(/Prices in your cart have changed/).waitFor();
  await page.locator('.review-list li', { hasText: 'Daily Hydration Skincare Set' }).filter({ hasText: '949' }).waitFor();
  await page.locator('.summary-total dd', { hasText: '949' }).waitFor();
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/placed=1/);
});

await test('Customer cancellation releases stock and is shown in history', async () => {
  const before = await control({});
  await page.goto(`${BASE}/account/orders`);
  await page.locator('.order-row').last().click();
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click();
  await page.locator('.badge', { hasText: 'Cancelled' }).first().waitFor();
  const after = await control({});
  assert(after.stock[1] === before.stock[1] + 1, 'stock released');
});

await test('Notifications list real events; mark all read', async () => {
  await page.goto(`${BASE}/account/notifications`);
  await page.locator('.notif-list li').first().waitFor();
  assert((await page.locator('.notif-list li.unread').count()) > 0, 'unread present');
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.notif-list li.unread').length === 0);
});

await test('Wishlist saves to account', async () => {
  await page.goto(`${BASE}/product/3`);
  await page.getByRole('button', { name: 'Save to wishlist' }).click();
  await page.goto(`${BASE}/wishlist`);
  await page.getByText('Everyday Laptop').waitFor();
});

await test('Customer cannot reach admin UI; unauthenticated admin API call returns 401', async () => {
  await page.goto(`${BASE}/admin`);
  await page.getByText('Administrator access required').waitFor();
  const status = await page.evaluate(async () => (await fetch('/api/order-service/orders')).status);
  assert(status === 401, `unauthenticated API call should be 401, got ${status}`);
});

await test('Saved address management and profile edit', async () => {
  await page.goto(`${BASE}/account`);
  await page.getByText('12 MG Road').waitFor();
  await page.getByLabel('Full name').fill('Asha V');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Profile updated').waitFor();
});

await test('Sign out ends session; protected pages redirect to sign-in', async () => {
  await page.getByRole('button', { name: /Account/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.goto(`${BASE}/account/orders`);
  await page.waitForURL(/\/login/);
});

// ---------------- admin ----------------
const admin = await newPage();
await test('Admin: sign in, overview separates sandbox money from real revenue', async () => {
  const p = admin.page;
  await p.goto(`${BASE}/login`);
  await p.getByLabel('Email').fill('admin@shopsmart.test');
  await p.getByLabel('Password').fill('AdminPass123');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL(/\/admin$/);
  await p.getByText('Live revenue (captured)').waitFor();
  await p.getByText('Not real revenue').waitFor();
  await p.screenshot({ path: 'shots/08-admin-overview.png' });
});

await test('Admin: order lifecycle (processing → shipped → delivered) with server-validated transitions', async () => {
  const p = admin.page;
  await p.goto(`${BASE}/admin/orders?status=CONFIRMED`);
  await p.locator('tbody tr').first().click();
  for (const action of ['Start processing', 'Mark shipped', 'Mark delivered']) {
    await p.getByRole('dialog').getByRole('button', { name: action }).click();
    await p.getByRole('dialog', { name: action }).getByRole('button', { name: action }).click();
    await p.getByText(/is now/).first().waitFor();
  }
  await p.getByRole('dialog').locator('.badge', { hasText: 'Delivered' }).first().waitFor();
  await p.screenshot({ path: 'shots/09-admin-order.png' });
  await p.keyboard.press('Escape');
});

await test('Admin: duplicate product rejected (409), stock adjustment audited', async () => {
  const p = admin.page;
  await p.goto(`${BASE}/admin/products`);
  await p.getByRole('button', { name: 'New product' }).click();
  const d = p.getByRole('dialog');
  await d.getByLabel('Name').fill('Everyday Laptop');
  await d.getByLabel('Description').fill('dup');
  await d.getByLabel(/Price/).fill('100');
  await d.getByLabel('Category').selectOption('Electronics');
  await d.getByRole('button', { name: 'Create product' }).click();
  await d.getByText(/already exists/).waitFor();
  await d.getByRole('button', { name: 'Cancel' }).click();
  await p.locator('tr', { hasText: 'Classic Everyday Timepiece' }).getByRole('button', { name: 'Adjust stock' }).click();
  await p.getByLabel(/Change/).fill('10');
  await p.getByLabel('Reason').fill('Supplier delivery');
  await p.getByRole('button', { name: 'Apply' }).click();
  await p.getByText('Stock updated').waitFor();
  await p.goto(`${BASE}/admin/inventory`);
  await p.getByText('Supplier delivery').first().waitFor();
});

await test('Admin: payments list labels sandbox; customers list loads', async () => {
  const p = admin.page;
  await p.goto(`${BASE}/admin/payments`);
  await p.getByText('Razorpay: sandbox (test) mode').waitFor();
  assert((await p.locator('.badge', { hasText: 'Sandbox' }).count()) > 0, 'sandbox badges');
  await p.goto(`${BASE}/admin/customers`);
  await p.getByText(email).waitFor();
});

// ---------------- resilience & layout ----------------
await test('API outage shows an error with retry (no fake data); retry recovers', async () => {
  const { page: p } = await newPage();
  await control({ failMode: 'down' });
  await p.goto(`${BASE}/shop`);
  await p.getByText("We couldn't load this").waitFor({ timeout: 20000 });
  assert((await p.locator('.product-card:not(.is-skeleton)').count()) === 0, 'no fake products');
  await control({ failMode: null });
  await p.getByRole('button', { name: 'Try again' }).click();
  await p.locator('.product-card:not(.is-skeleton)').first().waitFor();
});

await test('Mobile (390px): no horizontal overflow on key pages; screenshots captured', async () => {
  const { page: m } = await newPage({ width: 390, height: 844 });
  const check = async (path, shot) => {
    await m.goto(`${BASE}${path}`);
    await m.waitForTimeout(700);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await m.screenshot({ path: `shots/${shot}.png`, fullPage: true });
    assert(overflow <= 1, `${path} overflows by ${overflow}px`);
  };
  await check('/', 'm1-home');
  await check('/shop?category=Fashion', 'm2-catalogue');
  await check('/product/1', 'm3-product');
  await m.goto(`${BASE}/product/2`); await m.locator('.pdp-actions').getByRole('button', { name: /Add to cart/ }).click();
  await check('/cart', 'm4-cart');
});

await test('Dark theme renders', async () => {
  const { page: p } = await newPage();
  await p.goto(BASE);
  await p.getByRole('button', { name: /Switch to dark theme/ }).click();
  assert((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark set');
  await p.locator('.product-card:not(.is-skeleton)').first().waitFor();
  await p.screenshot({ path: 'shots/10-home-dark.png' });
  await p.goto(`${BASE}/product/1`);
  await p.screenshot({ path: 'shots/11-product-dark.png' });
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
fs.writeFileSync('results.json', JSON.stringify({ results, consoleErrors }, null, 2));
process.exit(passed === results.length ? 0 : 1);
