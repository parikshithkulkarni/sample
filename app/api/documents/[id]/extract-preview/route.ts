import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { findAndParseJSON, buildExtractionPrompt } from '@/lib/extract';

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
  if ((allChunks as unknown[]).length === 0) return Response.json({ accounts: [], properties: [], rental_records: [] });

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

  const prompt = buildExtractionPrompt(docName, text, existingAccountsList, existingPropertiesList);

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = (msg.content[0] as { type: string; text: string }).text;
    const parsed = findAndParseJSON(responseText);
    if (!parsed) throw new Error('No JSON object found in response');
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), accounts: [], properties: [], rental_records: [] }, { status: 500 });
  }
}
