import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export const maxDuration = 60;

// POST /api/documents/[id]/chunks — append more text chunks to an existing document
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  try {
    const { chunks, startIndex } = await req.json() as { chunks: string[]; startIndex: number };

    const indices = chunks.map((_, i) => startIndex + i);
    await sql`
      INSERT INTO chunks (document_id, chunk_index, content)
      SELECT ${id}, idx, content
      FROM unnest(${indices}::int[], ${chunks}::text[]) AS t(idx, content)
    `;

    return Response.json({ ok: true, added: chunks.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
