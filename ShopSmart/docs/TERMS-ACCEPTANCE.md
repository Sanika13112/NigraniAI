# Terms and Conditions acceptance at registration

Sign-up now requires ticking **"I have read and agree to the Terms and Conditions and Privacy Notice."** The box starts unticked.

The server enforces it too: it rejects any registration where `termsAccepted` is missing or not `true`, or where `termsVersion` is not the version currently in force. Each accepted registration stores the version and the time it was accepted on the customer's profile.

## Three separate choices at sign-up

| Choice | Required | Stored in (`customers` table) | Purpose |
|---|---|---|---|
| Terms and Conditions | Yes | `terms_accepted`, `terms_version`, `terms_accepted_at` (**new**) | Agreement to the shop's rules |
| Privacy notice consent | Yes | `privacy_notice_accepted` (**new**), plus `consent_notice_version`, `consented_at` (existing) | DPDP consent for account, orders, delivery and payment |
| Marketing | No | `marketing_consent` (existing, unchanged) | Offers and new arrivals |

Each checkbox has its own yes/no column: `terms_accepted`, `privacy_notice_accepted` and `marketing_consent`. Accepting the terms never sets `marketing_consent`. The privacy-notice column is added by `db/migrations/2026-10-16-privacy-notice-accepted.*.sql` (or by Hibernate on start).

## Why columns on `customers`, not a new table

- The existing consent record already lives on `customers`, written in the same transaction as the profile, so terms acceptance follows the same pattern.
- Only one version exists today, and there is no re-acceptance flow yet.
- When the terms change and customers must accept again, a history table (`customer_terms_acceptances`: customer, version, time, source) becomes the better design, because it keeps every version a customer accepted. These columns would then hold the latest acceptance.

## Registration flow

1. **Browser.** The form checks the box client-side, then sends `termsAccepted: true` and `termsVersion` (from `frontend/src/lib/terms.ts`) along with the existing fields.
2. **Authentication service, validation.** `RegisterRequest` requires `termsAccepted` to be present and `true` (`@NotNull @AssertTrue`) and `termsVersion` to be non-blank. A failure returns `400`, and nothing is written.
3. **Authentication service, version check.** `AuthService.register` compares `termsVersion` with `shopsmart.terms.version` (env `TERMS_VERSION`, default `2026-10-15`). A mismatch returns `409` ("The Terms and Conditions have been updated…"), and nothing is written.
4. **Authentication service, login.** The login account is created inside a transaction.
5. **Customer service.** The authentication service calls `POST /internal/customers` with `termsAccepted: true` and `termsVersion`. The profile, the privacy consent and the terms acceptance are saved in one transaction.
   - If this call fails, the login account is rolled back, so no half-registered account or orphan acceptance remains.
   - Repeating the call for the same account changes nothing, so there are no duplicate records.
6. **Log event.** Customer service logs `event=terms_accepted customerRef=customer:<id> termsVersion=… source=registration`.
   - The log carries no name, email or password.
   - The log uploader pseudonymises the customer reference before sending it to GuardRail, where the event is classed as a consent event.
7. **Reading it back.** The acceptance is returned by `GET /customer-service/customers/me/consent` and shown under **Account → Privacy and consent**.

Accounts created before this change show `terms_accepted = NULL`: no acceptance is recorded for them, and they are not modified.

## API examples

**Register (accepted):**
```http
POST /api/authentication-service/auth/register
Content-Type: application/json

{"name":"Asha Verma","email":"asha@example.com","password":"Secure123","phone":"9876543210",
 "acceptPrivacyNotice":true,"marketingConsent":false,
 "termsAccepted":true,"termsVersion":"2026-10-15"}
```
`201 Created`: the usual session response (access token, user). The refresh cookie is set.

**Terms not accepted** (`"termsAccepted":false`, or the field missing):
```json
{"status":400,"error":"Bad Request","message":"Please accept the Terms and Conditions to continue.",
 "details":["Please accept the Terms and Conditions to continue."],"traceId":"…"}
```

**Old terms version** (`"termsVersion":"2020-01-01"`):
```json
{"status":409,"error":"Conflict","message":"The Terms and Conditions have been updated. Please reload the page, review them and try again.","traceId":"…"}
```

**Read it back:**
```http
GET /api/customer-service/customers/me/consent
Authorization: Bearer <access token>
```
```json
{"noticeVersion":"v1-2026-10","purposes":["account","order_fulfilment","delivery","payment"],
 "marketingConsent":false,"consentedAt":"2026-10-15T18:20:11Z","consentUpdatedAt":"2026-10-15T18:20:11Z",
 "deletionRequestedAt":null,"termsAccepted":true,"termsVersion":"2026-10-15","termsAcceptedAt":"2026-10-15T18:20:11Z"}
```

## Database change

Hibernate (`ddl-auto=update`) adds the three NULL-able columns to `customers` on the next start of customer-service. For a hand-managed schema, run the matching script:
- `db/migrations/2026-10-15-terms-acceptance.mysql.sql`
- `db/migrations/2026-10-15-terms-acceptance.postgres.sql`

The new columns are also declared in customer-service's data inventory (`SchemaLogger`), so GuardRail does not report them as schema drift.

## Changing the terms later

1. Edit `frontend/src/pages/Terms.tsx`.
2. Set the new version in `frontend/src/lib/terms.ts` and in `TERMS_VERSION` for the authentication service. They must match, or registration returns 409.
3. Existing customers keep the version they accepted. Asking them to accept the new version needs a re-acceptance screen, which is not built yet.

## Run and test

1. Extract the update, then run `stop-project.bat` and `run-project.bat`. Customer-service adds the columns on start.
2. Open http://localhost:5173/register. Submit with the Terms box unticked: the form shows "Please accept the Terms and Conditions to continue." and does not register.
3. Tick it and register. **Account → Privacy and consent** shows "You accepted the Terms and Conditions (version 2026-10-15) on …", and the marketing box stays as you left it.
4. Check the API directly in cmd:
   ```
   curl -i -X POST http://localhost:8080/authentication-service/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Api Test\",\"email\":\"api1@example.com\",\"password\":\"Secure123\",\"acceptPrivacyNotice\":true,\"marketingConsent\":false,\"termsAccepted\":false,\"termsVersion\":\"2026-10-15\"}"
   ```
   Expect `400` and no new row in `customers` or `auth_users`.
5. In the database:
   ```sql
   SELECT id, email, marketing_consent, terms_accepted, terms_version, terms_accepted_at FROM customers ORDER BY id DESC LIMIT 5;
   ```

## Test results

| Test | Result |
|---|---|
| Browser test suite, 26 journeys (now includes the unticked box, a refused API call with `termsAccepted` false, missing or not a boolean, an old version returning 409, the acceptance shown on the account page, and marketing staying off) | **26/26 passed** against the contract stub, which mirrors these rules |
| Frontend type check and production build | Passed |
| Migration scripts on MySQL 8 and PostgreSQL 16 test databases | Passed. Existing rows unchanged: the new columns are NULL and `marketing_consent` is as before. The PostgreSQL script is safe to re-run |
| Java services compiled and run | **Not run here.** Maven could not download dependencies in this environment; a filtered `javac` check found no errors in ShopSmart's own code. Run the steps above on your computer |
