import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic();

// POST /api/documents/[id]/extract
// Reads the document chunks, asks Claude to extract financial/rental data,
// and auto-inserts into accounts + properties tables.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  // Get document text sample
  const chunks = await sql`
    SELECT content FROM chunks WHERE document_id = ${id} ORDER BY chunk_index LIMIT 20
  `;
  if (chunks.length === 0) return Response.json({ extracted: false, reason: 'No chunks' });

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${id}`;
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

  try {
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
      // Skip duplicates by name
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
        VALUES (
          ${prop.address},
          ${prop.purchase_price ?? null},
          ${prop.purchase_date ?? null},
          ${prop.market_value ?? null},
          ${prop.mortgage_balance ?? null},
          ${prop.notes ?? null}
        )
      `;
      insertedProperties.push(prop.address);
    }

    return Response.json({
      extracted: true,
      accounts: insertedAccounts,
      properties: insertedProperties,
    });
  } catch (e) {
    return Response.json({ extracted: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
