import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { DASHBOARD_INSIGHTS_PROMPT } from '@/lib/prompts';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

const anthropic = new Anthropic();

type AccountRow  = { name: string; type: string; category: string; balance: number; currency: string; notes: string | null };
type PropertyRow = { address: string; purchase_price: number | null; market_value: number | null; mortgage_balance: number | null; notes: string | null };
type DeadlineRow = { title: string; due_date: string; category: string; notes: string | null };
type RentalRow   = { address: string; total_rent: number; total_expenses: number };
type TaxReturnRow = { tax_year: number; country: string; data: Record<string, unknown> };

function fmtNum(n: number | null, currency = 'USD') {
  if (n == null) return 'unknown';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000);
}

async function buildFinancialContext(): Promise<string> {
  const [accountsData, propertiesData, deadlinesData, rentalData, taxReturnsData] = await Promise.all([
    sql`SELECT name, type, category, balance, currency, notes FROM accounts ORDER BY type, category, name`,
    sql`SELECT address, purchase_price, market_value, mortgage_balance, notes FROM properties ORDER BY address`,
    sql`SELECT title, due_date, category, notes FROM deadlines WHERE NOT is_done AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' ORDER BY due_date`,
    sql`
      SELECT p.address,
        SUM(rr.rent_collected)::numeric  AS total_rent,
        SUM((SELECT COALESCE(SUM(v::numeric),0) FROM jsonb_each_text(rr.expenses) AS e(k,v)))::numeric AS total_expenses
      FROM rental_records rr
      JOIN properties p ON p.id = rr.property_id
      WHERE rr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
      GROUP BY p.address ORDER BY p.address
    `,
    sql`SELECT tax_year, country, data FROM tax_returns ORDER BY tax_year DESC LIMIT 4`,
  ]);

  const accounts   = accountsData   as AccountRow[];
  const properties = propertiesData as PropertyRow[];
  const deadlines  = deadlinesData  as DeadlineRow[];
  const rentals    = rentalData     as RentalRow[];
  const taxReturns = taxReturnsData as TaxReturnRow[];

  const lines: string[] = [];

  // Net worth summary
  const assets      = accounts.filter((a) => a.type === 'asset');
  const liabilities = accounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabs  = liabilities.reduce((s, a) => s + Number(a.balance), 0);

  if (accounts.length > 0) {
    lines.push(`## Net Worth: ${fmtNum(totalAssets - totalLiabs)} (Assets: ${fmtNum(totalAssets)}, Liabilities: ${fmtNum(totalLiabs)})\n`);
    lines.push('### Accounts:');
    accounts.forEach((a) => {
      lines.push(`- ${a.name} [${a.type}/${a.category}]: ${fmtNum(Number(a.balance), a.currency)}${a.notes ? ` — ${a.notes}` : ''}`);
    });
    lines.push('');
  }

  if (properties.length > 0) {
    lines.push('### Properties:');
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
    lines.push('### Upcoming Deadlines (next 30 days):');
    deadlines.forEach((d) => {
      const days  = daysUntil(d.due_date);
      const label = days === 0 ? 'TODAY' : `in ${days} days`;
      lines.push(`- ${d.title} (${d.category.replace('_', ' ')}): ${d.due_date} — ${label}${d.notes ? ` — ${d.notes}` : ''}`);
    });
    lines.push('');
  }

  if (taxReturns.length > 0) {
    lines.push('### Recent Tax Returns:');
    taxReturns.forEach((tr) => {
      lines.push(`- ${tr.tax_year} (${tr.country}): ${JSON.stringify(tr.data)}`);
    });
    lines.push('');
  }

  if (lines.length === 0) {
    return 'No financial data found. The user has not added any accounts, properties, deadlines, or tax returns yet.';
  }

  return lines.join('\n');
}

interface Insight {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

interface NextAction {
  title: string;
  description: string;
}

interface InsightsResponse {
  insights: Insight[];
  next_actions: NextAction[];
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const context = await buildFinancialContext();

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: DASHBOARD_INSIGHTS_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here is the user's current financial data:\n\n${context}\n\n---\n\nRespond with ONLY valid JSON, no markdown fences.`,
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let parsed: InsightsResponse;
    try {
      parsed = JSON.parse(text) as InsightsResponse;
    } catch {
      // If Claude returned markdown-fenced JSON, extract it
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]) as InsightsResponse;
      } else {
        return Response.json(
          { error: 'Failed to parse AI response' },
          { status: 502 },
        );
      }
    }

    // Validate structure
    const insights = Array.isArray(parsed.insights)
      ? parsed.insights.slice(0, 10).map((i) => ({
          title: String(i.title ?? ''),
          description: String(i.description ?? ''),
          priority: ['high', 'medium', 'low'].includes(i.priority) ? i.priority : 'medium',
          category: String(i.category ?? 'general'),
        }))
      : [];

    const next_actions = Array.isArray(parsed.next_actions)
      ? parsed.next_actions.slice(0, 5).map((a) => ({
          title: String(a.title ?? ''),
          description: String(a.description ?? ''),
        }))
      : [];

    return Response.json({ insights, next_actions });
  } catch (err) {
    logger.error('Insights API error:', err);
    return Response.json(
      { error: 'Failed to generate insights' },
      { status: 500 },
    );
  }
}
