import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic();

// POST /api/documents/[id]/analyze — generate AI insights for an already-ingested document
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  // Fetch ALL chunks — no limit, no cropping
  const chunks = await sql`
    SELECT content FROM chunks WHERE document_id = ${id} ORDER BY chunk_index
  `;
  if (chunks.length === 0) return Response.json({ error: 'Document not found' }, { status: 404 });

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${id}`;
  const fullText = (chunks as { content: string }[]).map(c => c.content).join('\n');

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Analyze this document and return ONLY valid JSON (no markdown, no explanation):
{"summary":"one sentence summary","insights":["insight 1","insight 2","insight 3"]}

Document: ${(docRow as { name: string }).name}
---
${fullText}`,
        },
      ],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(raw) as { summary: string; insights: string[] };

    const [updated] = await sql`
      UPDATE documents
      SET summary = ${parsed.summary}, insights = ${parsed.insights}
      WHERE id = ${id}
      RETURNING id, name, tags, summary, insights, added_at
    `;
    return Response.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
