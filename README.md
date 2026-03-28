# Second Brain — AI Personal Knowledge System

Your private, mobile-first AI dashboard. Upload documents, ask questions across everything you've stored, track finances, model tax scenarios, and manage deadlines — all from your phone.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/parikshithkulkarni/sample&env=ANTHROPIC_API_KEY,VOYAGE_API_KEY,DATABASE_URL,NEXTAUTH_SECRET,ADMIN_USERNAME,ADMIN_PASSWORD,TAVILY_API_KEY&envDescription=API%20keys%20and%20config%20for%20Second%20Brain&envLink=https://github.com/parikshithkulkarni/sample/blob/master/.env.example&project-name=second-brain&repository-name=second-brain)

---

## One-click deploy

1. Click **Deploy with Vercel** above
2. Fill in the 7 environment variables (see below)
3. Done — visit your Vercel URL from your phone

After deploying, visit `https://your-app.vercel.app/setup` to verify everything is configured.

---

## Environment variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `VOYAGE_API_KEY` | [dash.voyageai.com](https://dash.voyageai.com) — free tier |
| `DATABASE_URL` | [neon.tech](https://neon.tech) — free Postgres. Enable the **vector** extension in Settings → Extensions |
| `NEXTAUTH_SECRET` | Any random string — `openssl rand -base64 32` |
| `ADMIN_USERNAME` | Your login username |
| `ADMIN_PASSWORD` | Your login password |
| `TAVILY_API_KEY` | [tavily.com](https://tavily.com) — free 1000 searches/month, enables web search in chat |

> **Database setup is fully automatic.** Tables and indexes are created on first startup — no SQL to run.

---

## Features

- **Chat** — RAG over your documents + live web search (Tavily), streaming replies
- **Knowledge Base** — Upload PDFs, markdown, text files; auto-generated AI summaries
- **Quick Capture** — Floating + button → jot a note from anywhere, instantly searchable
- **Tax Scenarios** — ISO exercise, RNOR window, capital gains, rental income modeler
- **Finance** — Net worth tracker (assets + liabilities)
- **Rentals** — Property portfolio, monthly P&L, cap rate, cashflow
- **Deadlines** — US/India tax dates pre-loaded, add custom milestones

---

## Tech stack

Next.js 15 · TypeScript · Tailwind CSS · Vercel AI SDK · Claude claude-sonnet-4-6 · Neon pgvector · Voyage AI · NextAuth
