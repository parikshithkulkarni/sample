import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { extractAndInsert } from '@/lib/extract';

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  try {
    const result = await extractAndInsert(id);
    return Response.json({ extracted: true, ...result });
  } catch (e) {
    return Response.json({ extracted: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
