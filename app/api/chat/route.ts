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

type AccountRow = { name: string; type: string; category: string; balance: number; currency: string; notes: string | null };
type PropertyRow = { address: string; purchase_price: number | null; market_value: number | null; mortgage_balance: number | null; notes: string | null };
type DeadlineRow = { title: string; due_date: string; category: string };
type RentalRow = { address: string; year: number; total_rent: number; total_mortgage: number; total_expenses: number };

function fmtNum(n: number | null, currency = 'USD') {
  if (n == null) return 'unknown';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

async function buildLiveContext(): Promise<string> {
  try {
    const [accountsData, propertiesData, deadlinesData, rentalData] = await Promise.all([
      sql`SELECT name, type, category, balance, currency, notes FROM accounts ORDER BY type, category, name`,
      sql`SELECT address, purchase_price, market_value, mortgage_balance, notes FROM properties ORDER BY address`,
      sql`SELECT title, due_date, category FROM deadlines WHERE NOT is_done AND due_date >= CURRENT_DATE - INTERVAL '7 days' ORDER BY due_date LIMIT 10`,
      sql`
        SELECT p.address, rr.year,
          SUM(rr.rent_collected)::numeric AS total_rent,
          SUM(rr.mortgage_pmt)::numeric   AS total_mortgage,
          SUM((
            SELECT COALESCE(SUM(v::numeric), 0)
            FROM jsonb_each_text(rr.expenses) AS e(k,v)
          ))::numeric AS total_expenses
        FROM rental_records rr
        JOIN properties p ON p.id = rr.property_id
        WHERE rr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
        GROUP BY p.address, rr.year
        ORDER BY p.address
      `,
    ]);

    const accounts = accountsData as AccountRow[];
    const properties = propertiesData as PropertyRow[];
    const deadlines = deadlinesData as DeadlineRow[];
    const rentals = rentalData as RentalRow[];

    if (accounts.length === 0 && properties.length === 0 && deadlines.length === 0) return '';

    const assets = accounts.filter((a) => a.type === 'asset');
    const liabilities = accounts.filter((a) => a.type === 'liability');
    const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + Number(a.balance), 0);
    const netWorth = totalAssets - totalLiabilities;

    const lines: string[] = [
      '## Your Live Financial Dashboard\n',
      `**Net Worth: ${fmtNum(netWorth)}** (Assets: ${fmtNum(totalAssets)} — Liabilities: ${fmtNum(totalLiabilities)})\n`,
    ];

    if (assets.length > 0) {
      lines.push('**Assets:**');
      for (const a of assets) {
        lines.push(`- ${a.name} [${a.category}]: ${fmtNum(Number(a.balance), a.currency)}${a.notes ? ` — ${a.notes}` : ''}`);
      }
      lines.push('');
    }

    if (liabilities.length > 0) {
      lines.push('**Liabilities:**');
      for (const a of liabilities) {
        lines.push(`- ${a.name} [${a.category}]: ${fmtNum(Number(a.balance), a.currency)}${a.notes ? ` — ${a.notes}` : ''}`);
      }
      lines.push('');
    }

    if (properties.length > 0) {
      lines.push('**Rental Properties:**');
      for (const p of properties) {
        const equity = p.market_value && p.mortgage_balance
          ? Number(p.market_value) - Number(p.mortgage_balance)
          : null;
        const rental = rentals.find((r) => r.address === p.address);
        let line = `- ${p.address}: Market ${fmtNum(p.market_value)}, Mortgage ${fmtNum(p.mortgage_balance)}, Equity ${fmtNum(equity)}`;
        if (rental) {
          const noi = Number(rental.total_rent) - Number(rental.total_expenses);
          line += `, ${new Date().getFullYear()} Rent ${fmtNum(Number(rental.total_rent))}, NOI ${fmtNum(noi)}`;
        }
        lines.push(line);
      }
      lines.push('');
    }

    if (deadlines.length > 0) {
      lines.push('**Upcoming Deadlines:**');
      for (const d of deadlines) {
        const days = daysUntil(d.due_date);
        const label = days < 0 ? `OVERDUE by ${Math.abs(days)}d` : days === 0 ? 'TODAY' : `in ${days}d`;
        lines.push(`- ${d.title} (${d.category.replace('_', ' ')}): ${d.due_date} — ${label}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { messages } = await req.json();
  const lastUser = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
  const query: string = lastUser?.content ?? '';

  // Run doc search and live DB context in parallel
  const [chunks, liveContext] = await Promise.all([
    searchChunks(query, 12).catch(() => []),
    buildLiveContext(),
  ]);

  const docContext = formatContext(chunks);

  const systemWithContext = [
    SYSTEM_PROMPT,
    liveContext ? `\n\n${liveContext}` : '',
    docContext ? `\n\n${docContext}` : '',
  ].join('');

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: systemWithContext,
    messages,
    tools: {
      searchWeb: tool({
        description:
          'Search the internet for current information such as recent tax law changes, visa processing times, real estate market rates, court decisions, or any topic that may have changed recently.',
        parameters: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query: q }) => {
          const results = await webSearch(q, 5);
          return formatWebResults(results);
        },
      }),
    },
    maxSteps: 4,
  });

  return result.toDataStreamResponse();
}
