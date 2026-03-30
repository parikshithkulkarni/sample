# API Reference

All endpoints are Next.js Route Handlers under `app/api/`. Unless noted otherwise, every authenticated endpoint returns `401 Unauthorized` when no valid session is present.

Common error responses shared across endpoints:

| Status | Body | Meaning |
|--------|------|---------|
| 400 | `{ error, details }` | Zod validation failure (from `parseBody` / `parseQuery`) |
| 401 | `Unauthorized` | Missing or invalid NextAuth session |
| 429 | `{ error, retryAfter }` | Rate limit exceeded |
| 500 | `{ error }` | Unexpected server error |

Pagination query parameters (used by several list endpoints, validated by `paginationSchema`):

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `limit` | number | 50 | 1 -- 200 |
| `offset` | number | 0 | >= 0 |

---

## 1. Auth

### `GET | POST /api/auth/[...nextauth]`

NextAuth.js catch-all route. Handles sign-in, sign-out, session, CSRF, and callback flows. Configuration lives in `lib/auth.ts`.

- **Auth required:** No (this is the auth provider itself)
- **Request / Response:** Defined by NextAuth; see [NextAuth REST API docs](https://next-auth.js.org/getting-started/rest-api).

---

## 2. Documents

### `GET /api/documents`

List documents with pagination.

- **Auth required:** Yes
- **Query params:** `limit`, `offset` (see pagination table above)
- **Response `200`:**
  ```json
  {
    "data": [
      { "id": "uuid", "name": "string", "tags": ["string"], "summary": "string|null", "insights": ["string"]|null, "added_at": "timestamp", "extracted_at": "timestamp|null" }
    ],
    "total": 42
  }
  ```
- **Status codes:** 200, 400, 401, 503 (DATABASE_URL not set), 500

---

### `POST /api/documents`

Upload a new document. Accepts either a base64-encoded PDF or pre-split text chunks.

- **Auth required:** Yes
- **Rate limit:** 10 requests / 60 s per user
- **Request body** (`documentUploadSchema`):
  ```json
  {
    "fileName": "string (required)",
    "mimeType": "string (optional, default 'application/pdf')",
    "base64": "string (optional, PDF binary base64)",
    "chunks": ["string"] ,
    "tags": "string | string[] (optional)"
  }
  ```
  Either `base64` or `chunks` must be provided.
- **Response `200`:**
  ```json
  { "id": "uuid", "name": "string", "tags": ["string"], "summary": null, "insights": null, "added_at": "timestamp", "chunkCount": 5 }
  ```
- **Status codes:** 200, 400, 401, 413 (file too large), 429, 500

---

### `DELETE /api/documents/[id]`

Delete a document and its chunks (cascade).

- **Auth required:** Yes
- **Path params:** `id` -- document UUID
- **Response:** `204 No Content`
- **Status codes:** 204, 401

---

### `POST /api/documents/[id]/analyze`

Generate an AI summary and insights for an existing document using Claude.

- **Auth required:** Yes
- **Path params:** `id` -- document UUID
- **Request body:** None
- **Response `200`:**
  ```json
  { "id": "uuid", "name": "string", "tags": ["string"], "summary": "string", "insights": ["string"], "added_at": "timestamp" }
  ```
- **Status codes:** 200, 401, 404 (no chunks found), 500

---

### `POST /api/documents/[id]/chunks`

Append additional text chunks to an existing document.

- **Auth required:** Yes
- **Path params:** `id` -- document UUID
- **Request body:**
  ```json
  { "chunks": ["string"], "startIndex": 10 }
  ```
- **Response `200`:**
  ```json
  { "ok": true, "added": 5 }
  ```
- **Status codes:** 200, 401, 500

---

### `POST /api/documents/[id]/extract`

Run AI extraction on a document and insert structured financial data into the database.

- **Auth required:** Yes
- **Rate limit:** 10 requests / 60 s per user
- **Path params:** `id` -- document UUID
- **Request body:** None
- **Response `200`:**
  ```json
  { "extracted": true, "accounts": ["string"], "properties": ["string"], "rentalRecords": ["string"], "taxData": ["string"] }
  ```
- **Error response `500`:**
  ```json
  { "extracted": false, "error": "message" }
  ```
- **Status codes:** 200, 401, 429, 500

---

### `POST /api/documents/[id]/extract-preview`

Same extraction as above but returns the raw parsed result **without** writing to the database. Used for user review before confirming.

- **Auth required:** Yes
- **Path params:** `id` -- document UUID
- **Request body:** None
- **Response `200`:**
  ```json
  {
    "accounts": [{ "name": "string", "type": "string", "category": "string", "balance": 0, "currency": "USD" }],
    "properties": [{ "address": "string", "purchase_price": null, "market_value": null }],
    "rental_records": [{ "address": "string", "year": 2024, "month": 1, "rent_collected": 0 }]
  }
  ```
- **Status codes:** 200, 401, 500

---

### `POST /api/documents/[id]/extract-confirm`

Save user-reviewed extraction data to the database. No Claude call -- data was already previewed and edited by the user.

- **Auth required:** Yes
- **Path params:** `id` -- document UUID
- **Request body** (`extractConfirmSchema`):
  ```json
  {
    "accounts": [{ "name": "string", "type": "string", "category": "string (default 'other')", "balance": 0, "currency": "USD", "notes": "string?" }],
    "properties": [{ "address": "string", "purchase_price": null, "purchase_date": null, "market_value": null, "mortgage_balance": null, "monthly_rent": null, "notes": "string?" }],
    "rental_records": [{ "address": "string", "year": 2024, "month": 1, "rent_collected": 0, "mortgage_pmt": 0, "vacancy_days": 0, "expenses": {}, "notes": "string?", "_include": true }]
  }
  ```
  All three arrays default to `[]`.
- **Response `200`:**
  ```json
  { "saved": { "accounts": ["Account Name"], "properties": ["123 Main St"], "rentalRecords": ["123 Main St 2024/1"] } }
  ```
- **Status codes:** 200, 400, 401

---

### `POST /api/documents/extract-all`

Run extraction on **every** document in the database sequentially. Long-running (up to 5 min).

- **Auth required:** Yes
- **Request body:** None
- **Response `200`:**
  ```json
  {
    "processed": 10,
    "results": [
      { "name": "doc.pdf", "accounts": [], "properties": [], "rentalRecords": [], "taxData": [] }
    ]
  }
  ```
- **Status codes:** 200, 401

---

### `POST /api/documents/reindex`

Backfill vector embeddings for chunks where `embedding IS NULL`. Processes up to 500 chunks per call. Idempotent -- safe to call multiple times.

- **Auth required:** Yes
- **Request body:** None
- **Response `200`:**
  ```json
  { "reindexed": 96, "remaining": 0, "message": "All chunks indexed." }
  ```
- **Status codes:** 200, 401, 503 (OPENAI_API_KEY not set)

---

## 3. Chat

### `POST /api/chat`

Send a message and receive a streaming AI response. Automatically creates or reuses a chat session. The response is a Vercel AI SDK data stream with a custom `X-Session-Id` header.

- **Auth required:** Yes
- **Rate limit:** 30 requests / 60 s per user
- **Request body** (`chatSchema`):
  ```json
  {
    "messages": [
      { "role": "user | assistant | system", "content": "string" }
    ],
    "data": {
      "mentionedDocIds": ["uuid"],
      "sessionId": "uuid | ''"
    }
  }
  ```
  At least one message is required. `data` defaults to `{ mentionedDocIds: [], sessionId: "" }`.
- **Response:** Streaming `text/event-stream` with header `X-Session-Id: <uuid>`
- **Tools available to the model:** `searchWeb`, `save_to_dashboard`, `delete_from_dashboard`
- **Status codes:** 200 (streaming), 400, 401, 429

---

### `GET /api/chat/sessions`

List chat sessions with pagination.

- **Auth required:** Yes
- **Query params:** `limit`, `offset`
- **Response `200`:**
  ```json
  {
    "data": [
      { "id": "uuid", "title": "string", "created_at": "timestamp", "updated_at": "timestamp", "message_count": 5 }
    ],
    "total": 12
  }
  ```
- **Status codes:** 200, 400, 401

---

### `POST /api/chat/sessions`

Create a new chat session.

- **Auth required:** Yes
- **Request body:**
  ```json
  { "title": "string (default 'New Chat')" }
  ```
- **Response `201`:**
  ```json
  { "id": "uuid", "title": "string", "created_at": "timestamp", "updated_at": "timestamp" }
  ```
- **Status codes:** 201, 401

---

### `GET /api/chat/sessions/[id]`

Fetch a session with all its messages.

- **Auth required:** Yes
- **Path params:** `id` -- session UUID
- **Response `200`:**
  ```json
  {
    "id": "uuid", "title": "string", "created_at": "timestamp", "updated_at": "timestamp",
    "messages": [
      { "id": "uuid", "role": "user | assistant", "content": "string", "created_at": "timestamp" }
    ]
  }
  ```
- **Status codes:** 200, 401, 404

---

### `PATCH /api/chat/sessions/[id]`

Update a session title.

- **Auth required:** Yes
- **Path params:** `id` -- session UUID
- **Request body:**
  ```json
  { "title": "string" }
  ```
- **Response `200`:**
  ```json
  { "id": "uuid", "title": "string", "updated_at": "timestamp" }
  ```
- **Status codes:** 200, 401

---

### `DELETE /api/chat/sessions/[id]`

Delete a session and all its messages.

- **Auth required:** Yes
- **Path params:** `id` -- session UUID
- **Response:** `204 No Content`
- **Status codes:** 204, 401

---

## 4. Finance

### `GET /api/finance`

List financial accounts with pagination.

- **Auth required:** Yes
- **Query params:** `limit`, `offset`
- **Response `200`:**
  ```json
  {
    "data": [
      { "id": "uuid", "name": "string", "type": "asset | liability", "category": "string", "balance": 50000, "currency": "USD", "notes": "string|null", "updated_at": "timestamp" }
    ],
    "total": 15
  }
  ```
- **Status codes:** 200, 400, 401

---

### `POST /api/finance`

Create a new account (or update an existing one if the normalized name matches).

- **Auth required:** Yes
- **Request body** (`accountSchema`):
  ```json
  {
    "name": "string (required)",
    "type": "asset | liability",
    "category": "string (required)",
    "balance": 50000,
    "currency": "string (default 'USD', max 10 chars)",
    "notes": "string (optional)"
  }
  ```
- **Response `201`** (new) or **`200`** (updated):
  ```json
  { "id": "uuid", "name": "string", "type": "asset", "category": "string", "balance": 50000, "currency": "USD", "notes": null, "updated_at": "timestamp" }
  ```
- **Status codes:** 200, 201, 400, 401

---

### `PATCH /api/finance/[id]`

Partially update an account (balance and/or notes).

- **Auth required:** Yes
- **Path params:** `id` -- account UUID
- **Request body** (`accountPatchSchema`):
  ```json
  {
    "balance": 55000,
    "notes": "string (optional)"
  }
  ```
  Both fields are optional.
- **Response `200`:** Full account object
- **Status codes:** 200, 400, 401

---

### `DELETE /api/finance/[id]`

Delete an account.

- **Auth required:** Yes
- **Path params:** `id` -- account UUID
- **Response:** `204 No Content`
- **Status codes:** 204, 401

---

### `POST /api/finance/cleanup`

Aggressive cleanup: syncs income data to tax returns, deletes junk accounts (income/expense/tax items), deduplicates remaining accounts, and removes $0 balance accounts.

- **Auth required:** Yes
- **Request body:** None
- **Response `200`:**
  ```json
  { "junkRemoved": 5, "duplicatesMerged": 2, "duplicatesRemoved": 3, "zeroBalanceRemoved": 1 }
  ```
- **Status codes:** 200, 401

---

### `POST /api/finance/dedup`

Automatically detect and merge duplicate accounts by normalized name. Keeps the account with the highest balance; sums all balances.

- **Auth required:** Yes
- **Request body:** None
- **Response `200`:**
  ```json
  { "merged": 2, "deleted": 3 }
  ```
- **Status codes:** 200, 401

---

### `POST /api/finance/merge`

Manually merge specific accounts. Sums all balances into the kept account and deletes the rest.

- **Auth required:** Yes
- **Request body** (`mergeSchema`):
  ```json
  {
    "keepId": "uuid",
    "deleteIds": ["uuid"]
  }
  ```
  At least one `deleteId` is required.
- **Response `200`:** The updated kept account object
- **Status codes:** 200, 400, 401, 404 (keepId not found)

---

### `GET /api/finance/snapshots`

Return historical net worth snapshots (up to last 365 days).

- **Auth required:** Yes
- **Response `200`:**
  ```json
  [
    { "snapshot_date": "2024-01-15", "net_worth": 250000, "total_assets": 500000, "total_liabs": 250000 }
  ]
  ```
- **Status codes:** 200, 401

---

## 5. Rentals

### `GET /api/rentals`

List rental properties with pagination.

- **Auth required:** Yes
- **Query params:** `limit`, `offset`
- **Response `200`:**
  ```json
  {
    "data": [
      { "id": "uuid", "address": "string", "purchase_price": null, "purchase_date": null, "market_value": null, "mortgage_balance": null, "notes": null, "created_at": "timestamp" }
    ],
    "total": 3
  }
  ```
- **Status codes:** 200, 400, 401

---

### `POST /api/rentals`

Create a new property (or update an existing one if the normalized address matches).

- **Auth required:** Yes
- **Request body** (`propertySchema`):
  ```json
  {
    "address": "string (required)",
    "purchase_price": "number | null (optional)",
    "purchase_date": "YYYY-MM-DD | null (optional)",
    "market_value": "number | null (optional)",
    "mortgage_balance": "number | null (optional)",
    "notes": "string (optional)"
  }
  ```
- **Response `201`** (new) or **`200`** (updated): Full property object
- **Status codes:** 200, 201, 400, 401

---

### `GET /api/rentals/[propertyId]`

Get a single property by ID.

- **Auth required:** Yes
- **Path params:** `propertyId` -- property UUID
- **Response `200`:** Full property object
- **Status codes:** 200, 401, 404

---

### `PATCH /api/rentals/[propertyId]`

Partially update a property. All fields are optional.

- **Auth required:** Yes
- **Path params:** `propertyId` -- property UUID
- **Request body** (`propertyPatchSchema`):
  ```json
  {
    "address": "string (optional)",
    "purchase_price": "number | null (optional)",
    "purchase_date": "string | null (optional)",
    "market_value": "number | null (optional)",
    "mortgage_balance": "number | null (optional)",
    "notes": "string | null (optional)"
  }
  ```
- **Response `200`:** Full property object
- **Status codes:** 200, 400, 401

---

### `DELETE /api/rentals/[propertyId]`

Delete a property.

- **Auth required:** Yes
- **Path params:** `propertyId` -- property UUID
- **Response:** `204 No Content`
- **Status codes:** 204, 401

---

### `GET /api/rentals/[propertyId]/records`

List rental records for a property, optionally filtered by year.

- **Auth required:** Yes
- **Path params:** `propertyId` -- property UUID
- **Query params:** `year` (optional integer)
- **Response `200`:**
  ```json
  [
    { "id": "uuid", "property_id": "uuid", "year": 2024, "month": 1, "rent_collected": 2000, "vacancy_days": 0, "mortgage_pmt": 1500, "expenses": {}, "notes": null }
  ]
  ```
- **Status codes:** 200, 401

---

### `POST /api/rentals/[propertyId]/records`

Create or upsert a rental record (unique on property_id + year + month).

- **Auth required:** Yes
- **Path params:** `propertyId` -- property UUID
- **Request body** (`rentalRecordSchema`):
  ```json
  {
    "year": 2024,
    "month": 1,
    "rent_collected": 2000,
    "vacancy_days": 0,
    "mortgage_pmt": 1500,
    "expenses": { "repairs": 200 },
    "notes": "string (optional)"
  }
  ```
  `year` range: 1900--2100. `month` range: 1--12. Numeric fields default to 0. `expenses` defaults to `{}`.
- **Response `201`:** Full rental record object
- **Status codes:** 201, 400, 401

---

### `POST /api/rentals/dedup`

Automatically detect and merge duplicate properties by normalized address. Keeps the property with the most complete data; re-parents rental records.

- **Auth required:** Yes
- **Request body:** None
- **Response `200`:**
  ```json
  { "merged": 1, "deleted": 2 }
  ```
- **Status codes:** 200, 401

---

### `POST /api/rentals/merge`

Manually merge specific properties. Copies non-null fields from deleted rows into the kept row and re-parents rental records.

- **Auth required:** Yes
- **Request body** (`rentalMergeSchema`):
  ```json
  {
    "keepId": "uuid",
    "deleteIds": ["uuid"]
  }
  ```
- **Response `200`:** The updated kept property object
- **Status codes:** 200, 400, 401, 404 (keepId not found)

---

## 6. Tax Returns

### `GET /api/tax-returns`

Fetch a tax return for a given year and country. Returns defaults if no stored data exists.

- **Auth required:** Yes
- **Query params** (`taxReturnQuerySchema`):

  | Param | Type | Default | Constraints |
  |-------|------|---------|-------------|
  | `year` | number | previous year | 1900--2100 |
  | `country` | string | `"US"` | `"US"` or `"India"` |

- **Response `200`:**
  ```json
  { "id": "uuid|null", "tax_year": 2024, "country": "US", "data": { ... }, "sources": {}, "updated_at": "timestamp|null" }
  ```
- **Status codes:** 200, 400, 401

---

### `POST /api/tax-returns`

Create or sync a tax return for a given year and country. Pulls data from existing accounts.

- **Auth required:** Yes
- **Request body** (`taxReturnSyncSchema`):
  ```json
  {
    "year": 2024,
    "country": "US | India"
  }
  ```
- **Response `200`:** Same shape as GET response
- **Status codes:** 200, 400, 401

---

### `PATCH /api/tax-returns/[id]`

Merge a partial data update into an existing tax return. If `id` is `"new"`, creates a new record (upsert on year + country).

- **Auth required:** Yes
- **Path params:** `id` -- tax return UUID or the literal string `"new"`
- **Request body** (`taxReturnPatchSchema`):
  ```json
  {
    "year": 2024,
    "country": "US | India",
    "data": { "field": "value" }
  }
  ```
  `data` is a partial object that is deep-merged into the existing record.
- **Response `200`:**
  ```json
  { "id": "uuid", "tax_year": 2024, "country": "US", "data": { ... }, "updated_at": "timestamp" }
  ```
- **Status codes:** 200, 400, 401, 404

---

## 7. Scenarios

### `POST /api/scenarios`

Run a tax/financial scenario analysis. Returns a streaming AI response.

- **Auth required:** Yes
- **Rate limit:** 30 requests / 60 s per user
- **Request body** (`scenarioSchema`):
  ```json
  {
    "type": "iso | rnor | capital_gains | rental",
    "params": { "key": "string | number" }
  }
  ```
  Params vary by type:
  - **iso:** `shares`, `strike`, `fmv`, `year`, `agi`, `filing_status`, `state`
  - **rnor:** `return_year`, `years_abroad`, `us_salary`, `foreign_income`, `india_income`
  - **capital_gains:** `asset_name`, `purchase_date`, `sale_date`, `cost_basis`, `sale_price`, `agi`, `filing_status`, `state`
  - **rental:** `monthly_rent`, `mortgage`, `property_tax`, `insurance`, `maintenance`, `mgmt_pct`, `purchase_price`, `depr_basis`, `agi`
- **Response:** Streaming `text/event-stream`
- **Status codes:** 200 (streaming), 400, 401, 429

---

## 8. Deadlines

### `GET /api/deadlines`

List deadlines with pagination. Seeds default deadlines on first call.

- **Auth required:** Yes
- **Query params:** `limit`, `offset`
- **Response `200`:**
  ```json
  {
    "data": [
      { "id": "uuid", "title": "string", "due_date": "YYYY-MM-DD", "category": "string", "notes": "string|null", "is_done": false, "is_recurring": false }
    ],
    "total": 8
  }
  ```
- **Status codes:** 200, 400, 401

---

### `POST /api/deadlines`

Create a new deadline.

- **Auth required:** Yes
- **Request body** (`deadlineSchema`):
  ```json
  {
    "title": "string (required)",
    "due_date": "YYYY-MM-DD (required)",
    "category": "string (required)",
    "notes": "string (optional)",
    "is_recurring": false
  }
  ```
- **Response `201`:** Full deadline object
- **Status codes:** 201, 400, 401

---

### `PATCH /api/deadlines/[id]`

Toggle the done status of a deadline.

- **Auth required:** Yes
- **Path params:** `id` -- deadline UUID
- **Request body** (`deadlinePatchSchema`):
  ```json
  { "is_done": true }
  ```
- **Response `200`:** Full deadline object
- **Status codes:** 200, 400, 401

---

### `DELETE /api/deadlines/[id]`

Delete a deadline.

- **Auth required:** Yes
- **Path params:** `id` -- deadline UUID
- **Response:** `204 No Content`
- **Status codes:** 204, 401

---

## 9. Audit

### `GET /api/audit`

Analyze all stored data and return a list of issues (duplicates, junk accounts, zero balances, invalid dates, orphan properties).

- **Auth required:** Yes
- **Response `200`:**
  ```json
  {
    "summary": {
      "totalAccounts": 15,
      "totalProperties": 3,
      "totalDocuments": 10,
      "documentsExtracted": 8,
      "documentsNotExtracted": 2,
      "totalRentalRecords": 24,
      "issuesByType": { "junk_account": 2, "duplicate_account": 1, "zero_balance": 3, "duplicate_property": 0, "invalid_date": 0, "orphan_property": 1 },
      "autoFixableCount": 6
    },
    "issues": [
      { "type": "string", "severity": "error|warning|info", "entity": "account|property|document", "ids": ["uuid"], "description": "string", "suggestion": "string", "autoFixable": true }
    ],
    "accounts": [{ "id": "uuid", "name": "string", "type": "string", "category": "string", "balance": 0 }],
    "properties": [{ "id": "uuid", "address": "string", "purchase_date": null, "market_value": null, "mortgage_balance": null }],
    "documents": [{ "id": "uuid", "name": "string", "extracted": true }]
  }
  ```
- **Status codes:** 200, 401

---

### `POST /api/audit`

Auto-fix all fixable issues: syncs tax data, deletes junk and $0-balance accounts, deduplicates accounts and properties, clears invalid dates.

- **Auth required:** Yes
- **Request body:** None
- **Response `200`:**
  ```json
  { "junkDeleted": 5, "mergedAccounts": 2, "mergedProperties": 1, "message": "Cleanup complete. Refresh to see results." }
  ```
- **Status codes:** 200, 401

---

## 10. Misc

### `GET /api/ping`

Health check. Verifies database connectivity, schema status, and presence of required API keys.

- **Auth required:** No
- **Response `200`:**
  ```json
  {
    "status": "ok | degraded | error",
    "checks": {
      "database": { "status": "ok | error", "detail": "string?" },
      "schema": { "status": "ok | error", "detail": "string?" },
      "anthropic": { "status": "ok | error", "detail": "string?" },
      "embeddings": { "status": "ok", "detail": "string?" },
      "webSearch": { "status": "ok", "detail": "string?" }
    },
    "timestamp": "ISO-8601"
  }
  ```
- **Status codes:** 200

---

### `GET /api/setup`

Check environment readiness: required env vars, database connectivity, schema presence, admin account existence.

- **Auth required:** No
- **Response `200`:**
  ```json
  {
    "vars": [{ "key": "string", "label": "string", "hint": "string", "link": "url", "ok": true, "required": true }],
    "dbReady": true,
    "dbError": "",
    "allRequired": true,
    "adminExists": true,
    "ready": true
  }
  ```
- **Status codes:** 200

---

### `POST /api/setup`

Create the first admin account. Only allowed when no admin exists (neither via env vars nor in the database).

- **Auth required:** No
- **Request body:**
  ```json
  {
    "username": "string (min 2 chars)",
    "password": "string (min 8 chars)"
  }
  ```
- **Response `200`:**
  ```json
  { "ok": true }
  ```
- **Status codes:** 200, 400, 409 (admin already exists), 500, 503 (no DATABASE_URL)

---

### `POST /api/capture`

Quick-capture a text note as a new document.

- **Auth required:** Yes
- **Request body** (`captureSchema`):
  ```json
  {
    "text": "string (required, min 1 char)",
    "tags": ["string"]
  }
  ```
  `tags` defaults to `[]`. The tag `"capture"` is automatically prepended.
- **Response `201`:**
  ```json
  { "id": "uuid", "name": "capture-2024-01-15 10:30.txt", "tags": ["capture", "..."], "added_at": "timestamp" }
  ```
- **Status codes:** 201, 400, 401

---

### `POST /api/test-upload`

Minimal upload test endpoint. Accepts `multipart/form-data`, echoes file metadata. No database interaction.

- **Auth required:** Yes
- **Request body:** `multipart/form-data` with a `file` field
- **Response `200`:**
  ```json
  { "ok": true, "name": "file.pdf", "size": 12345, "type": "application/pdf" }
  ```
- **Status codes:** 200, 400 (no file), 401, 500
