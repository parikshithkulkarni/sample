import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeAccountName, normalizeAddress, addressesMatch } from '@/lib/extract';

interface Issue {
  type: 'duplicate_account' | 'duplicate_property' | 'junk_account' | 'zero_balance' | 'no_source_doc' | 'orphan_property' | 'invalid_date' | 'miscategorized';
  severity: 'error' | 'warning' | 'info';
  entity: 'account' | 'property' | 'document';
  ids: string[];
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

// Name patterns indicating an entry is NOT a real balance-sheet account
const JUNK_PATTERNS = [
  /\bcapital\s*gains?\b/i, /\brealized\s*(gains?|loss)/i, /\bunrealized\s*(gains?|loss)/i,
  /\bsale\s*proceeds?\b/i, /\bsales?\s+\d{4}\b/i, /\bshort[- ]term\s*(loss|gain|sale)/i,
  /\blong[- ]term\s*(loss|gain|sale)/i, /\binterest\s*(income|earned)\b/i,
  /\bdividend\s*(income|received)\b/i, /\bwages?\b.*\d{4}/i, /\bsalary\b.*\d{4}/i,
  /\btax\s*(withheld|prepay|withholding|refund)\b/i, /\bfederal\s*tax\b/i,
  /\bstate\s*tax\s*(withheld|paid)\b/i, /\bwash\s*sale\b/i, /\binterest\s*paid\b/i,
  /\bmortgage\s*interest\b/i, /\b(pmi|mortgage)\s*premium/i,
  /\binsurance\s*(expense|premium|cost)\b/i, /\bhealth\s*(insurance|coverage)\b/i,
  /\bemployer\s*health\b/i, /\bsubscription\s*(fee|expense|cost)\b/i,
  /\bexpense\b/i, /\bfee(s)?\s*\d{4}\b/i, /\bproceeds?\b/i,
  /\b(gross|net)\s*(pay|income|wages)\b/i, /\bytd\b/i, /\b(realized|unrealized)\b/i,
  /\bcontribution(s)?\s*\d{4}\b/i, /\bdistribution(s)?\s*\d{4}\b/i,
];

const JUNK_CATEGORIES = new Set([
  'employment_income', 'self_employment_income', 'partnership_income',
  'interest_income', 'dividend_income', 'capital_gains', 'rental_income',
  'tax_prepayment', 'retirement_distribution',
]);

function normalizeForDedup(name: string): string {
  return name.toLowerCase()
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\(account\s*[^)]*\)/gi, '')
    .replace(/\baccount\s*#?\s*\w+/gi, '')
    .replace(/\b(inc|llc|corp|ltd|co|na|n\.a\.)\b\.?/g, '')
    .replace(/\b(account|accounts|bank|financial|investments?|services?|updated|new|old|current|previous)\b/g, '')
    .replace(/\s*[-–—]\s*(updated|new|old|current|ytd)$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /api/audit — analyze all data and report issues
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const issues: Issue[] = [];

  // Load all data
  const accounts = await sql`SELECT id, name, type, category, balance, currency, notes, updated_at FROM accounts ORDER BY name` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null; currency: string; updated_at: string;
  }[];

  const properties = await sql`SELECT id, address, purchase_price, purchase_date, market_value, mortgage_balance, notes, created_at FROM properties ORDER BY address` as {
    id: string; address: string; purchase_price: number | null; purchase_date: string | null;
    market_value: number | null; mortgage_balance: number | null; notes: string | null; created_at: string;
  }[];

  const documents = await sql`SELECT id, name, tags, summary, extracted_at, added_at FROM documents ORDER BY added_at DESC` as {
    id: string; name: string; tags: string[]; summary: string | null; extracted_at: string | null; added_at: string;
  }[];

  const rentalRecords = await sql`SELECT property_id, year, month, rent_collected FROM rental_records` as {
    property_id: string; year: number; month: number; rent_collected: number;
  }[];

  // ── 1. Junk accounts (income/tax/expense items that aren't real accounts) ──
  for (const a of accounts) {
    const isJunkCategory = JUNK_CATEGORIES.has(a.category.toLowerCase());
    const isJunkName = JUNK_PATTERNS.some(p => p.test(a.name));
    if (isJunkCategory || isJunkName) {
      issues.push({
        type: 'junk_account',
        severity: 'error',
        entity: 'account',
        ids: [a.id],
        description: `"${a.name}" (${a.category}, $${a.balance}) is not a real account — it's an income/expense/transaction record`,
        suggestion: 'Delete from accounts. Data should be on Tax Returns page.',
        autoFixable: true,
      });
    }
  }

  // ── 2. Duplicate accounts ──
  const acctGroups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const key = normalizeForDedup(a.name);
    if (!key) continue;
    const group = acctGroups.get(key) ?? [];
    group.push(a);
    acctGroups.set(key, group);
  }
  for (const [key, group] of acctGroups) {
    if (group.length < 2) continue;
    issues.push({
      type: 'duplicate_account',
      severity: 'error',
      entity: 'account',
      ids: group.map(a => a.id),
      description: `${group.length} duplicate accounts: ${group.map(a => `"${a.name}" ($${a.balance})`).join(', ')}`,
      suggestion: `Merge into one. Normalized key: "${key}"`,
      autoFixable: true,
    });
  }

  // ── 3. Zero balance accounts ──
  for (const a of accounts) {
    if (Number(a.balance) === 0) {
      issues.push({
        type: 'zero_balance',
        severity: 'warning',
        entity: 'account',
        ids: [a.id],
        description: `"${a.name}" has $0 balance — likely an extraction artifact`,
        suggestion: 'Delete if not a real account you want to track.',
        autoFixable: true,
      });
    }
  }

  // ── 4. Duplicate properties ──
  const visitedProps = new Set<string>();
  for (let i = 0; i < properties.length; i++) {
    if (visitedProps.has(properties[i].id)) continue;
    const group = [properties[i]];
    for (let j = i + 1; j < properties.length; j++) {
      if (!visitedProps.has(properties[j].id) && addressesMatch(properties[i].address, properties[j].address)) {
        group.push(properties[j]);
        visitedProps.add(properties[j].id);
      }
    }
    if (group.length > 1) {
      visitedProps.add(properties[i].id);
      issues.push({
        type: 'duplicate_property',
        severity: 'error',
        entity: 'property',
        ids: group.map(p => p.id),
        description: `${group.length} duplicate properties: ${group.map(p => `"${p.address}"`).join(', ')}`,
        suggestion: 'Merge into one, keeping the most complete data.',
        autoFixable: true,
      });
    }
  }

  // ── 5. Invalid property dates ──
  for (const p of properties) {
    if (p.purchase_date) {
      const d = new Date(p.purchase_date + 'T00:00:00');
      if (isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > new Date().getFullYear() + 1) {
        issues.push({
          type: 'invalid_date',
          severity: 'warning',
          entity: 'property',
          ids: [p.id],
          description: `"${p.address}" has invalid purchase date: "${p.purchase_date}"`,
          suggestion: 'Clear the invalid date.',
          autoFixable: true,
        });
      }
    }
  }

  // ── 6. Properties with no rental records ──
  const propertyIdsWithRecords = new Set(rentalRecords.map(r => r.property_id));
  for (const p of properties) {
    if (!propertyIdsWithRecords.has(p.id)) {
      issues.push({
        type: 'orphan_property',
        severity: 'info',
        entity: 'property',
        ids: [p.id],
        description: `"${p.address}" has no rental records logged`,
        suggestion: 'Add monthly rental records or this is a non-rental property.',
        autoFixable: false,
      });
    }
  }

  // ── Summary stats ──
  const summary = {
    totalAccounts: accounts.length,
    totalProperties: properties.length,
    totalDocuments: documents.length,
    documentsExtracted: documents.filter(d => d.extracted_at).length,
    documentsNotExtracted: documents.filter(d => !d.extracted_at).length,
    totalRentalRecords: rentalRecords.length,
    issuesByType: {
      junk_account: issues.filter(i => i.type === 'junk_account').length,
      duplicate_account: issues.filter(i => i.type === 'duplicate_account').length,
      zero_balance: issues.filter(i => i.type === 'zero_balance').length,
      duplicate_property: issues.filter(i => i.type === 'duplicate_property').length,
      invalid_date: issues.filter(i => i.type === 'invalid_date').length,
      orphan_property: issues.filter(i => i.type === 'orphan_property').length,
    },
    autoFixableCount: issues.filter(i => i.autoFixable).length,
  };

  return Response.json({
    summary,
    issues,
    accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, category: a.category, balance: Number(a.balance) })),
    properties: properties.map(p => ({ id: p.id, address: p.address, purchase_date: p.purchase_date, market_value: p.market_value ? Number(p.market_value) : null, mortgage_balance: p.mortgage_balance ? Number(p.mortgage_balance) : null })),
    documents: documents.map(d => ({ id: d.id, name: d.name, extracted: !!d.extracted_at })),
  });
}

// POST /api/audit — auto-fix all fixable issues
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  // Step 1: Sync income data to tax returns before deleting
  try {
    const { syncTaxReturnsFromAccounts } = await import('@/lib/tax-returns');
    await syncTaxReturnsFromAccounts();
  } catch { /* non-fatal */ }

  const accounts = await sql`SELECT id, name, type, category, balance, notes FROM accounts` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null;
  }[];

  // Delete junk accounts
  const junkIds = accounts
    .filter(a => JUNK_CATEGORIES.has(a.category.toLowerCase()) || JUNK_PATTERNS.some(p => p.test(a.name)))
    .map(a => a.id);
  if (junkIds.length > 0) {
    await sql`DELETE FROM accounts WHERE id = ANY(${junkIds}::uuid[])`;
  }

  // Delete $0 balance accounts
  await sql`DELETE FROM accounts WHERE balance = 0`;

  // Dedup remaining accounts
  const remaining = accounts.filter(a => !junkIds.includes(a.id) && Number(a.balance) !== 0);
  const groups = new Map<string, typeof remaining>();
  for (const a of remaining) {
    const key = normalizeForDedup(a.name);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(a);
    groups.set(key, group);
  }
  let mergedAccounts = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const keep = group.reduce((best, a) => Math.abs(Number(a.balance)) > Math.abs(Number(best.balance)) ? a : best);
    const deleteIds = group.filter(a => a.id !== keep.id).map(a => a.id);
    if (deleteIds.length > 0) {
      const isLiab = keep.type === 'liability';
      const newBal = isLiab ? Math.max(...group.map(a => Math.abs(Number(a.balance)))) : group.reduce((s, a) => s + Number(a.balance), 0);
      await sql`DELETE FROM accounts WHERE id = ANY(${deleteIds}::uuid[])`;
      await sql`UPDATE accounts SET balance = ${newBal} WHERE id = ${keep.id}`;
      mergedAccounts++;
    }
  }

  // Dedup properties
  const properties = await sql`SELECT id, address, purchase_price, purchase_date, market_value, mortgage_balance, notes, created_at FROM properties ORDER BY created_at ASC` as {
    id: string; address: string; purchase_price: number | null; purchase_date: string | null;
    market_value: number | null; mortgage_balance: number | null; notes: string | null; created_at: string;
  }[];
  const visitedProps = new Set<string>();
  let mergedProperties = 0;
  for (let i = 0; i < properties.length; i++) {
    if (visitedProps.has(properties[i].id)) continue;
    const group = [properties[i]];
    for (let j = i + 1; j < properties.length; j++) {
      if (!visitedProps.has(properties[j].id) && addressesMatch(properties[i].address, properties[j].address)) {
        group.push(properties[j]);
        visitedProps.add(properties[j].id);
      }
    }
    if (group.length > 1) {
      visitedProps.add(properties[i].id);
      const keep = group.reduce((best, p) => {
        const score = (p2: typeof p) => [p2.purchase_price, p2.purchase_date, p2.market_value, p2.mortgage_balance, p2.notes].filter(Boolean).length;
        return score(p) > score(best) ? p : best;
      });
      const deleteIds = group.filter(p => p.id !== keep.id).map(p => p.id);
      const best = { ...keep };
      for (const dup of group) {
        if (dup.id === keep.id) continue;
        if (!best.purchase_price && dup.purchase_price) best.purchase_price = dup.purchase_price;
        if (!best.purchase_date && dup.purchase_date) best.purchase_date = dup.purchase_date;
        if (!best.market_value && dup.market_value) best.market_value = dup.market_value;
        if (!best.mortgage_balance && dup.mortgage_balance) best.mortgage_balance = dup.mortgage_balance;
        if (!best.notes && dup.notes) best.notes = dup.notes;
        if (dup.address.length > best.address.length) best.address = dup.address;
      }
      await sql`UPDATE rental_records SET property_id = ${keep.id} WHERE property_id = ANY(${deleteIds}::uuid[])`;
      await sql`DELETE FROM properties WHERE id = ANY(${deleteIds}::uuid[])`;
      await sql`UPDATE properties SET address = ${best.address}, purchase_price = ${best.purchase_price}, purchase_date = ${best.purchase_date}, market_value = ${best.market_value}, mortgage_balance = ${best.mortgage_balance}, notes = ${best.notes} WHERE id = ${keep.id}`;
      mergedProperties++;
    }
  }

  // Fix invalid dates
  await sql`UPDATE properties SET purchase_date = NULL WHERE purchase_date IS NOT NULL AND (purchase_date::text !~ '^\d{4}-\d{2}-\d{2}$' OR EXTRACT(YEAR FROM purchase_date) < 1900)`;

  // Snapshot
  try {
    const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
    await takeNetWorthSnapshot();
  } catch { /* non-fatal */ }

  return Response.json({
    junkDeleted: junkIds.length,
    mergedAccounts,
    mergedProperties,
    message: 'Cleanup complete. Refresh to see results.',
  });
}
