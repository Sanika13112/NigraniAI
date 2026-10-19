# ShopSmart: full stack

The ShopSmart e-commerce app has two parts:

- **Backend:** 9 Spring Boot services (Spring Boot 4, Java 17). These are your uploaded services, upgraded.
- **Frontend:** a React + TypeScript storefront and admin dashboard. This is new.

This README covers what changed, how to run it, how to switch on real Razorpay payments, and exactly what has and hasn't been verified.

---

## 1. What changed in the backend

| Area | Before | Now |
|---|---|---|
| **Login & access** | Login returned `{id,email,role}` and no token. Every endpoint was public. | Login issues a JWT access token (15 min) plus a rotating refresh token in an **HttpOnly, SameSite=Strict** cookie. Every service checks the token, so customers only see their own data and admin endpoints require `ADMIN`. Accounts lock for 15 minutes after 5 failed logins. |
| **Registration** | Two separate calls (auth, then customer), so one could succeed without the other. | One call. The customer profile is created in the same transaction, which rolls back if the profile fails. Existing accounts are linked by email on their next login. |
| **Admin accounts** | None. | Created only from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on startup. Public registration always creates `CUSTOMER`. |
| **Service-to-service** | Open HTTP. | `/internal/**` endpoints need a shared `INTERNAL_API_KEY`. The gateway also blocks `/internal/**`. |
| **Gateway** | Auto-exposed every service. The CORS property used a prefix this Spring Cloud Gateway version doesn't read. | Explicit routes only, the correct `server.webflux` CORS prefix, and an internal-path filter. |
| **Inventory** | Stock was checked but never reduced, so overselling was possible. | Stock is **reserved atomically** at order time (`UPDATE … WHERE stock >= qty`, all lines or none). It is released on cancel, payment expiry or return. Staff stock changes are audited. |
| **Orders** | `{customerId, items}` from the client. Any caller could set any status. Hard delete. | The customer comes from the token. Orders keep a **delivery address snapshot**, subtotal, shipping, tax and total, payment method and status, payment reference, status history and `updatedAt`. An **Idempotency-Key** stops duplicate orders. `expectedTotal` catches price changes. The server enforces the allowed status changes. Customers can cancel and request returns. Unpaid online orders expire after 30 minutes, after first checking Razorpay for a late payment. Orders are never deleted. |
| **Payments** | Simulated: every non-COD payment was saved as `SUCCESS`. | **Razorpay Orders API + Standard Checkout**, described in §4. |
| **Notifications** | Status-change and payment notifications were silently rejected (wrong type names). | Fixed. Customers can only read their own notifications; admins can message a customer. |
| **Products** | `POST` with an `id` overwrote an existing product. Price was `double`. No search. | Create/update use a DTO with no `id`. Duplicate name in the same category returns 409. Price is `BigDecimal` and must be at least ₹1. Search supports `q`, category, price range, in-stock, sorting and paging. |
| **Customers** | Anyone could list all customers or look one up by email. | `/customers/me`, saved **addresses** (up to 10, one default) and a server-side **wishlist**. Listing customers is admin-only, and every view is logged. |
| **Analytics** | Revenue added up simulated payments. | Admin-only. **Live, sandbox and legacy-simulated money are reported separately.** Adds COD collected and outstanding, a 30-day trend, top products and low stock. |
| **Errors** | Different error shape in each service. | `{status, error, message, traceId, details?}` everywhere, with `X-Trace-Id` correlation. |

The full audit that led to these changes is in the project doc `backend-audit-and-requirements.md`.

### Endpoint summary (all through the gateway)

| | Endpoint | Who |
|---|---|---|
| Auth | `POST /authentication-service/auth/{register,login,refresh,logout}`, `GET …/auth/me` | public / token |
| Products | `GET /product-service/products`, `/products/search`, `/products/{id}`, `/products/categories` | public |
| | `POST/PUT/DELETE /products…`, `PATCH /products/{id}/stock`, `GET /products/stock-adjustments` | admin |
| Customers | `GET/PUT /customer-service/customers/me`, `…/me/addresses[/{id}[/default]]`, `…/me/wishlist[/{productId}]` | customer |
| | `GET /customers`, `GET /customers/{id}` | admin |
| Orders | `POST /order-service/orders/quote` | public |
| | `POST /orders` (header `Idempotency-Key`), `GET /orders/me[/{id}]`, `POST /orders/me/{id}/{cancel,return}` | customer |
| | `GET /orders?status=`, `GET /orders/{id}`, `PATCH /orders/{id}/status` | admin |
| Payments | `GET /payment-service/payments/config` | public |
| | `POST /payments/checkout`, `POST /payments/verify`, `GET /payments/order/{id}?refresh=true` | customer |
| | `POST /payments/webhooks/razorpay` | Razorpay (HMAC-signed) |
| | `GET /payments`, `POST /payments/{id}/refund` | admin |
| Notifications | `GET /notification-service/notifications/me`, `…/me/unread-count`, `PATCH …/me/{id}/read`, `POST …/me/read-all` | customer |
| | `GET/POST /notifications` | admin |
| Analytics | `GET /analytics-service/analytics/{overview,trends,top-products}` | admin |

---

## 2. Frontend

The customer storefront includes:
- **Browsing:** home with categories and collections, a catalogue with server-side search, filters, sort and pagination, and product pages showing live price and stock.
- **Cart and checkout:** a cart re-priced by the server, and a three-step checkout (address, payment method, review) with Razorpay or cash on delivery.
- **After the order:** a confirmation page built from the saved order, order history, a tracking timeline, pay-now and "check payment status" recovery, cancellation and returns.
- **Account:** profile, saved addresses, wishlist and notifications.
- **Throughout:** light and dark themes, skeleton loaders, empty and error states with retry, and accessible forms and dialogs.

The admin dashboard (`/admin`) has:
- **Overview:** live, sandbox and COD money kept separate, orders by status, a 30-day chart, low stock and top products.
- **Orders:** status changes the server enforces, with confirmation dialogs and notes.
- **Products and inventory:** create, edit and delete products, plus audited stock adjustments.
- **Customers and payments:** customer records (views are logged) and messages to customers; payments with sandbox, live and simulated badges, and refunds.
- **Reports:** CSV export.

The frontend holds no secrets. Hiding admin screens in the browser is not the security boundary; the server enforces every rule.

---

## 3. Run it

### Option A: Docker Compose (whole stack)

```bash
cp .env.example .env
./scripts/gen-secrets.sh        # paste the output into .env
# set DB passwords, ADMIN_EMAIL, and (optionally) Razorpay test keys in .env
docker compose up --build
```

- Store: http://localhost:8088
- Gateway: http://localhost:8080
- Admin: sign in at http://localhost:8088/login with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Option B: local, without Docker (your current setup)

1. MySQL on `localhost:33006` with the database `shopsmart_db`. This is your existing default.
2. `cp .env.example .env`, then fill in the secrets. Set `COOKIE_SECURE=false` for plain-HTTP localhost.
3. Start the backend with `./scripts/start-local.sh`, or start each service from your IDE with the same environment variables. Start discovery first and the gateway last.
4. Start the frontend:
   ```bash
   cd frontend && npm install && npm run dev
   ```
   Then open http://localhost:5173.

**Upgrading an existing database:** start the services once, then follow `db/upgrade-existing-database.sql`. It covers changing the price column to DECIMAL and reviewing legacy rows. Back up first.

**Note:** the generated `contextLoads` tests boot the full application, so they need the database and the secrets. Build with `-DskipTests` (as the Dockerfiles do) or provide test configuration.

---

### Option C: share it online for a demo (easiest)

With the project running (`run-project.bat`), run `share-online.bat`. It builds the website and opens a free Cloudflare quick tunnel, then prints a public `https://….trycloudflare.com` address that works on any phone or computer. Install `cloudflared` once with `winget install --id Cloudflare.cloudflared`. The address changes each time and works only while your computer and that window stay on. For an always-on site, see `docs/DEPLOY-AWS.md`.

## 4. Payments with Razorpay

**How it works**

1. The customer places an order. It is saved as `PENDING_PAYMENT` and its stock is reserved.
2. `POST /payments/checkout`: the backend creates a Razorpay order for the **saved order total** (in paise) and returns only the `key_id` and the Razorpay order id.
3. The browser opens Razorpay's official Checkout (UPI, cards, netbanking and wallets, whatever the account has enabled).
4. `POST /payments/verify`: the backend checks `HMAC_SHA256(order_id|payment_id, key_secret)`. It then **fetches the payment from Razorpay's API** and checks the order id, amount, `INR` and status. If the payment is only authorized, it captures it. Only then is the payment `CAPTURED` and the order `CONFIRMED` and `PAID`.
5. **Webhooks** (`payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`) are checked with `X-Razorpay-Signature` against the raw body and de-duplicated by `x-razorpay-event-id`. They confirm payments even if the browser closed.
6. If the browser closes mid-payment, the order page has *"I already paid, check status"*. Before an unpaid order expires, the backend asks Razorpay for any captured payment. A payment that lands on an already-cancelled order is **refunded automatically**.
7. Cancelling or returning a paid order starts a Razorpay refund. It shows as `REFUND_PENDING` until the `refund.processed` webhook arrives.

**Sandbox setup**

1. In the Razorpay Dashboard, switch to **Test Mode**, open **Account & Settings → API Keys**, and generate keys.
2. Put `RAZORPAY_KEY_ID=rzp_test_…` and `RAZORPAY_KEY_SECRET=…` in `.env`.
3. Webhooks need a public URL. For local testing, expose `http://localhost:8080` with a tunnel such as cloudflared or ngrok.
4. Add the webhook `https://<tunnel>/payment-service/payments/webhooks/razorpay` with the events above, set a secret, and put that secret in `RAZORPAY_WEBHOOK_SECRET`.
5. Pay with Razorpay's test UPI ID, cards or netbanking. The UI labels every such payment **Sandbox**.

**Going live** needs all of the following:
- an activated Razorpay merchant account;
- live keys (`rzp_live_…`);
- HTTPS;
- the webhook registered in Live Mode;
- `COOKIE_SECURE=true`.

Until that is done and tested end to end, do **not** describe the store as taking real payments.

No card numbers, CVVs, UPI PINs or secrets are stored. The payment record keeps only Razorpay's order, payment and refund ids, for reconciliation.

---

## 5. Verification: what was and wasn't tested

**Backend (Java):** ⚠️ **not compiled or run.** The build environment couldn't reach Maven Central, so Spring Boot couldn't be downloaded. What was done:
- All 166 Java files pass a syntax parse (tree-sitter).
- `javac` with the Spring classes absent reports **no errors between ShopSmart's own classes** (wrong method names, missing types or bad signatures). I confirmed this check catches planted mistakes.
- What it can't catch is a wrong guess about a Spring, Jakarta, jjwt or Razorpay API. **Run `./mvnw -DskipTests package` in each service first** and send me any compile error.

Things to check on first run:
1. Every existing `*ActivityLogger` injects a Jackson 2 `ObjectMapper`. That's unchanged from your code, but Spring Boot 4 defaults to Jackson 3. If a service fails to start with "no ObjectMapper bean", that is the cause.
2. `PaymentService` parses webhooks with `org.springframework.boot.json.JsonParserFactory`.
3. jjwt 0.12.6 runs alongside Boot 4's dependency management.

**Frontend:** ✅ **built and tested in a real browser.**
- `tsc` and `vite build` pass. The production bundle is about 73 KB gzipped, and admin and checkout are code-split.
- **25 of 25 Playwright journeys pass** in headless Chromium against `e2e/contract-stub.mjs`. That is a Node stand-in that implements the same API contract as the Java services: auth, ownership, idempotency, stock reservation, status transitions and signature checks.
- The final run is in `e2e/run-final.log`, with screenshots in `e2e/shots/`. No browser console errors, and the bundle contains no secrets or key ids.

The journeys covered:
- registration, login, refresh persistence and logout;
- search, filter, sort and paging;
- stock limits and the out-of-stock state;
- cart quote, and checkout with address validation;
- a COD order and an online payment (Razorpay Checkout simulated in-browser, signature verified by the stub);
- a dismissed payment followed by pay-later, and a **tampered signature being rejected**;
- **a double-clicked "Place order" creating exactly one order**;
- **a price change mid-checkout being caught**;
- cancellation releasing stock, notifications, wishlist, and admin access being denied to customers;
- the admin order lifecycle, the duplicate-product 409, and audited stock adjustments;
- **API outage showing an error and recovering on retry**;
- **no horizontal scroll at 390 px wide**, and dark mode.

What this does **not** prove: that the Java services behave exactly like the stub, real Razorpay sandbox transactions, real webhooks, or MySQL behaviour. The order and payment logic is in the Java code, but only a run against your stack proves it.

**Still to do on your side** (acceptance criteria not yet met):
- a sandbox payment with real Razorpay test keys, plus a webhook delivery;
- a run of `e2e/run-e2e.mjs` against the real gateway (see `e2e/README` below);
- a load test of concurrent orders for the last unit.

## 5a. Logs: general logs and DB logs

Every service writes logs in the standard Spring Boot format. The service name is in brackets on every line (`--- [order-service]`), and every `event=` line also carries an explicit `service=<name>` field.

Files are written to `backend/logs/` (set `LOG_PATH` to change the folder):

| File | Contents |
|---|---|
| `<service>.log` | General log: everything shown in the console |
| `<service>-db.log` | DB log only: one `event=db_query` line per SQL statement (7 services with a database) |

Old files roll over daily or at 20 MB into `logs/archive/`, and are kept for 14 days.

A DB log line looks like this:

```
2026-10-14T15:50:02.114+05:30  INFO 4812 --- [order-service] [nio-8084-exec-3] c.s.orderservice.dblog.DbQueryLogger     : event=db_query service=order-service traceId=d84e8bc0-... dbOperation=SELECT table=customer_orders tables=customer_orders,order_line_items dataCategory=personal_data personalData=true durationMs=4 rows=2 slow=false status=success
```

| Field | Meaning |
|---|---|
| `service` | Which microservice ran the query |
| `traceId` | The same ID as that request's `event=http_request` line (`none` for background jobs) |
| `dbOperation` | SELECT, INSERT, UPDATE, DELETE, ALTER and so on |
| `table` / `tables` | The main table, and every table touched (including joins) |
| `dataCategory` | `credentials`, `financial`, `personal_data`, `communication`, `transactional`, `catalog` or `system` (the most sensitive table wins) |
| `personalData` | True for credentials, financial or personal data |
| `durationMs`, `rows`, `slow` | Timing, rows returned or changed, and whether it passed `DB_LOG_SLOW_MS` (default 500 ms) |
| `status` | `success`, or `error` with `sqlState` and `errorCode` (logged at WARN) |

Only metadata is logged. SQL parameter values and row contents are never written, so the DB log never contains passwords, addresses or payment details. Set `DB_LOG_ENABLED=false` to turn it off.

## 5b. Test data for GuardRail: consent, simulator, violation scenarios, export

ShopSmart is the monitored system for the GuardRail DPDPA compliance agent. The full log specification for the team is in **docs/LOGGING.md**.

- **Consent and erasure.** Sign-up requires accepting a privacy notice; marketing consent is a separate, optional choice. Customers can withdraw marketing consent and delete their account in **Account → Privacy and consent**. Deleted accounts are erased after `RETENTION_ERASE_AFTER_SECONDS` (120 seconds for the demo). Order records are kept for tax purposes.
- **Demo violations.** In **Admin → Demo violations**, four switches each make ShopSmart break one rule on purpose: personal data in logs, processing beyond consent, retention bypass, and an unregistered personal-data column. The events they cause are marked `demo=true scenario=<name>`, any personal data in them is synthetic, and each switch change is logged with the admin who made it. Every injected violation is also written to `backend/logs/ground-truth/` as an answer key.
- **Traffic simulator.** This generates realistic traffic with fictional customers:
  ```
  pip install -r tools/requirements.txt
  python tools/traffic-simulator/simulate.py --minutes 20 --scenario demo
  ```
- **Export.** `python tools/export_logs.py` writes `exports/<time>/events.jsonl` (for the agent), `labels.jsonl` (the answer key linked to log lines), `summary.json`, and `logs.sql`, which loads everything into the MySQL database `shopsmart_logs` (tables `log_events` and `log_violation_labels`).

## 5c. Supabase: two separate projects

The shop and the compliance logs live in **two Supabase projects**:
- **`shopsmart-production`** holds the shop's database. The backend picks it with `DB_URL` from `shopsmart.env.bat`; without that file it uses MySQL as before.
- **`guardrail-compliance-logs`** holds the privacy-preserving telemetry. The log shipper inserts it as an insert-only role; GuardRail reads it with a read-only role and never touches production.

| Document | What it covers |
|---|---|
| `docs/ARCHITECTURE.md` | Design, data flow, roles, and which program reads each setting |
| `docs/SETUP-WINDOWS.md` | Step-by-step setup in cmd |
| `docs/GUARDRAIL-INTEGRATION.md` | For the detector and dashboard team |
| `docs/SECURITY-TEST-REPORT.md` | Test results: tested, partially tested and unverified |
| `docs/MIGRATION-REPORT.md` | What happens to the existing MySQL data |
| `docs/DEPLOY-AWS.md` | Putting ShopSmart online on one AWS EC2 server with Docker (`docker-compose.cloud.yml`) |

| SQL | Run in |
|---|---|
| `supabase/guardrail-logs/01-schema.sql`, `02-roles-and-access.sql`, `03-reference-rules.sql` | The logs project |
| `supabase/shopsmart-production/01-secure-tables.sql` | The production project |

## 6. Known limitations

- **Delivery and logistics:** carrier tracking isn't integrated. The UI says so, and shows ShopSmart's own status history instead.
- **Pricing extras:** shipping is a configurable flat fee (default ₹0). There are no coupons or discounts, and GST is treated as included in the price. No invented charges are shown.
- **COD refunds** after delivery are marked `REFUND_ACTION_REQUIRED`, for staff to handle by hand.
- **Database:** `ddl-auto=update` is still in use. Move to Flyway, with a least-privilege DB user, before production.
- **Missing account features:** email or SMS notifications, password reset, and email verification are not built.

### e2e/README

```bash
cd e2e && npm install
node contract-stub.mjs &                                   # or point at the real gateway
cd ../frontend && npm run build && SHOPSMART_GATEWAY_URL=http://localhost:8099 npx vite preview --port 4173 &
cd ../e2e && npx playwright install chromium && node run-e2e.mjs
```

Against the real stack, set `SHOPSMART_GATEWAY_URL=http://localhost:8080`. Some steps use the stub-only `/__control` endpoint, to set a price or simulate an outage; skip those steps there.
