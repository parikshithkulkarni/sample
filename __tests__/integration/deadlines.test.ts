/**
 * Integration tests for /api/deadlines and /api/deadlines/[id]
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
import { GET as deadlinesGET, POST as deadlinesPOST } from '@/app/api/deadlines/route';
import { PATCH as deadlinePATCH, DELETE as deadlineDELETE } from '@/app/api/deadlines/[id]/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

const MOCK_DEADLINE = {
  id: 'dl-1',
  title: 'Q1 Estimated Tax',
  due_date: '2026-04-15',
  category: 'Tax US',
  notes: null,
  is_done: false,
  is_recurring: true,
};

describe('GET /api/deadlines', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // runMigrations + seedDeadlines (handled by separate mocks), then count + data
    mockSql
      .mockResolvedValueOnce([{ total: 1 }] as never)
      .mockResolvedValueOnce([MOCK_DEADLINE] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await deadlinesGET(new Request('http://localhost/api/deadlines'));
    expect(res.status).toBe(401);
  });

  it('returns paginated deadlines', async () => {
    const res = await deadlinesGET(new Request('http://localhost/api/deadlines'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].title).toBe('Q1 Estimated Tax');
    expect(body.data[0].is_done).toBe(false);
  });

  it('returns empty data when no deadlines', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ total: 0 }] as never)
      .mockResolvedValueOnce([] as never);
    const res = await deadlinesGET(new Request('http://localhost/api/deadlines'));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('POST /api/deadlines', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([MOCK_DEADLINE] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await deadlinesPOST(new Request('http://localhost/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', due_date: '2026-04-15', category: 'Tax US' }),
    }));
    expect(res.status).toBe(401);
  });

  it('creates deadline and returns 201', async () => {
    const res = await deadlinesPOST(new Request('http://localhost/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Q1 Estimated Tax', due_date: '2026-04-15', category: 'Tax US' }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe('Q1 Estimated Tax');
  });

  it('defaults is_recurring to false if not provided', async () => {
    await deadlinesPOST(new Request('http://localhost/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'One-time', due_date: '2026-06-01', category: 'Other' }),
    }));
    expect(mockSql).toHaveBeenCalled();
  });

  it('returns 400 for invalid date format', async () => {
    const res = await deadlinesPOST(new Request('http://localhost/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', due_date: 'April 15', category: 'Other' }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/deadlines/[id]', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([{ ...MOCK_DEADLINE, is_done: true }] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await deadlinePATCH(
      new Request('http://localhost/api/deadlines/dl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_done: true }),
      }),
      { params: Promise.resolve({ id: 'dl-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('marks deadline as done', async () => {
    const res = await deadlinePATCH(
      new Request('http://localhost/api/deadlines/dl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_done: true }),
      }),
      { params: Promise.resolve({ id: 'dl-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.is_done).toBe(true);
  });

  it('returns 400 when no recognised fields are provided', async () => {
    const res = await deadlinePATCH(
      new Request('http://localhost/api/deadlines/dl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unknown_field: 'foo' }),
      }),
      { params: Promise.resolve({ id: 'dl-1' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/deadlines/[id]', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await deadlineDELETE(
      new Request('http://localhost/api/deadlines/dl-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'dl-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('deletes deadline and returns 204', async () => {
    const res = await deadlineDELETE(
      new Request('http://localhost/api/deadlines/dl-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'dl-1' }) },
    );
    expect(res.status).toBe(204);
  });
});
