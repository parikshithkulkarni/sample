import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { DEADLINE_CONTEXT_PROMPT } from '@/lib/prompts';

export const maxDuration = 60;

const anthropic = new Anthropic();

// POST /api/deadlines/[id]/enrich — generate AI context for a deadline
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  // 1. Fetch the deadline
  const [deadline] = await sql`SELECT * FROM deadlines WHERE id = ${id}`;
  if (!deadline) {
    return Response.json({ error: 'Deadline not found' }, { status: 404 });
  }

  // 2. Fetch financial context
  const [accounts, taxReturns, properties] = await Promise.all([
    sql`SELECT name, type, category, balance, currency FROM accounts ORDER BY name`,
    sql`SELECT tax_year, country, data FROM tax_returns ORDER BY tax_year DESC LIMIT 4`,
    sql`SELECT address, market_value, mortgage_balance FROM properties ORDER BY address`,
  ]);

  // 3. Build context string
  const dl = deadline as Record<string, unknown>;
  const financialContext = [
    '--- Accounts ---',
    ...(accounts as { name: string; type: string; category: string; balance: number; currency: string }[]).map(
      (a) => `${a.name} (${a.type}/${a.category}): ${a.currency} ${a.balance}`,
    ),
    '',
    '--- Recent Tax Returns ---',
    ...(taxReturns as { tax_year: number; country: string; data: unknown }[]).map(
      (t) => `${t.tax_year} (${t.country}): ${JSON.stringify(t.data)}`,
    ),
    '',
    '--- Properties ---',
    ...(properties as { address: string; market_value: number; mortgage_balance: number }[]).map(
      (p) => `${p.address}: market value $${p.market_value}, mortgage $${p.mortgage_balance}`,
    ),
  ].join('\n');

  const userMessage = `Deadline: ${dl.title}
Due date: ${dl.due_date}
Category: ${dl.category}
Notes: ${dl.notes ?? 'None'}

Financial context:
${financialContext}`;

  try {
    // 4. Call Claude
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: DEADLINE_CONTEXT_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const aiContext = (msg.content[0] as { type: string; text: string }).text.trim();

    // 5. Store result in deadlines.ai_context column
    const [updated] = await sql`
      UPDATE deadlines
      SET ai_context = ${aiContext}
      WHERE id = ${id}
      RETURNING *
    `;

    // 6. Return the updated deadline
    return Response.json(updated);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
