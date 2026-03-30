import { sql } from '@/lib/db';

/**
 * Upsert today's net worth snapshot from the current accounts table state.
 * Sums all asset and liability balances, then inserts or updates the daily snapshot row.
 * Failures are silently ignored (best-effort).
 *
 * @returns Resolves when the snapshot has been written (or silently on error)
 */
export async function takeNetWorthSnapshot(): Promise<void> {
  try {
    const [row] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'asset'     THEN balance ELSE 0 END), 0) AS total_assets,
        COALESCE(SUM(CASE WHEN type = 'liability' THEN balance ELSE 0 END), 0) AS total_liabs
      FROM accounts
    ` as { total_assets: string; total_liabs: string }[];

    const assets = Number(row.total_assets);
    const liabs  = Number(row.total_liabs);

    await sql`
      INSERT INTO net_worth_snapshots (snapshot_date, net_worth, total_assets, total_liabs)
      VALUES (CURRENT_DATE, ${assets - liabs}, ${assets}, ${liabs})
      ON CONFLICT (snapshot_date) DO UPDATE
        SET net_worth    = EXCLUDED.net_worth,
            total_assets = EXCLUDED.total_assets,
            total_liabs  = EXCLUDED.total_liabs
    `;
  } catch {
    // Non-fatal — snapshots are best-effort
  }
}
