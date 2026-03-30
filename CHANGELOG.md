# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2025-01-01

### Added

- **Chat** — AI-powered Q&A across all uploaded documents with streaming replies, citations, and tool-calling (save/delete dashboard items)
- **Knowledge Base** — upload PDFs, markdown, and text files; AI generates summaries and insights; hybrid search (PostgreSQL FTS + vector embeddings)
- **Quick Capture** — floating button for instant note-taking, saved and searchable immediately
- **Finance** — net worth tracker with asset and liability accounts, deduplication, merge, daily snapshots
- **Rentals** — property portfolio management with monthly P&L records, cap rate, cashflow, and NOI calculations
- **Tax Scenarios** — ISO exercise, RNOR window, capital gains, and rental income modeling with streaming AI analysis
- **Tax Returns** — US and India tax return tracking with auto-sync from accounts and rental records, 2019-2025 bracket tables
- **Deadlines** — pre-loaded US and India tax dates with custom deadline support
- **Audit Dashboard** — data quality analysis with one-click fix for duplicates, junk accounts, and invalid dates
- **Authentication** — NextAuth with scrypt password hashing, JWT sessions, security headers (HSTS, CSP, X-Frame-Options)
- **Auto-setup** — database schema created on first startup, tax deadlines seeded, NEXTAUTH_SECRET auto-derived
- **One-click deploy** — Vercel deployment with automatic Postgres provisioning
