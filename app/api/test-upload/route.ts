import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// Minimal upload test — no DB, no file parsing, just echoes file info
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'no file' }, { status: 400 });
    return Response.json({ ok: true, name: file.name, size: file.size, type: file.type });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
