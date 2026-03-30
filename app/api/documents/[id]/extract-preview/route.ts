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

  const prompt = `You are filling in a personal finance dashboard from a document. Extract EVERYTHING financially useful — be aggressive.

## Finance page — Accounts
Each account has:
- name: descriptive string, e.g. "Chase Checking", "Fidelity 401k", "2024 Federal Tax Withheld"
- type: exactly "asset" or "liability"
- category: descriptive snake_case string. Examples:
    Assets: 401k, roth_ira, brokerage, rsu, espp, nso_options, iso_options, real_estate, savings, checking, money_market, cd, treasury, bond, crypto, hsa, 529_plan, life_insurance, annuity, pension, startup_equity, angel_investment, business_interest, commodity, collectibles, employment_income, tax_prepayment, other
    Liabilities: mortgage, heloc, auto_loan, credit_card, student_loan, personal_loan, tax_liability, margin_loan, other
    Invent descriptive snake_case names for anything not listed.
- balance: number (USD, positive)
- currency: "USD"
- notes: short context string

## Rentals page — Properties
Each property has:
- address: full street address
- purchase_price, market_value, mortgage_balance, monthly_rent: number or null
- purchase_date: "YYYY-MM-DD" or null
- notes: optional

## Tax & Income Documents (W-2, 1099, pay stubs, K-1, Schedule K, etc.)
These contain VERY useful data — extract all of it:
- W-2 Box 1 wages → { name: "[Year] Wages - [Employer Name]", type: "asset", category: "employment_income", balance: <wages>, notes: "Gross wages per W-2" }
- W-2 Box 2 federal tax withheld → { name: "[Year] Federal Tax Withheld", type: "asset", category: "tax_prepayment", balance: <amount>, notes: "Federal income tax withheld" }
- W-2 Box 12 Code D (traditional 401k) → { name: "[Employer] 401k", type: "asset", category: "401k", balance: <contribution>, notes: "401k contribution per W-2 Box 12D" }
- W-2 Box 12 Code S (SIMPLE IRA) → category: "simple_ira"
- W-2 Box 12 Code W (HSA employer) → { name: "HSA", type: "asset", category: "hsa", balance: <amount> }
- W-2 Box 12 Code V (ISO exercise income) → category: "iso_options"
- W-2 Box 17 state tax withheld → { name: "[Year] [State] Tax Withheld", type: "asset", category: "tax_prepayment" }
- 1099-INT: interest income → { name: "[Bank] Interest Income [Year]", type: "asset", category: "interest_income" }
- 1099-DIV: dividends → { name: "[Broker] Dividends [Year]", type: "asset", category: "dividend_income" }
- 1099-B: realized gains from brokerage → extract brokerage account if identifiable
- 1099-R: retirement distributions → category: "retirement_distribution"
- 1099-NEC/MISC: self-employment income → category: "self_employment_income"
- K-1: partnership/S-corp income → category: "business_interest" or "partnership_income"
- Pay stub: gross pay → category: "employment_income"; 401k deduction → category: "401k"

## Already in system (skip exact duplicates):
Accounts: ${existingAccountsList}
Properties: ${existingPropertiesList}

## Document: "${docName}"
---
${text}
---

Extract every financial item visible. Be aggressive — partial data is fine, use null for unknowns.
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
    // Anchor on the known top-level key to avoid matching embedded JSON in document content
    const start = text.indexOf('{"accounts"');
    const end = start !== -1 ? text.lastIndexOf('}') : -1;
    if (start === -1 || end === -1) throw new Error('No JSON object found in response');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), accounts: [], properties: [] }, { status: 500 });
  }
}
