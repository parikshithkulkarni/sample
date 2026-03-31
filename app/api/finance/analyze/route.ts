import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { ANOMALY_DETECTION_PROMPT } from '@/lib/prompts';

export const maxDuration = 60;

const anthropic = new Anthropic();

// POST /api/finance/analyze — AI anomaly detection
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  // 1. Fetch all financial data
  const [accounts, snapshots, properties, rentalRecords] = await Promise.all([
    sql`SELECT id, name, type, category, balance, currency, notes, updated_at FROM accounts ORDER BY name`,
    sql`SELECT snapshot_date, total_assets, total_liabs, net_worth FROM net_worth_snapshots ORDER BY snapshot_date DESC LIMIT 12`,
    sql`SELECT id, address, market_value, mortgage_balance FROM properties ORDER BY address`,
    sql`SELECT property_id, year, month, rent_collected, expenses, notes FROM rental_records ORDER BY year DESC, month DESC LIMIT 60`,
  ]);

  // 2. Build context string
  const contextParts = [
    '--- Accounts ---',
    ...(accounts as { id: string; name: string; type: string; category: string; balance: number; currency: string; notes: string | null; updated_at: string }[]).map(
      (a) => `[${a.id}] ${a.name} (${a.type}/${a.category}): ${a.currency} ${a.balance} — updated: ${a.updated_at}${a.notes ? ` — notes: ${a.notes}` : ''}`,
    ),
    '',
    '--- Net Worth Snapshots (last 12) ---',
    ...(snapshots as { snapshot_date: string; total_assets: number; total_liabs: number; net_worth: number }[]).map(
      (s) => `${s.snapshot_date}: assets=$${s.total_assets}, liabilities=$${s.total_liabs}, net_worth=$${s.net_worth}`,
    ),
    '',
    '--- Properties ---',
    ...(properties as { id: string; address: string; market_value: number; mortgage_balance: number }[]).map(
      (p) => `[${p.id}] ${p.address}: market=$${p.market_value}, mortgage=$${p.mortgage_balance}`,
    ),
    '',
    '--- Rental Records (recent) ---',
    ...(rentalRecords as { property_id: string; year: number; month: number; rent_collected: number; expenses: Record<string, number>; notes: string | null }[]).map(
      (r) => `property=${r.property_id} ${r.year}/${r.month}: collected=$${r.rent_collected}, expenses=${JSON.stringify(r.expenses)}${r.notes ? ` — ${r.notes}` : ''}`,
    ),
  ].join('\n');

  try {
    // 3. Send to Claude
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: ANOMALY_DETECTION_PROMPT,
      messages: [{ role: 'user', content: `Analyze this financial data:\n\n${contextParts}` }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    // Strip markdown fences if present
    const jsonStr = raw.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');

    // 4. Parse JSON response
    const parsed = JSON.parse(jsonStr) as {
      findings?: { title: string; description: string; severity: string; category: string }[];
    };

    // 5. Validate and return findings
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.map((f) => ({
          title: String(f.title ?? ''),
          description: String(f.description ?? ''),
          severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium',
          category: String(f.category ?? 'general'),
        }))
      : [];

    return Response.json({ findings });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);

    // If JSON parsing failed, return a structured error
    if (errMsg.includes('JSON')) {
      return Response.json(
        { error: 'Failed to parse AI response', details: errMsg },
        { status: 502 },
      );
    }

    return Response.json({ error: errMsg }, { status: 500 });
  }
}
