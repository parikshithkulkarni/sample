import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { extractAndInsert } from '@/lib/extract';

export const maxDuration = 60;

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const docs = await sql`SELECT id, name FROM documents ORDER BY added_at ASC`;
  const results: { name: string; accounts: string[]; properties: string[] }[] = [];

  for (const doc of docs as { id: string; name: string }[]) {
    try {
      const r = await extractAndInsert(doc.id);
      results.push({ name: doc.name, ...r });
    } catch {
      results.push({ name: doc.name, accounts: [], properties: [] });
    }
  }

  return Response.json({ processed: docs.length, results });
}
