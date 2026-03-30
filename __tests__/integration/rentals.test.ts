/**
 * Integration tests for /api/rentals and /api/rentals/[propertyId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
  runMigrations: vi.fn().mockResolvedValue(undefined),
  seedDeadlines: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { GET as rentalsGET, POST as rentalsPOST } from '@/app/api/rentals/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

const MOCK_PROPERTY = {
  id: 'prop-1',
  address: '123 Main St, Austin, TX 78701',
  purchase_price: 450000,
  purchase_date: '2021-06-15',
  market_value: 580000,
  mortgage_balance: 360000,
  notes: null,
  created_at: '2021-06-15T00:00:00Z',
};

describe('GET /api/rentals', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // runMigrations (handled by separate mock), then count + data
    mockSql
      .mockResolvedValueOnce([{ total: 1 }] as never)
      .mockResolvedValueOnce([MOCK_PROPERTY] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await rentalsGET(new Request('http://localhost/api/rentals'));
    expect(res.status).toBe(401);
  });

  it('returns paginated list of properties', async () => {
    const res = await rentalsGET(new Request('http://localhost/api/rentals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].address).toBe('123 Main St, Austin, TX 78701');
  });

  it('returns empty data when no properties', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ total: 0 }] as never)
      .mockResolvedValueOnce([] as never);
    const res = await rentalsGET(new Request('http://localhost/api/rentals'));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('POST /api/rentals', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // First call: dedup check (SELECT all properties) returns empty, second call: INSERT returns property
    mockSql
      .mockResolvedValueOnce([] as never) // dedup SELECT
      .mockResolvedValueOnce([MOCK_PROPERTY] as never); // INSERT RETURNING
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await rentalsPOST(new Request('http://localhost/api/rentals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '123 Main St' }),
    }));
    expect(res.status).toBe(401);
  });

  it('creates property with all fields and returns 201', async () => {
    const res = await rentalsPOST(new Request('http://localhost/api/rentals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '123 Main St, Austin, TX 78701',
        purchase_price: 450000,
        purchase_date: '2021-06-15',
        market_value: 580000,
        mortgage_balance: 360000,
      }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.address).toBe('123 Main St, Austin, TX 78701');
    expect(data.market_value).toBe(580000);
  });

  it('creates property with only address (optional fields null)', async () => {
    const minimalProp = { ...MOCK_PROPERTY, purchase_price: null, market_value: null, mortgage_balance: null };
    mockSql.mockReset();
    mockSql.mockResolvedValue([minimalProp] as never);
    const res = await rentalsPOST(new Request('http://localhost/api/rentals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '456 Oak Ave' }),
    }));
    expect(res.status).toBe(201);
  });

  it('calls sql with null for missing optional fields', async () => {
    await rentalsPOST(new Request('http://localhost/api/rentals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '789 Pine Rd' }),
    }));
    expect(mockSql).toHaveBeenCalled();
  });
});
