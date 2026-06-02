import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// PostgreSQL(Neon) — node-postgres 드라이버. 로컬 검증은 docker postgres(:55432), 운영/원격은 Neon.
// DATABASE_URL 미설정 시 로컬 docker 컨테이너로 폴백(개발 편의). Neon은 sslmode=require.
const connectionString =
  process.env.DATABASE_URL ?? "postgres://webdex:webdex@127.0.0.1:55432/webdex";
const needsSsl = /neon\.tech|sslmode=require/i.test(connectionString);

const pool = new Pool({
  connectionString,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });

// 기존 libSQL `dbClient.execute()` 호출부 호환 shim.
//  - execute(sqlString) 또는 execute({ sql, args })
//  - libSQL '?' 플레이스홀더 → pg '$1,$2,…' 변환(문자열 리터럴 내 '?'는 없다는 전제; 현 사용처 충족)
//  - 반환 형태도 libSQL과 유사하게 { rows, rowsAffected, columns }
type ExecuteInput = string | { sql: string; args?: unknown[] };

export const dbClient = {
  async execute(input: ExecuteInput) {
    const text = typeof input === "string" ? input : input.sql;
    const args = typeof input === "string" ? [] : (input.args ?? []);
    let i = 0;
    const pgText = text.replace(/\?/g, () => `$${(i += 1)}`);
    const res = await pool.query(pgText, args as unknown[]);
    return {
      rows: res.rows as Record<string, unknown>[],
      rowsAffected: res.rowCount ?? 0,
      columns: res.fields?.map((f) => f.name) ?? [],
    };
  },
};

export const dbPool = pool;
export * from "./schema";
