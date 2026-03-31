import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// ── Junk detection: accounts that are NOT real balance-sheet items ───────────

// Categories that are income/tax records, never real accounts
const JUNK_CATEGORIES = new Set([
  'employment_income', 'self_employment_income', 'partnership_income',
  'interest_income', 'dividend_income', 'capital_gains', 'rental_income',
  'tax_prepayment', 'retirement_distribution', 'capital_gains_short_term',
  'capital_gains_long_term', 'wash_sale_disallowed', 'mortgage_interest_expense',
  'brokerage_sale_proceeds', 'subscription_expense', 'health_insurance_expense',
  'mortgage_insurance_expense', 'employer_health_coverage',
  'other_income', 'wages', 'salary', 'dividends', 'escrow', 'escrow_disbursement',
]);

// Name patterns that indicate an entry is NOT a real account
const JUNK_NAME_PATTERNS = [
  /\bcapital\s*gains?\b/i,
  /\brealized\s*(gains?|loss)/i,
  /\bunrealized\s*(gains?|loss)/i,
  /\bsale\s*proceeds?\b/i,
  /\bsales?\s+\d{4}\b/i,
  /\bshort[- ]term\s*(loss|gain|sale)/i,
  /\blong[- ]term\s*(loss|gain|sale)/i,
  /\binterest\s*(income|earned)\b/i,
  /\bdividend\s*(income|received)\b/i,
  /\bdividends?\b.*\d{4}/i,
  /\d{4}.*\bdividends?\b/i,
  /\bwages?\b.*\d{4}/i,
  /\d{4}\s*wages?\b/i,
  /\bsalary\b.*\d{4}/i,
  /\d{4}.*\bsalary\b/i,
  /\brental\s*income\b/i,
  /\bsubstitute\s*payments?\b/i,
  /\bescrow\s*(balance|disbursement)\b/i,
  /\bhazard\s*insurance\s*paid\b/i,
  /\btax\s*(withheld|prepay|withholding|refund)\b/i,
  /\bfederal\s*tax\b/i,
  /\bstate\s*tax\s*(withheld|paid)\b/i,
  /\b(tds|advance\s*tax)\b/i,
  /\bwash\s*sale\b/i,
  /\binterest\s*paid\b/i,
  /\bmortgage\s*interest\b/i,
  /\b(pmi|mortgage)\s*premium/i,
  /\binsurance\s*(expense|premium|cost)\b/i,
  /\bhealth\s*(insurance|coverage)\b/i,
  /\bemployer\s*health\b/i,
  /\bsubscription\s*(fee|expense|cost)\b/i,
  /\bexpense\b/i,
  /\bfee(s)?\s*\d{4}\b/i,
  /\b1099[- ]?(int|div|b|r|nec|misc)\b/i,
  /\bw[- ]?2\b.*\d{4}/i,
  /\bschedule\s*[a-z]\b/i,
  /\bform\s*\d+\b/i,
  /\bcontribution(s)?\s*\d{4}\b/i,
  /\bdistribution(s)?\s*\d{4}\b/i,
  /\bproceeds?\b/i,
  /\b(gross|net)\s*(pay|income|wages)\b/i,
  /\byear[- ]?to[- ]?date\b/i,
  /\bytd\b/i,
  /\b(realized|unrealized)\b/i,
];

// Category patterns that are clearly not real accounts
const JUNK_CATEGORY_PATTERNS = [
  /expense/i, /proceeds/i, /coverage/i, /premium/i,
  /disallowed/i, /withheld/i, /withholding/i,
];

function isJunkAccount(name: string, category: string): boolean {
  if (JUNK_CATEGORIES.has(category.toLowerCase())) return true;
  if (JUNK_NAME_PATTERNS.some(p => p.test(name))) return true;
  if (JUNK_CATEGORY_PATTERNS.some(p => p.test(category))) return true;
  return false;
}

// ── Dedup normalization: much more aggressive than before ────────────────────

function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    // Strip years
    .replace(/\b20\d{2}\b/g, '')
    // Strip account numbers
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\(account\s*[^)]*\)/gi, '')
    .replace(/\baccount\s*#?\s*\w+/gi, '')
    // Strip corp suffixes
    .replace(/\b(inc|llc|corp|ltd|co|na|n\.a\.)\b\.?/g, '')
    // Strip common noise words
    .replace(/\b(account|accounts|bank|financial|investments?|services?|updated|new|old|current|previous)\b/g, '')
    // Strip trailing descriptors
    .replace(/\s*[-–—]\s*(updated|new|old|current|ytd|year.to.date)$/i, '')
    // Clean up
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// POST /api/finance/cleanup
// Aggressive cleanup:
// 1. Syncs income/tax data to tax_returns
// 2. Deletes ALL junk accounts (by category AND name pattern)
// 3. Deduplicates remaining real accounts
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  // Step 1: Sync income data to tax returns before deleting
  try {
    const { syncTaxReturnsFromAccounts } = await import('@/lib/tax-returns');
    await syncTaxReturnsFromAccounts();
  } catch { /* non-fatal */ }

  // Step 2: Load all accounts and identify junk
  const allAccounts = await sql`SELECT id, name, type, category, balance, notes FROM accounts` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null;
  }[];

  const junkIds = allAccounts
    .filter(a => isJunkAccount(a.name, a.category))
    .map(a => a.id);

  let deletedJunk = 0;
  if (junkIds.length > 0) {
    await sql`DELETE FROM accounts WHERE id = ANY(${junkIds}::uuid[])`;
    deletedJunk = junkIds.length;
  }

  // Step 3: Deduplicate remaining real accounts with aggressive normalization
  const remaining = allAccounts.filter(a => !junkIds.includes(a.id));
  // Group accounts where one normalized name is a prefix/substring of another
  const dedupEntries = remaining
    .map(a => ({ acct: a, key: normalizeForDedup(a.name) }))
    .filter(e => e.key.length > 0);
  const groups = new Map<string, typeof remaining>();
  for (const { acct, key } of dedupEntries) {
    // Check if this key matches an existing group key (prefix/substring match)
    let matched = false;
    for (const [existingKey, group] of groups) {
      if (existingKey === key || (key.length >= 8 && existingKey.length >= 8 &&
          (existingKey.startsWith(key) || key.startsWith(existingKey) ||
           existingKey.includes(key) || key.includes(existingKey)))) {
        group.push(acct);
        // Use the shorter key as canonical (it's the common prefix)
        if (key.length < existingKey.length) {
          groups.set(key, group);
          groups.delete(existingKey);
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.set(key, [acct]);
    }
  }

  let mergedCount = 0;
  let deletedDups = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Keep the one with the highest absolute balance
    const keep = group.reduce((best, a) => Math.abs(Number(a.balance)) > Math.abs(Number(best.balance)) ? a : best);
    // For assets: sum balances. For liabilities: keep highest (don't sum debts).
    const isLiability = keep.type === 'liability';
    const newBalance = isLiability
      ? Math.max(...group.map(a => Math.abs(Number(a.balance))))
      : group.reduce((s, a) => s + Number(a.balance), 0);
    const mergedNotes = group.map(a => a.notes).filter(Boolean).join('; ') || keep.notes;
    const deleteIds = group.filter(a => a.id !== keep.id).map(a => a.id);
    if (deleteIds.length > 0) {
      await sql`DELETE FROM accounts WHERE id = ANY(${deleteIds}::uuid[])`;
      await sql`UPDATE accounts SET balance = ${newBalance}, notes = ${mergedNotes} WHERE id = ${keep.id}`;
      deletedDups += deleteIds.length;
      mergedCount++;
    }
  }

  // Step 4: Delete $0 balance accounts (likely empty extraction artifacts)
  const zeroAccounts = await sql`SELECT id FROM accounts WHERE balance = 0` as { id: string }[];
  let deletedZero = 0;
  if (zeroAccounts.length > 0) {
    const zeroIds = zeroAccounts.map(a => a.id);
    await sql`DELETE FROM accounts WHERE id = ANY(${zeroIds}::uuid[])`;
    deletedZero = zeroIds.length;
  }

  // Snapshot after cleanup
  try {
    const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
    await takeNetWorthSnapshot();
  } catch { /* non-fatal */ }

  return Response.json({
    junkRemoved: deletedJunk,
    duplicatesMerged: mergedCount,
    duplicatesRemoved: deletedDups,
    zeroBalanceRemoved: deletedZero,
  });
}
