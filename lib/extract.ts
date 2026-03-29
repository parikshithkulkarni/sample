import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function extractAndInsert(documentId: string): Promise<{ accounts: string[]; properties: string[] }> {
  // Sample chunks spread across the whole document, not just the start
  const allChunks = await sql`
    SELECT content, chunk_index FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index
  `;
  if ((allChunks as unknown[]).length === 0) return { accounts: [], properties: [] };

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${documentId}`;
  const docName = (docRow as { name: string }).name;

  // Take evenly-spaced samples across the full document (up to ~24000 chars)
  const rows = allChunks as { content: string; chunk_index: number }[];
  const step = Math.max(1, Math.floor(rows.length / 30));
  const sampled = rows.filter((_, i) => i % step === 0).slice(0, 30);
  const text = sampled.map(r => r.content).join('\n\n').slice(0, 24000);

  const prompt = `You are an expert financial data extractor helping build a personal finance dashboard.

Document name: "${docName}"
Document content:
---
${text}
---

Your job: extract ANY financial information from this document, even if partial or implied.

BE AGGRESSIVE — extract everything you can reasonably infer. Examples of what to look for:
- Bank/brokerage account names + balances (checking, savings, investment, retirement, 401k, IRA, HSA)
- Credit card names + balances owed
- Loan/mortgage balances
- Property addresses + values
- Stock/crypto holdings (use current value if given, else cost basis)
- Any dollar amounts associated with named accounts or institutions

Return ONLY this JSON (no markdown, no explanation):
{
  "accounts": [
    {
      "name": "Institution + Account type (e.g. Chase Checking, Fidelity 401k, Amex Platinum)",
      "type": "asset" or "liability",
      "category": "checking" | "savings" | "investment" | "retirement" | "crypto" | "real_estate" | "vehicle" | "other_asset" | "credit_card" | "mortgage" | "loan" | "other_liability",
      "balance": 12345.67,
      "currency": "USD",
      "notes": "brief context if useful"
    }
  ],
  "properties": [
    {
      "address": "123 Main St, City, State ZIP",
      "purchase_price": 450000,
      "purchase_date": "2019-06-15",
      "market_value": 620000,
      "mortgage_balance": 310000,
      "notes": "optional"
    }
  ]
}

If truly nothing financial is in this document, return: {"accounts":[],"properties":[]}
All numbers must be plain numbers (no $, no commas). Liabilities (credit cards, loans, mortgages) have type "liability".`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(raw) as {
      accounts: { name: string; type: string; category: string; balance: number; currency: string; notes?: string }[];
      properties: { address: string; purchase_price?: number; purchase_date?: string; market_value?: number; mortgage_balance?: number; notes?: string }[];
    };

    const insertedAccounts: string[] = [];
    const insertedProperties: string[] = [];

    for (const acct of parsed.accounts ?? []) {
      if (!acct.name || !acct.type || !acct.category) continue;
      const existing = await sql`SELECT id FROM accounts WHERE lower(name) = lower(${acct.name})`;
      if ((existing as unknown[]).length > 0) continue;
      await sql`
        INSERT INTO accounts (name, type, category, balance, currency, notes)
        VALUES (${acct.name}, ${acct.type}, ${acct.category}, ${acct.balance ?? 0}, ${acct.currency ?? 'USD'}, ${acct.notes ?? null})
      `;
      insertedAccounts.push(acct.name);
    }

    for (const prop of parsed.properties ?? []) {
      if (!prop.address) continue;
      const existing = await sql`SELECT id FROM properties WHERE lower(address) = lower(${prop.address})`;
      if ((existing as unknown[]).length > 0) continue;
      await sql`
        INSERT INTO properties (address, purchase_price, purchase_date, market_value, mortgage_balance, notes)
        VALUES (${prop.address}, ${prop.purchase_price ?? null}, ${prop.purchase_date ?? null}, ${prop.market_value ?? null}, ${prop.mortgage_balance ?? null}, ${prop.notes ?? null})
      `;
      insertedProperties.push(prop.address);
    }

    return { accounts: insertedAccounts, properties: insertedProperties };
  } catch {
    return { accounts: [], properties: [] };
  }
}
