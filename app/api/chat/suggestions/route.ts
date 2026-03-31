import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

type CountRow = { count: number };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const [accountsRes, propertiesRes, deadlinesRes, documentsRes, equityAccountsRes] = await Promise.all([
      sql`SELECT count(*)::int AS count FROM accounts`,
      sql`SELECT count(*)::int AS count FROM properties`,
      sql`SELECT count(*)::int AS count FROM deadlines WHERE NOT is_done AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
      sql`SELECT count(*)::int AS count FROM documents`,
      sql`SELECT count(*)::int AS count FROM accounts WHERE category IN ('iso_options', 'rsu', 'espp')`,
    ]);

    const accountCount  = (accountsRes[0] as CountRow).count;
    const propertyCount = (propertiesRes[0] as CountRow).count;
    const deadlineCount = (deadlinesRes[0] as CountRow).count;
    const documentCount = (documentsRes[0] as CountRow).count;
    const equityCount   = (equityAccountsRes[0] as CountRow).count;

    // Fetch the nearest upcoming deadline title for personalized suggestion
    let deadlineTitle = '';
    if (deadlineCount > 0) {
      const deadlineRows = await sql`
        SELECT title FROM deadlines
        WHERE NOT is_done AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY due_date ASC LIMIT 1
      ` as { title: string }[];
      if (deadlineRows.length > 0) {
        deadlineTitle = deadlineRows[0].title;
      }
    }

    const suggestions: string[] = [];

    if (propertyCount > 0) {
      suggestions.push("What's my rental portfolio ROI?");
    }

    if (equityCount > 0) {
      suggestions.push('Should I exercise my ISOs this year?');
    }

    if (deadlineCount > 0 && deadlineTitle) {
      suggestions.push(`What do I need for my ${deadlineTitle} filing?`);
    }

    if (documentCount > 0) {
      suggestions.push('Summarize my recent tax documents');
    }

    if (accountCount > 0) {
      suggestions.push('How can I optimize my asset allocation?');
    }

    // Always include this general suggestion
    suggestions.push('How can I reduce my tax burden this year?');

    return Response.json({ suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    console.error('Suggestions API error:', err);
    return Response.json({ suggestions: ['How can I reduce my tax burden this year?'] });
  }
}
