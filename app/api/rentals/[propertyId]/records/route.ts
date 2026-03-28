import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

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
        WHERE property_id = ${propertyId} AND year = ${parseInt(year)}
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
  const {
    year,
    month,
    rent_collected = 0,
    vacancy_days = 0,
    mortgage_pmt = 0,
    expenses = {},
    notes,
  } = (await req.json()) as {
    year: number;
    month: number;
    rent_collected?: number;
    vacancy_days?: number;
    mortgage_pmt?: number;
    expenses?: Record<string, number>;
    notes?: string;
  };

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
