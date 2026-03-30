import { describe, it, expect } from 'vitest';
import {
  accountSchema,
  accountPatchSchema,
  mergeSchema,
  propertySchema,
  rentalRecordSchema,
  deadlineSchema,
  deadlinePatchSchema,
  taxReturnQuerySchema,
  scenarioSchema,
  captureSchema,
  extractConfirmSchema,
  paginationSchema,
} from '@/lib/validators';

describe('accountSchema', () => {
  it('accepts valid account', () => {
    const result = accountSchema.safeParse({
      name: 'Chase Checking',
      type: 'asset',
      category: 'checking',
      balance: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('defaults currency to USD', () => {
    const result = accountSchema.parse({
      name: 'Test',
      type: 'asset',
      category: 'other',
      balance: 100,
    });
    expect(result.currency).toBe('USD');
  });

  it('rejects invalid type', () => {
    const result = accountSchema.safeParse({
      name: 'Test',
      type: 'unknown',
      category: 'other',
      balance: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = accountSchema.safeParse({
      type: 'asset',
      category: 'other',
      balance: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects Infinity balance', () => {
    const result = accountSchema.safeParse({
      name: 'Test',
      type: 'asset',
      category: 'other',
      balance: Infinity,
    });
    expect(result.success).toBe(false);
  });

  it('rejects NaN balance', () => {
    const result = accountSchema.safeParse({
      name: 'Test',
      type: 'asset',
      category: 'other',
      balance: NaN,
    });
    expect(result.success).toBe(false);
  });
});

describe('accountPatchSchema', () => {
  it('accepts partial updates', () => {
    const result = accountPatchSchema.safeParse({ balance: 1000 });
    expect(result.success).toBe(true);
  });

  it('accepts empty update', () => {
    const result = accountPatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('mergeSchema', () => {
  it('accepts valid merge request', () => {
    const result = mergeSchema.safeParse({
      keepId: '550e8400-e29b-41d4-a716-446655440000',
      deleteIds: ['550e8400-e29b-41d4-a716-446655440001'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID keepId', () => {
    const result = mergeSchema.safeParse({
      keepId: 'not-a-uuid',
      deleteIds: ['550e8400-e29b-41d4-a716-446655440001'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty deleteIds', () => {
    const result = mergeSchema.safeParse({
      keepId: '550e8400-e29b-41d4-a716-446655440000',
      deleteIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('propertySchema', () => {
  it('accepts valid property', () => {
    const result = propertySchema.safeParse({
      address: '123 Main St',
    });
    expect(result.success).toBe(true);
  });

  it('accepts full property with all optional fields', () => {
    const result = propertySchema.safeParse({
      address: '123 Main St',
      purchase_price: 300000,
      purchase_date: '2020-06-15',
      market_value: 400000,
      mortgage_balance: 250000,
      notes: 'rental property',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty address', () => {
    const result = propertySchema.safeParse({ address: '' });
    expect(result.success).toBe(false);
  });
});

describe('rentalRecordSchema', () => {
  it('accepts valid rental record', () => {
    const result = rentalRecordSchema.safeParse({
      year: 2024,
      month: 6,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rent_collected).toBe(0);
      expect(result.data.vacancy_days).toBe(0);
    }
  });

  it('rejects month > 12', () => {
    const result = rentalRecordSchema.safeParse({
      year: 2024,
      month: 13,
    });
    expect(result.success).toBe(false);
  });

  it('rejects month < 1', () => {
    const result = rentalRecordSchema.safeParse({
      year: 2024,
      month: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects year out of range', () => {
    const result = rentalRecordSchema.safeParse({
      year: 1800,
      month: 6,
    });
    expect(result.success).toBe(false);
  });
});

describe('deadlineSchema', () => {
  it('accepts valid deadline', () => {
    const result = deadlineSchema.safeParse({
      title: 'File taxes',
      due_date: '2024-04-15',
      category: 'tax_us',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = deadlineSchema.safeParse({
      title: 'File taxes',
      due_date: 'April 15',
      category: 'tax_us',
    });
    expect(result.success).toBe(false);
  });

  it('defaults is_recurring to false', () => {
    const result = deadlineSchema.parse({
      title: 'File taxes',
      due_date: '2024-04-15',
      category: 'tax_us',
    });
    expect(result.is_recurring).toBe(false);
  });
});

describe('deadlinePatchSchema', () => {
  it('accepts boolean is_done', () => {
    expect(deadlinePatchSchema.safeParse({ is_done: true }).success).toBe(true);
    expect(deadlinePatchSchema.safeParse({ is_done: false }).success).toBe(true);
  });

  it('rejects non-boolean is_done', () => {
    expect(deadlinePatchSchema.safeParse({ is_done: 'yes' }).success).toBe(false);
  });
});

describe('taxReturnQuerySchema', () => {
  it('coerces string year to number', () => {
    const result = taxReturnQuerySchema.parse({ year: '2024' });
    expect(result.year).toBe(2024);
    expect(result.country).toBe('US');
  });

  it('rejects invalid country', () => {
    const result = taxReturnQuerySchema.safeParse({ year: '2024', country: 'UK' });
    expect(result.success).toBe(false);
  });
});

describe('scenarioSchema', () => {
  it('accepts valid scenario types', () => {
    for (const type of ['iso', 'rnor', 'capital_gains', 'rental']) {
      const result = scenarioSchema.safeParse({ type, params: {} });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown scenario type', () => {
    const result = scenarioSchema.safeParse({ type: 'unknown', params: {} });
    expect(result.success).toBe(false);
  });
});

describe('captureSchema', () => {
  it('accepts valid capture', () => {
    const result = captureSchema.safeParse({ text: 'hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual([]);
  });

  it('rejects empty text', () => {
    const result = captureSchema.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });
});

describe('extractConfirmSchema', () => {
  it('defaults to empty arrays', () => {
    const result = extractConfirmSchema.parse({});
    expect(result.accounts).toEqual([]);
    expect(result.properties).toEqual([]);
  });

  it('accepts valid extraction data', () => {
    const result = extractConfirmSchema.safeParse({
      accounts: [{ name: 'Checking', type: 'asset', category: 'checking', balance: 1000, currency: 'USD' }],
      properties: [{ address: '123 Main St' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('paginationSchema', () => {
  it('provides defaults', () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('coerces string values', () => {
    const result = paginationSchema.parse({ limit: '10', offset: '20' });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
  });

  it('rejects limit > 200', () => {
    const result = paginationSchema.safeParse({ limit: '500' });
    expect(result.success).toBe(false);
  });

  it('rejects negative offset', () => {
    const result = paginationSchema.safeParse({ offset: '-1' });
    expect(result.success).toBe(false);
  });
});
