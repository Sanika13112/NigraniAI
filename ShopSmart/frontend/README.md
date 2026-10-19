# ShopSmart frontend

React 18 + TypeScript + Vite. It contains the customer storefront and, under `/admin`, the staff dashboard.

```bash
npm install
cp .env.example .env          # optional: change SHOPSMART_GATEWAY_URL if the gateway isn't on :8080
npm run dev                   # http://localhost:5173 (proxies /api → gateway)
npm run build                 # type-check + production bundle in dist/
npm run preview               # serve dist/ with the same /api proxy
```

- Every API call goes to `/api/...`, which is proxied to the Spring Cloud Gateway, so the browser talks to a single origin. That keeps the HttpOnly refresh cookie working and avoids CORS.
- The access token is held only in memory. On reload, the session is restored from the refresh cookie.
- There are no secrets in this app. The Razorpay *key id* arrives per checkout from the backend. The key secret and webhook secret exist only on the server.
- The structure: `src/lib/api.ts` is the HTTP client (timeouts, retries, refresh-on-401, trace ids), `src/lib/endpoints.ts` covers every backend call, `src/pages/` holds customer pages, `src/admin/` the admin dashboard, and `src/styles/app.css` the design system (light and dark).
