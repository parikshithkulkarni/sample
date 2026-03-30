# Second Brain — AI Personal Knowledge System

Your private, mobile-first AI dashboard. Upload documents, ask questions across everything you've stored, track finances, model tax scenarios, and manage deadlines — all from your phone.

---

## Deploy in one step

**Before you click:** grab your free Anthropic API key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) (sign up → API Keys → Create Key).

Then click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fparikshithkulkarni%2Fsample&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D&env=ANTHROPIC_API_KEY%2CADMIN_USERNAME%2CADMIN_PASSWORD&envDescription=ANTHROPIC_API_KEY%3A%20get%20at%20console.anthropic.com%20%E2%80%94%20ADMIN_USERNAME%2FADMIN_PASSWORD%3A%20choose%20your%20login%20credentials&envLink=https%3A%2F%2Fconsole.anthropic.com%2Fsettings%2Fkeys&project-name=second-brain&repository-name=second-brain)

Vercel will:
- Clone this repo to your GitHub account
- Provision a Postgres database automatically
- Ask you for **3 values** — paste your Anthropic key, pick a username and password
- Deploy

That's it. Visit `/setup` on your deployed URL to confirm everything is green.

---

## What you get

- **Chat** — ask questions across all your documents, streaming replies with citations
- **Knowledge Base** — upload PDFs, markdown, text; AI generates summaries + insights
- **Quick Capture** — floating `+` button, notes saved and searchable instantly
- **Tax Scenarios** — ISO exercise, RNOR window, capital gains, rental income modeler
- **Finance** — net worth tracker (assets + liabilities)
- **Rentals** — property portfolio, monthly P&L, cap rate, cashflow, NOI
- **Deadlines** — US + India tax dates pre-loaded, add your own
- **Audit Dashboard** — data quality analysis with one-click cleanup for duplicates and junk entries
- **Tax Returns** — US and India tax return tracking with auto-sync from accounts and rental data

## What's automatic (nothing to configure)

| | |
|---|---|
| Database schema | Created on first startup |
| Tax deadlines | 7 US + India dates pre-loaded |
| `NEXTAUTH_SECRET` | Derived from your password |
| `NEXTAUTH_URL` | Set by Vercel to your deployment URL |
| Redeployments | Every push to GitHub auto-deploys |

---

## Architecture

```
Browser/Mobile
    │
    ▼
┌──────────────────────────────────┐
│  Next.js 15 App Router           │
│  ┌────────────┐ ┌──────────────┐ │
│  │ React UI   │ │  API Routes  │ │
│  │ (Tailwind)  │ │  (27 REST)   │ │
│  └────────────┘ └──────┬───────┘ │
│                        │         │
│  ┌─────────────────────┘         │
│  │  lib/                          │
│  │  ├── retrieval (hybrid search) │
│  │  ├── extract (Claude AI)       │
│  │  ├── ingestion (doc pipeline)  │
│  │  ├── tax-returns (sync logic)  │
│  │  └── validators (Zod schemas)  │
│  └───────────────────────────────│
└──────────┬───────────┬───────────┘
           │           │
    ┌──────┘           └──────┐
    ▼                         ▼
PostgreSQL (Neon)      Claude API
├── FTS (tsvector)     (Anthropic)
├── pgvector
└── 12 tables
```

**Data flow:** Document upload → text extraction → chunking → FTS indexing + optional vector embedding → retrieval at chat time via hybrid search (FTS + cosine similarity).

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or a [Neon](https://neon.tech) serverless database)
- [Anthropic API key](https://console.anthropic.com/settings/keys)

### Setup

```bash
git clone https://github.com/parikshithkulkarni/sample.git
cd sample
npm install
cp .env.example .env.local
# Edit .env.local — fill in the required values (see Environment Variables below)
npm run dev
```

Visit `http://localhost:3000/setup` to verify configuration.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `ADMIN_USERNAME` | Yes | Login username for the admin account |
| `ADMIN_PASSWORD` | Yes | Login password (also used to derive `NEXTAUTH_SECRET` if not set) |
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-provisioned on Vercel) |
| `NEXTAUTH_SECRET` | Auto | Derived from `ADMIN_PASSWORD` if not explicitly set |
| `NEXTAUTH_URL` | Auto | Set by Vercel; defaults to `http://localhost:3000` in dev |
| `OPENAI_API_KEY` | No | Enables semantic search via vector embeddings (falls back to FTS without it) |
| `TAVILY_API_KEY` | No | Enables web search tool in chat |

---

## Database Schema

All tables are created automatically on first startup via `lib/db.ts`.

| Table | Purpose |
|-------|---------|
| `documents` | Uploaded files with name, tags, AI-generated summary and insights |
| `chunks` | Text segments with tsvector for FTS and optional vector(512) embedding |
| `accounts` | Financial accounts (assets + liabilities) for net worth tracking |
| `properties` | Rental real estate with purchase/market/mortgage values |
| `rental_records` | Monthly P&L per property (rent, expenses, vacancy) |
| `deadlines` | Tax dates and milestones (US + India pre-seeded) |
| `chat_sessions` | Chat conversation metadata |
| `chat_messages` | Individual chat messages (user + assistant) |
| `net_worth_snapshots` | Daily net worth history (one snapshot per day) |
| `admin_users` | Hashed credentials (scrypt + salt) |
| `tax_returns` | US/India tax data per year (JSONB) with field source tracking |

---

## Project Structure

```
├── app/
│   ├── api/              # 27 REST API route handlers
│   │   ├── chat/         # Streaming chat with RAG + tool-calling
│   │   ├── documents/    # Upload, extract, analyze, reindex
│   │   ├── finance/      # Accounts CRUD, dedup, merge, snapshots
│   │   ├── rentals/      # Properties + monthly records
│   │   ├── tax-returns/  # US/India tax data sync
│   │   ├── scenarios/    # AI tax scenario modeling
│   │   ├── deadlines/    # CRUD + pre-seeded dates
│   │   └── audit/        # Data quality analysis + auto-fix
│   └── (pages)/          # Next.js App Router pages
├── components/           # 23 React components (UI)
├── lib/                  # Business logic + utilities
│   ├── auth.ts           # NextAuth config (scrypt hashing)
│   ├── db.ts             # Database migrations + seed data
│   ├── extract.ts        # Claude extraction + dedup logic
│   ├── retrieval.ts      # Hybrid search (FTS + vector)
│   ├── validators.ts     # Zod schemas for all API inputs
│   ├── tax-returns.ts    # Tax calculation + auto-sync
│   └── ...               # chunker, embeddings, retry, etc.
├── __tests__/
│   ├── unit/             # 8 unit test files
│   └── integration/      # 7 integration test files
├── docs/
│   └── API.md            # Full API reference
└── .github/workflows/    # CI (typecheck + test + build)
```

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests use [Vitest](https://vitest.dev/) with mocked database calls. Unit tests cover `lib/` utilities; integration tests cover API route handlers.

---

## API Reference

See [docs/API.md](docs/API.md) for the full API documentation covering all 27 endpoints.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `/setup` shows red indicators | Check that `DATABASE_URL` and `ANTHROPIC_API_KEY` are set correctly in your environment |
| "Unauthorized" on all pages | Verify `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set; clear cookies and re-login |
| PDF upload fails | File must be under 3.5 MB; check that `pdf-parse` is installed (`npm install`) |
| Chat returns no context | Upload and index documents first; if using vector search, set `OPENAI_API_KEY` |
| Embeddings not generated | `OPENAI_API_KEY` is optional — without it, search falls back to PostgreSQL full-text search |
| Build fails on missing env vars | Set stub values for `ANTHROPIC_API_KEY`, `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` during build |
| Rate limit errors (429) | Wait and retry; limits are 30 req/min for chat, 10 req/min for uploads and extraction |

---

## Tech stack

Next.js 15 · TypeScript · Tailwind CSS · Vercel AI SDK · Claude Sonnet · Neon Postgres · PostgreSQL FTS + pgvector · NextAuth

## License

[MIT](LICENSE)
