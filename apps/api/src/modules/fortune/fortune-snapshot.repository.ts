import { fortuneSnapshotKey, parseFortuneSnapshot, type FortunePublicSnapshot, type FortuneSnapshotPort } from "./fortune-snapshot";

export type FortuneSnapshotQuery = (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
/** Uses the existing PostgreSQL pool; never provisions a table at application startup. */
export class PostgresFortuneSnapshotRepository implements FortuneSnapshotPort {
  constructor(private readonly query: FortuneSnapshotQuery) {}
  async get(key: string, now: Date): Promise<FortunePublicSnapshot | null> {
    const result = await this.query("SELECT payload FROM fortune_public_snapshot WHERE snapshot_key = $1 AND expires_at > $2 LIMIT 1", [key, now]);
    if (!result.rows.length) return null;
    return parseFortuneSnapshot(result.rows[0].payload, key, now);
  }
  async put(value: FortunePublicSnapshot): Promise<void> {
    const key = fortuneSnapshotKey(value);
    const safe = parseFortuneSnapshot(value, key, new Date(value.checkedAt));
    await this.query(`INSERT INTO fortune_public_snapshot (snapshot_key, payload, checked_at, expires_at)
      VALUES ($1, $2::jsonb, $3, $4)
      ON CONFLICT (snapshot_key) DO UPDATE SET payload = EXCLUDED.payload,
        checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at
      WHERE fortune_public_snapshot.checked_at < EXCLUDED.checked_at`, [key, JSON.stringify(safe), safe.checkedAt, safe.expiresAt]);
  }
  async prune(): Promise<void> {
    await this.query(`DELETE FROM fortune_public_snapshot WHERE snapshot_key IN
      (SELECT snapshot_key FROM fortune_public_snapshot WHERE expires_at <= CURRENT_TIMESTAMP
       ORDER BY expires_at LIMIT 1000)`, []);
  }
}
