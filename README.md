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

## What's automatic (nothing to configure)

| | |
|---|---|
| Database schema | Created on first startup |
| Tax deadlines | 7 US + India dates pre-loaded |
| `NEXTAUTH_SECRET` | Derived from your password |
| `NEXTAUTH_URL` | Set by Vercel to your deployment URL |
| Redeployments | Every push to GitHub auto-deploys |

## Tech stack

Next.js 15 · TypeScript · Tailwind CSS · Vercel AI SDK · Claude claude-sonnet-4-6 · Vercel Postgres · PostgreSQL FTS · NextAuth
