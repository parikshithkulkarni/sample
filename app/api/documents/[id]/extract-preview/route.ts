import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic();

// POST /api/documents/[id]/extract-preview
// Same as extract but returns Claude's raw output WITHOUT writing to DB
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const allChunks = await sql`SELECT content FROM chunks WHERE document_id = ${id} ORDER BY chunk_index`;
  if ((allChunks as unknown[]).length === 0) return Response.json({ accounts: [], properties: [] });

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${id}`;
  const docName = (docRow as { name: string }).name;
  const text = (allChunks as { content: string }[]).map(c => c.content).join('\n\n');

  const existingAccounts = await sql`SELECT name, type, category, balance, currency FROM accounts ORDER BY name`;
  const existingProperties = await sql`SELECT address FROM properties ORDER BY address`;

  const existingAccountsList = (existingAccounts as { name: string; type: string; category: string; balance: number; currency: string }[])
    .map(a => `  - "${a.name}" (${a.type}, ${a.category}, balance: ${a.balance})`)
    .join('\n') || '  (none yet)';

  const existingPropertiesList = (existingProperties as { address: string }[])
    .map(p => `  - "${p.address}"`)
    .join('\n') || '  (none yet)';

  const prompt = `You are filling in a personal finance dashboard from a document.

## Finance page — Accounts
Each account has:
- name: e.g. "Chase Checking", "Fidelity 401k", "Amex Gold"
- type: exactly "asset" or "liability"
- category: descriptive snake_case string matching the account type. Examples:
    Assets: 401k, roth_ira, brokerage, rsu, espp, nso_options, iso_options, real_estate, savings, checking, money_market, cd, treasury, bond, crypto, hsa, 529_plan, life_insurance, annuity, pension, startup_equity, angel_investment, business_interest, commodity, collectibles, other
    Liabilities: mortgage, heloc, auto_loan, credit_card, student_loan, personal_loan, tax_liability, margin_loan, other
    Use the most specific fit; invent descriptive snake_case names for anything not listed.
- balance: number (USD)
- currency: "USD"
- notes: optional

## Rentals page — Properties
Each property has:
- address: full street address
- purchase_price: number or null
- purchase_date: "YYYY-MM-DD" or null
- market_value: number or null
- mortgage_balance: number or null
- monthly_rent: number or null (monthly rent income if mentioned)
- notes: optional

## Already in system (skip exact duplicates):
Accounts: ${existingAccountsList}
Properties: ${existingPropertiesList}

## Document: "${docName}"
---
${text}
---

Extract every financial item. Be aggressive — partial data is fine.
ALL numbers: plain JSON numbers only. No $, no commas, no quotes around numbers.
CORRECT: 450000   WRONG: "450,000" or "$450k"

Return ONLY valid JSON:
{"accounts":[{"name":"...","type":"asset","category":"checking","balance":1234,"currency":"USD","notes":""}],"properties":[{"address":"...","purchase_price":null,"purchase_date":null,"market_value":null,"mortgage_balance":null,"monthly_rent":null,"notes":""}]}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text;
    // Extract the JSON object even if Claude prefixes with prose
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in response');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), accounts: [], properties: [] }, { status: 500 });
  }
}
