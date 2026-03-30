import { streamText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { searchChunks, formatContext } from '@/lib/retrieval';
import { webSearch, formatWebResults } from '@/lib/web-search';
import { SYSTEM_PROMPT } from '@/lib/prompts';
import { sql } from '@/lib/db';

export const maxDuration = 60;
export const runtime = 'nodejs'; // keep alive for background message saving

type AccountRow  = { name: string; type: string; category: string; balance: number; currency: string; notes: string | null };
type PropertyRow = { address: string; purchase_price: number | null; market_value: number | null; mortgage_balance: number | null; notes: string | null };
type DeadlineRow = { title: string; due_date: string; category: string };
type RentalRow   = { address: string; total_rent: number; total_expenses: number };

function fmtNum(n: number | null, currency = 'USD') {
  if (n == null) return 'unknown';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000);
}

async function buildLiveContext(): Promise<string> {
  try {
    const [accountsData, propertiesData, deadlinesData, rentalData] = await Promise.all([
      sql`SELECT name, type, category, balance, currency, notes FROM accounts ORDER BY type, category, name`,
      sql`SELECT address, purchase_price, market_value, mortgage_balance, notes FROM properties ORDER BY address`,
      sql`SELECT title, due_date, category FROM deadlines WHERE NOT is_done AND due_date >= CURRENT_DATE - INTERVAL '7 days' ORDER BY due_date LIMIT 10`,
      sql`
        SELECT p.address,
          SUM(rr.rent_collected)::numeric  AS total_rent,
          SUM((SELECT COALESCE(SUM(v::numeric),0) FROM jsonb_each_text(rr.expenses) AS e(k,v)))::numeric AS total_expenses
        FROM rental_records rr
        JOIN properties p ON p.id = rr.property_id
        WHERE rr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
        GROUP BY p.address ORDER BY p.address
      `,
    ]);

    const accounts   = accountsData   as AccountRow[];
    const properties = propertiesData as PropertyRow[];
    const deadlines  = deadlinesData  as DeadlineRow[];
    const rentals    = rentalData     as RentalRow[];

    if (accounts.length === 0 && properties.length === 0 && deadlines.length === 0) return '';

    const assets      = accounts.filter((a) => a.type === 'asset');
    const liabilities = accounts.filter((a) => a.type === 'liability');
    const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
    const totalLiabs  = liabilities.reduce((s, a) => s + Number(a.balance), 0);

    const lines: string[] = [
      '## Your Live Financial Dashboard\n',
      `**Net Worth: ${fmtNum(totalAssets - totalLiabs)}** (Assets: ${fmtNum(totalAssets)} — Liabilities: ${fmtNum(totalLiabs)})\n`,
    ];
    if (assets.length > 0) {
      lines.push('**Assets:**');
      assets.forEach((a) => lines.push(`- ${a.name} [${a.category}]: ${fmtNum(Number(a.balance), a.currency)}${a.notes ? ` — ${a.notes}` : ''}`));
      lines.push('');
    }
    if (liabilities.length > 0) {
      lines.push('**Liabilities:**');
      liabilities.forEach((a) => lines.push(`- ${a.name} [${a.category}]: ${fmtNum(Number(a.balance), a.currency)}${a.notes ? ` — ${a.notes}` : ''}`));
      lines.push('');
    }
    if (properties.length > 0) {
      lines.push('**Rental Properties:**');
      properties.forEach((p) => {
        const equity = p.market_value && p.mortgage_balance ? Number(p.market_value) - Number(p.mortgage_balance) : null;
        const rental = rentals.find((r) => r.address === p.address);
        const noi    = rental ? Number(rental.total_rent) - Number(rental.total_expenses) : null;
        let line = `- ${p.address}: Market ${fmtNum(p.market_value)}, Mortgage ${fmtNum(p.mortgage_balance)}, Equity ${fmtNum(equity)}`;
        if (noi !== null) line += `, ${new Date().getFullYear()} NOI ${fmtNum(noi)}`;
        lines.push(line);
      });
      lines.push('');
    }
    if (deadlines.length > 0) {
      lines.push('**Upcoming Deadlines:**');
      deadlines.forEach((d) => {
        const days  = daysUntil(d.due_date);
        const label = days < 0 ? `OVERDUE by ${Math.abs(days)}d` : days === 0 ? 'TODAY' : `in ${days}d`;
        lines.push(`- ${d.title} (${d.category.replace('_', ' ')}): ${d.due_date} — ${label}`);
      });
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function loadMentionedDocs(docIds: string[]): Promise<string> {
  if (docIds.length === 0) return '';
  const parts: string[] = [];
  for (const id of docIds) {
    try {
      const [docRow] = await sql`SELECT name FROM documents WHERE id = ${id}` as { name: string }[];
      if (!docRow) continue;
      const chunks = await sql`SELECT content FROM chunks WHERE document_id = ${id} ORDER BY chunk_index` as { content: string }[];
      parts.push(`## Attached Document: "${docRow.name}"\n${chunks.map((c) => c.content).join('\n\n')}`);
    } catch { /* skip */ }
  }
  return parts.join('\n\n---\n\n');
}

// ── Dashboard tools ───────────────────────────────────────────────────────────
async function saveAccounts(accounts: { name: string; type: string; category: string; balance: number; currency?: string; notes?: string }[]) {
  const saved: string[] = [];
  for (const acct of accounts) {
    if (!acct.name || !acct.type) continue;
    const category = acct.category ? acct.category.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'other' : 'other';
    const balance  = isNaN(acct.balance) ? 0 : acct.balance;
    const existing = await sql`SELECT id FROM accounts WHERE lower(name) = lower(${acct.name})` as { id: string }[];
    if (existing.length > 0) {
      await sql`UPDATE accounts SET type=${acct.type}, category=${category}, balance=${balance}, currency=${acct.currency ?? 'USD'}, notes=${acct.notes ?? null}, updated_at=NOW() WHERE id=${existing[0].id}`;
      saved.push(`${acct.name} (updated)`);
    } else {
      await sql`INSERT INTO accounts (name,type,category,balance,currency,notes) VALUES (${acct.name},${acct.type},${category},${balance},${acct.currency ?? 'USD'},${acct.notes ?? null})`;
      saved.push(acct.name);
    }
  }
  if (saved.length > 0) {
    const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
    takeNetWorthSnapshot().catch(() => {});
  }
  return saved;
}

async function saveProperties(properties: { address: string; purchase_price?: number | null; purchase_date?: string | null; market_value?: number | null; mortgage_balance?: number | null; notes?: string }[]) {
  const saved: string[] = [];
  for (const prop of properties) {
    if (!prop.address) continue;
    const pp  = prop.purchase_price   != null && !isNaN(prop.purchase_price)   ? prop.purchase_price   : null;
    const mv  = prop.market_value     != null && !isNaN(prop.market_value)     ? prop.market_value     : null;
    const mb  = prop.mortgage_balance != null && !isNaN(prop.mortgage_balance) ? prop.mortgage_balance : null;
    const existing = await sql`SELECT id FROM properties WHERE lower(address) = lower(${prop.address})` as { id: string }[];
    if (existing.length > 0) {
      await sql`UPDATE properties SET purchase_price=${pp}, purchase_date=${prop.purchase_date ?? null}, market_value=${mv}, mortgage_balance=${mb}, notes=${prop.notes ?? null} WHERE id=${existing[0].id}`;
      saved.push(`${prop.address} (updated)`);
    } else {
      await sql`INSERT INTO properties (address,purchase_price,purchase_date,market_value,mortgage_balance,notes) VALUES (${prop.address},${pp},${prop.purchase_date ?? null},${mv},${mb},${prop.notes ?? null})`;
      saved.push(prop.address);
    }
  }
  return saved;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { messages } = body;
  const data = (body.data ?? {}) as { mentionedDocIds?: string[]; sessionId?: string };
  const mentionedDocIds: string[] = data.mentionedDocIds ?? [];
  const incomingSessionId: string = data.sessionId ?? '';

  const lastUser = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
  const query: string = lastUser?.content ?? '';

  // Resolve or create session
  let resolvedSessionId = incomingSessionId;
  let isNewSession = false;
  try {
    if (!resolvedSessionId) {
      const [newSession] = await sql`
        INSERT INTO chat_sessions (title) VALUES (${query.slice(0, 60) || 'New Chat'})
        RETURNING id
      ` as { id: string }[];
      resolvedSessionId = newSession.id;
      isNewSession = true;
    }
  } catch { /* non-fatal */ }

  // Run all context fetches in parallel
  const [chunks, liveContext, mentionedContext] = await Promise.all([
    searchChunks(query, 12).catch(() => []),
    buildLiveContext(),
    loadMentionedDocs(mentionedDocIds),
  ]);

  const systemWithContext = [
    SYSTEM_PROMPT,
    liveContext      ? `\n\n${liveContext}`     : '',
    mentionedContext ? `\n\n${mentionedContext}` : '',
    formatContext(chunks) ? `\n\n${formatContext(chunks)}` : '',
  ].join('');

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: systemWithContext,
    messages,
    tools: {
      searchWeb: tool({
        description: 'Search the internet for current information such as tax law changes, visa processing times, real estate market rates, or anything that may have changed recently.',
        parameters: z.object({ query: z.string() }),
        execute: async ({ query: q }) => formatWebResults(await webSearch(q, 5)),
      }),

      save_to_dashboard: tool({
        description: 'Save financial accounts or rental properties to the Finance or Rentals page. Use when user says "save this", "add to dashboard", "store in finance", "add to rentals", etc.',
        parameters: z.object({
          accounts: z.array(z.object({
            name:     z.string(),
            type:     z.enum(['asset', 'liability']),
            category: z.string().describe('Asset: 401k|roth_ira|brokerage|rsu|espp|real_estate|savings|checking|crypto|other  Liability: mortgage|auto_loan|credit_card|student_loan|other'),
            balance:  z.number(),
            currency: z.string().default('USD'),
            notes:    z.string().optional(),
          })).optional(),
          properties: z.array(z.object({
            address:          z.string(),
            purchase_price:   z.number().nullable().optional(),
            purchase_date:    z.string().nullable().optional().describe('YYYY-MM-DD'),
            market_value:     z.number().nullable().optional(),
            mortgage_balance: z.number().nullable().optional(),
            notes:            z.string().optional(),
          })).optional(),
        }),
        execute: async ({ accounts, properties }) => {
          const [savedAccts, savedProps] = await Promise.all([
            saveAccounts(accounts ?? []),
            saveProperties(properties ?? []),
          ]);
          const parts: string[] = [];
          if (savedAccts.length > 0) parts.push(`${savedAccts.length} account${savedAccts.length !== 1 ? 's' : ''} saved to Finance: ${savedAccts.join(', ')}`);
          if (savedProps.length > 0) parts.push(`${savedProps.length} propert${savedProps.length !== 1 ? 'ies' : 'y'} saved to Rentals: ${savedProps.join(', ')}`);
          return parts.length > 0 ? `✓ ${parts.join(' · ')}` : 'Nothing new to save.';
        },
      }),

      delete_from_dashboard: tool({
        description: 'Delete accounts or properties from the dashboard. Use when user says "delete", "remove", "get rid of" a specific account or property.',
        parameters: z.object({
          accountNames:      z.array(z.string()).optional().describe('Account names to delete (case-insensitive)'),
          propertyAddresses: z.array(z.string()).optional().describe('Property addresses to delete (case-insensitive)'),
        }),
        execute: async ({ accountNames, propertyAddresses }) => {
          const deleted: string[] = [];
          for (const name of accountNames ?? []) {
            const res = await sql`DELETE FROM accounts WHERE lower(name) = lower(${name}) RETURNING name` as { name: string }[];
            if (res.length > 0) { deleted.push(`account "${res[0].name}"`); }
          }
          for (const addr of propertyAddresses ?? []) {
            const res = await sql`DELETE FROM properties WHERE lower(address) = lower(${addr}) RETURNING address` as { address: string }[];
            if (res.length > 0) { deleted.push(`property "${res[0].address}"`); }
          }
          if (deleted.length > 0) {
            const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
            takeNetWorthSnapshot().catch(() => {});
          }
          return deleted.length > 0
            ? `✓ Deleted: ${deleted.join(', ')}`
            : 'No matching items found. Check the exact name or address.';
        },
      }),
    },
    maxSteps: 5,
  });

  // Save messages to session in background after streaming completes
  if (resolvedSessionId) {
    result.text.then(async (assistantText) => {
      try {
        await sql`
          INSERT INTO chat_messages (session_id, role, content) VALUES
            (${resolvedSessionId}, 'user',      ${lastUser?.content ?? ''}),
            (${resolvedSessionId}, 'assistant', ${assistantText})
        `;
        await sql`
          UPDATE chat_sessions
          SET updated_at = now()
              ${isNewSession ? sql`, title = ${(lastUser?.content ?? 'New Chat').slice(0, 60)}` : sql``}
          WHERE id = ${resolvedSessionId}
        `;
      } catch { /* non-fatal */ }
    }).catch(() => {});
  }

  const streamResponse = result.toDataStreamResponse();
  return new Response(streamResponse.body, {
    status: streamResponse.status,
    headers: {
      ...Object.fromEntries(streamResponse.headers.entries()),
      'X-Session-Id': resolvedSessionId,
    },
  });
}
