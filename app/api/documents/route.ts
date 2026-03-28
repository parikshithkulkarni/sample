import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ingestFile } from '@/lib/ingestion';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic();

// GET /api/documents — list all documents
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const rows = await sql`
    SELECT id, name, tags, summary, insights, added_at
    FROM documents
    ORDER BY added_at DESC
  `;
  return Response.json(rows);
}

// POST /api/documents — upload + ingest a document
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const tagsRaw = (formData.get('tags') as string | null) ?? '';

  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const buffer = Buffer.from(await file.arrayBuffer());
  const { documentId, chunkCount } = await ingestFile(buffer, file.name, file.type, tags);

  // Proactive insights — non-blocking best-effort
  try {
    const textSample = buffer.toString('utf-8').slice(0, 8000);
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Analyze this document excerpt and return ONLY valid JSON (no markdown, no explanation):
{"summary":"one sentence summary","insights":["insight 1","insight 2","insight 3"]}

Document: ${file.name}
---
${textSample}`,
        },
      ],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(raw) as { summary: string; insights: string[] };

    await sql`
      UPDATE documents
      SET summary = ${parsed.summary}, insights = ${parsed.insights}
      WHERE id = ${documentId}
    `;

    const [doc] = await sql`
      SELECT id, name, tags, summary, insights, added_at FROM documents WHERE id = ${documentId}
    `;
    return Response.json({ ...doc, chunkCount });
  } catch {
    // Return without insights if Claude call fails
    const [doc] = await sql`
      SELECT id, name, tags, summary, insights, added_at FROM documents WHERE id = ${documentId}
    `;
    return Response.json({ ...doc, chunkCount });
  }
}
