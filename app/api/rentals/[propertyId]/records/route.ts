import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { rentalRecordSchema, parseBody } from '@/lib/validators';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { propertyId } = await params;
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year');

  const rows = year
    ? await sql`
        SELECT * FROM rental_records
        WHERE property_id = ${propertyId} AND year = ${parseInt(year, 10)}
        ORDER BY year DESC, month DESC
      `
    : await sql`
        SELECT * FROM rental_records
        WHERE property_id = ${propertyId}
        ORDER BY year DESC, month DESC
      `;

  return Response.json(rows);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { propertyId } = await params;
  const parsed = await parseBody(req, rentalRecordSchema);
  if (parsed instanceof Response) return parsed;
  const { year, month, rent_collected, vacancy_days, mortgage_pmt, expenses, notes } = parsed;

  const expensesJson = JSON.stringify(expenses);

  const [row] = await sql`
    INSERT INTO rental_records (property_id, year, month, rent_collected, vacancy_days, mortgage_pmt, expenses, notes)
    VALUES (${propertyId}, ${year}, ${month}, ${rent_collected}, ${vacancy_days}, ${mortgage_pmt}, ${expensesJson}::jsonb, ${notes ?? null})
    ON CONFLICT (property_id, year, month) DO UPDATE SET
      rent_collected = EXCLUDED.rent_collected,
      vacancy_days   = EXCLUDED.vacancy_days,
      mortgage_pmt   = EXCLUDED.mortgage_pmt,
      expenses       = EXCLUDED.expenses,
      notes          = EXCLUDED.notes
    RETURNING *
  `;
  return Response.json(row, { status: 201 });
}
