import { Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  normalizePgConnectionStringForTls,
  observePgPoolIdleErrors,
  resolvePgPoolOptions,
} from "./pg-connection";
import * as schema from "./schema";

// PostgreSQL(Neon) — node-postgres 드라이버. 로컬 검증은 docker postgres(:55432), 운영/원격은 Neon.
// pg v9의 sslmode=require 의미 변경에 기대지 않고 원격은 verify-full로 정규화한다.
const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DATABASE_URL environment variable is required. Please define it in .env.local");
}
const connectionString = normalizePgConnectionStringForTls(rawConnectionString);

export { resolvePgPoolOptions } from "./pg-connection";

const pool = new Pool({
  connectionString,
  ...resolvePgPoolOptions(),
});
observePgPoolIdleErrors(pool, {
  connectionString,
  logger: new Logger("PostgresPool"),
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
export * from "./creator-asset-object-storage.schema";
export * from "./creator-asset-platform.schema";
export * from "./creator-asset-processing.schema";
export * from "./creator-asset-rights-evidence.schema";
