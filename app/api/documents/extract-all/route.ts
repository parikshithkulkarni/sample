import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { extractAndInsert } from '@/lib/extract';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // 5 minutes — extraction is slow

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const docs = await sql`SELECT id, name FROM documents ORDER BY added_at ASC`;
  interface ExtractResult {
    name: string;
    accounts: string[];
    properties: string[];
    rentalRecords: string[];
    taxData: string[];
    error?: string;
  }
  const results: ExtractResult[] = [];

  for (const doc of docs as { id: string; name: string }[]) {
    try {
      const r = await extractAndInsert(doc.id);
      results.push({ name: doc.name, ...r });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Extraction failed for ${doc.name}: ${errMsg}`, err);
      results.push({ name: doc.name, accounts: [], properties: [], rentalRecords: [], taxData: [], error: errMsg });
    }
  }

  // Sync tax returns after all extractions
  try {
    const { syncTaxReturnsFromAccounts } = await import('@/lib/tax-returns');
    await syncTaxReturnsFromAccounts();
  } catch (err) {
    logger.error('Tax sync failed after extract-all', err);
  }

  return Response.json({ processed: docs.length, results });
}
