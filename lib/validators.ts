import { z } from 'zod';

// ── Shared primitives ────────────────────────────────────────────────────────

const uuid = z.string().uuid();
const money = z.number().finite();
const optionalMoney = z.number().finite().nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date').nullable().optional();

// ── Finance ──────────────────────────────────────────────────────────────────

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  type: z.enum(['asset', 'liability']),
  category: z.string().min(1, 'Category is required'),
  balance: money,
  currency: z.string().min(1).max(10).default('USD'),
  notes: z.string().optional(),
});

export const accountPatchSchema = z.object({
  balance: money.optional(),
  notes: z.string().optional(),
});

export const mergeSchema = z.object({
  keepId: uuid,
  deleteIds: z.array(uuid).min(1, 'At least one deleteId is required'),
});

// ── Rentals ──────────────────────────────────────────────────────────────────

export const propertySchema = z.object({
  address: z.string().min(1, 'Address is required'),
  purchase_price: optionalMoney,
  purchase_date: isoDate,
  market_value: optionalMoney,
  mortgage_balance: optionalMoney,
  notes: z.string().optional(),
});

export const propertyPatchSchema = z.object({
  address: z.string().min(1).optional(),
  purchase_price: z.number().finite().nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  market_value: z.number().finite().nullable().optional(),
  mortgage_balance: z.number().finite().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const rentalRecordSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  rent_collected: z.number().finite().default(0),
  vacancy_days: z.number().int().min(0).max(31).default(0),
  mortgage_pmt: z.number().finite().default(0),
  expenses: z.record(z.string(), z.number().finite()).default({}),
  notes: z.string().optional(),
});

export const rentalMergeSchema = z.object({
  keepId: uuid,
  deleteIds: z.array(uuid).min(1),
});

// ── Deadlines ────────────────────────────────────────────────────────────────

export const deadlineSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date'),
  category: z.string().min(1, 'Category is required'),
  notes: z.string().optional(),
  is_recurring: z.boolean().default(false),
});

export const deadlinePatchSchema = z.object({
  is_done: z.boolean(),
});

// ── Tax Returns ──────────────────────────────────────────────────────────────

export const taxReturnQuerySchema = z.object({
  year: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : v),
    z.coerce.number().int().min(1900).max(2100).default(new Date().getFullYear() - 1),
  ),
  country: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : v),
    z.enum(['US', 'India']).default('US'),
  ),
});

export const taxReturnSyncSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  country: z.enum(['US', 'India']),
});

export const taxReturnPatchSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  country: z.enum(['US', 'India']),
  data: z.record(z.string(), z.unknown()),
});

// ── Scenarios ────────────────────────────────────────────────────────────────

export const scenarioSchema = z.object({
  type: z.enum(['iso', 'rnor', 'capital_gains', 'rental']),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

// ── Documents ────────────────────────────────────────────────────────────────

export const documentUploadSchema = z.object({
  fileName: z.string().min(1, 'fileName is required'),
  mimeType: z.string().optional(),
  base64: z.string().optional(),
  chunks: z.array(z.string()).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
}).refine(
  (d) => d.base64 || d.chunks,
  { message: 'Provide either base64 or chunks' },
);

// ── Capture ──────────────────────────────────────────────────────────────────

export const captureSchema = z.object({
  text: z.string().min(1, 'text is required'),
  tags: z.array(z.string()).default([]),
});

// ── Extract confirm ──────────────────────────────────────────────────────────

export const extractConfirmSchema = z.object({
  accounts: z.array(z.object({
    name: z.string(),
    type: z.string(),
    category: z.string().default('other'),
    balance: z.number().nullable().default(0),
    currency: z.string().default('USD'),
    notes: z.string().optional(),
  })).default([]),
  properties: z.array(z.object({
    address: z.string(),
    purchase_price: z.number().nullable().optional(),
    purchase_date: z.string().nullable().optional(),
    market_value: z.number().nullable().optional(),
    mortgage_balance: z.number().nullable().optional(),
    monthly_rent: z.number().nullable().optional(),
    notes: z.string().optional(),
  })).default([]),
  rental_records: z.array(z.object({
    address: z.string(),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    rent_collected: z.number().default(0),
    mortgage_pmt: z.number().default(0),
    vacancy_days: z.number().int().default(0),
    expenses: z.record(z.string(), z.number()).default({}),
    notes: z.string().optional(),
    _include: z.boolean().default(true),
  })).default([]),
});

// ── Claude extraction output validation ──────────────────────────────────────

export const extractionOutputSchema = z.object({
  accounts: z.array(z.object({
    name: z.string(),
    type: z.string(),
    category: z.string(),
    balance: z.unknown().transform((v) => {
      if (v == null) return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      return 0;
    }),
    currency: z.string().default('USD'),
    notes: z.string().optional(),
  })).default([]),
  properties: z.array(z.object({
    address: z.string(),
    purchase_price: z.unknown().optional(),
    purchase_date: z.string().nullable().optional(),
    market_value: z.unknown().optional(),
    mortgage_balance: z.unknown().optional(),
    notes: z.string().optional(),
  })).default([]),
  rental_records: z.array(z.object({
    address: z.string(),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    rent_collected: z.number().default(0),
    mortgage_pmt: z.number().default(0),
    vacancy_days: z.number().int().default(0),
    expenses: z.record(z.string(), z.number()).default({}),
    notes: z.string().optional(),
  })).default([]),
  tax_data: z.array(z.object({
    tax_year: z.number().int(),
    field: z.string(),
    amount: z.number(),
    notes: z.string().optional(),
  })).default([]),
});

// ── Chat ─────────────────────────────────────────────────────────────────────

export const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).min(1, 'At least one message is required'),
  data: z.object({
    mentionedDocIds: z.array(z.string()).default([]),
    sessionId: z.string().default(''),
  }).default({}),
});

// ── Pagination ───────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse request JSON body and validate it against a Zod schema.
 * Returns the validated data on success or a 400 Response on failure.
 *
 * @param req - The incoming HTTP request containing JSON body
 * @param schema - A Zod schema to validate the parsed body against
 * @returns The validated data matching the schema, or a 400 Response with error details
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseBody<S extends z.ZodType<any, any, any>>(req: Request, schema: S): Promise<z.infer<S> | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return Response.json(
      { error: 'Validation failed', details: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  return result.data as z.infer<S>;
}

/**
 * Parse URL query parameters and validate them against a Zod schema.
 * Returns the validated data on success or a 400 Response on failure.
 *
 * @param searchParams - The URL search parameters to parse
 * @param schema - A Zod schema to validate the parsed parameters against
 * @returns The validated data matching the schema, or a 400 Response with error details
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseQuery<S extends z.ZodType<any, any, any>>(searchParams: URLSearchParams, schema: S): z.infer<S> | Response {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return Response.json(
      { error: 'Invalid query parameters', details: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  return result.data as z.infer<S>;
}
