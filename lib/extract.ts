import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function extractAndInsert(documentId: string): Promise<{ accounts: string[]; properties: string[] }> {
  // Sample chunks spread evenly across the whole document
  const allChunks = await sql`
    SELECT content, chunk_index FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index
  `;
  if ((allChunks as unknown[]).length === 0) return { accounts: [], properties: [] };

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${documentId}`;
  const docName = (docRow as { name: string }).name;

  // Use the full document — no sampling, no cropping
  const rows = allChunks as { content: string; chunk_index: number }[];
  const text = rows.map(r => r.content).join('\n\n');

  // Fetch what's already in the system so Claude can skip duplicates and understand context
  const existingAccounts = await sql`SELECT name, type, category, balance, currency FROM accounts ORDER BY name`;
  const existingProperties = await sql`SELECT address, market_value, mortgage_balance FROM properties ORDER BY address`;

  const existingAccountsList = (existingAccounts as { name: string; type: string; category: string; balance: number; currency: string }[])
    .map(a => `  - "${a.name}" (${a.type}, ${a.category}, balance: ${a.balance} ${a.currency})`)
    .join('\n') || '  (none yet)';

  const existingPropertiesList = (existingProperties as { address: string; market_value: number | null; mortgage_balance: number | null }[])
    .map(p => `  - "${p.address}"`)
    .join('\n') || '  (none yet)';

  const prompt = `You are filling in a personal finance dashboard from a document. Here is exactly how the dashboard is structured:

## Finance page — Accounts
Each account has these exact fields:
- name: descriptive string, e.g. "Chase Checking", "Fidelity 401k", "Tesla RSUs", "Amex Gold"
- type: MUST be exactly "asset" or "liability"
- category:
    If asset: MUST be one of: 401k | roth_ira | brokerage | rsu | espp | real_estate | savings | checking | crypto | other
    If liability: MUST be one of: mortgage | auto_loan | credit_card | student_loan | other
- balance: positive number in USD (no $ signs, no commas)
- currency: "USD" (or actual currency if foreign)
- notes: optional short string for extra context

## Rentals page — Properties
Each property has these exact fields:
- address: full street address string
- purchase_price: number or null
- purchase_date: "YYYY-MM-DD" string or null
- market_value: current estimated value as number or null
- mortgage_balance: remaining mortgage owed as number or null
- notes: optional string

## Already in the system (DO NOT duplicate these):
Accounts already added:
${existingAccountsList}

Properties already added:
${existingPropertiesList}

## Document to extract from:
Name: "${docName}"
---
${text}
---

Extract every account and property you can find or reasonably infer from this document.
Be aggressive — include partial data (use null for unknown fields).
Skip anything already in the system above.

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "accounts": [
    { "name": "...", "type": "asset"|"liability", "category": "...", "balance": 0, "currency": "USD", "notes": "..." }
  ],
  "properties": [
    { "address": "...", "purchase_price": null, "purchase_date": null, "market_value": null, "mortgage_balance": null, "notes": "" }
  ]
}`;

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

    // Valid category sets matching the frontend exactly
    const assetCategories = new Set(['401k','roth_ira','brokerage','rsu','espp','real_estate','savings','checking','crypto','other']);
    const liabilityCategories = new Set(['mortgage','auto_loan','credit_card','student_loan','other']);

    const insertedAccounts: string[] = [];
    const insertedProperties: string[] = [];

    for (const acct of parsed.accounts ?? []) {
      if (!acct.name || !acct.type || !acct.category) continue;
      const validCats = acct.type === 'asset' ? assetCategories : liabilityCategories;
      const category = validCats.has(acct.category) ? acct.category : 'other';
      const existing = await sql`SELECT id FROM accounts WHERE lower(name) = lower(${acct.name})`;
      if ((existing as unknown[]).length > 0) continue;
      await sql`
        INSERT INTO accounts (name, type, category, balance, currency, notes)
        VALUES (${acct.name}, ${acct.type}, ${category}, ${acct.balance ?? 0}, ${acct.currency ?? 'USD'}, ${acct.notes ?? null})
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
