import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function extractAndInsert(documentId: string): Promise<{ accounts: string[]; properties: string[] }> {
  const chunks = await sql`
    SELECT content FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index LIMIT 20
  `;
  if ((chunks as unknown[]).length === 0) return { accounts: [], properties: [] };

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${documentId}`;
  const text = (chunks as { content: string }[]).map(c => c.content).join('\n').slice(0, 12000);

  const prompt = `You are a financial data extractor. Analyze this document and extract structured data.

Document: ${(docRow as { name: string }).name}
---
${text}
---

Extract ALL of the following that you can find. Return ONLY valid JSON, no explanation:

{
  "accounts": [
    {
      "name": "account name (e.g. Chase Checking, Vanguard 401k, Mortgage)",
      "type": "asset" or "liability",
      "category": "one of: checking, savings, investment, retirement, crypto, real_estate, vehicle, other_asset, credit_card, mortgage, loan, other_liability",
      "balance": number (positive, in USD or convert to USD),
      "currency": "USD",
      "notes": "optional context"
    }
  ],
  "properties": [
    {
      "address": "full address",
      "purchase_price": number or null,
      "purchase_date": "YYYY-MM-DD" or null,
      "market_value": number or null,
      "mortgage_balance": number or null,
      "notes": "optional"
    }
  ]
}

Rules:
- Only include items you have clear evidence for in the document
- If nothing relevant found, return {"accounts":[],"properties":[]}
- Balances must be numbers (no $ signs, no commas)
- Convert all amounts to USD if possible`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text.trim();
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
}
