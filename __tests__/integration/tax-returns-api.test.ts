/**
 * Integration tests for /api/tax-returns and /api/tax-returns/[id]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/tax-returns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tax-returns')>();
  return {
    ...actual,
    syncTaxReturnsFromAccounts: vi.fn().mockResolvedValue(undefined),
  };
});

import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { GET as taxGET, POST as taxPOST } from '@/app/api/tax-returns/route';
import { PATCH as taxPATCH } from '@/app/api/tax-returns/[id]/route';
import { US_DEFAULT, INDIA_DEFAULT } from '@/lib/tax-returns';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

const MOCK_RETURN = {
  id: 'tr-1',
  tax_year: 2024,
  country: 'US',
  data: US_DEFAULT,
  updated_at: '2026-03-30T00:00:00Z',
};

describe('GET /api/tax-returns', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await taxGET(new Request('http://localhost/api/tax-returns?year=2024&country=US'));
    expect(res.status).toBe(401);
  });

  it('returns existing tax return', async () => {
    mockSql.mockResolvedValue([MOCK_RETURN] as never);
    const res = await taxGET(new Request('http://localhost/api/tax-returns?year=2024&country=US'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tax_year).toBe(2024);
    expect(data.country).toBe('US');
  });

  it('returns default US data when no return exists', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await taxGET(new Request('http://localhost/api/tax-returns?year=2024&country=US'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeNull();
    expect(data.data.income).toBeDefined();
    expect(data.data.filing_status).toBe('single');
  });

  it('returns default India data when no return exists for India', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await taxGET(new Request('http://localhost/api/tax-returns?year=2024&country=India'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeNull();
    expect(data.data.residential_status).toBe('ROR');
    expect(data.data.regime).toBe('new');
  });

  it('defaults to previous year when no year param', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await taxGET(new Request('http://localhost/api/tax-returns'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tax_year).toBe(new Date().getFullYear() - 1);
  });
});

describe('POST /api/tax-returns (sync)', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([MOCK_RETURN] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await taxPOST(new Request('http://localhost/api/tax-returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2024, country: 'US' }),
    }));
    expect(res.status).toBe(401);
  });

  it('triggers sync and returns updated return', async () => {
    const res = await taxPOST(new Request('http://localhost/api/tax-returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2024, country: 'US' }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tax_year).toBe(2024);
  });
});

describe('PATCH /api/tax-returns/[id]', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await taxPATCH(
      new Request('http://localhost/api/tax-returns/tr-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2024, country: 'US', data: { income: { wages: 120000 } } }),
      }),
      { params: Promise.resolve({ id: 'tr-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('merges partial data into existing return', async () => {
    mockSql
      .mockResolvedValueOnce([{ data: { ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 100000 } } }] as never)
      .mockResolvedValueOnce([{ ...MOCK_RETURN, data: { ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 120000 } } }] as never);

    const res = await taxPATCH(
      new Request('http://localhost/api/tax-returns/tr-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2024, country: 'US', data: { income: { wages: 120000 } } }),
      }),
      { params: Promise.resolve({ id: 'tr-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.income.wages).toBe(120000);
  });

  it('creates new return when id is "new"', async () => {
    const newReturn = { ...MOCK_RETURN, id: 'tr-new' };
    mockSql.mockResolvedValueOnce([newReturn] as never);

    const res = await taxPATCH(
      new Request('http://localhost/api/tax-returns/new', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2024, country: 'US', data: { income: { wages: 80000 } } }),
      }),
      { params: Promise.resolve({ id: 'new' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('tr-new');
  });

  it('returns 404 when return not found (non-new id)', async () => {
    mockSql.mockResolvedValueOnce([] as never);
    const res = await taxPATCH(
      new Request('http://localhost/api/tax-returns/missing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2024, country: 'US', data: {} }),
      }),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('creates India return with correct defaults', async () => {
    const indiaReturn = { ...MOCK_RETURN, country: 'India', data: INDIA_DEFAULT };
    mockSql.mockResolvedValueOnce([indiaReturn] as never);

    const res = await taxPATCH(
      new Request('http://localhost/api/tax-returns/new', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2024, country: 'India', data: { income: { salary: 1200000 } } }),
      }),
      { params: Promise.resolve({ id: 'new' }) },
    );
    expect(res.status).toBe(200);
  });
});
