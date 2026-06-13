import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// PostgreSQL(Neon) — node-postgres 드라이버. 로컬 검증은 docker postgres(:55432), 운영/원격은 Neon.
// DATABASE_URL 미설정 시 로컬 docker 컨테이너로 폴백(개발 편의). Neon은 sslmode=require.
const connectionString =
  process.env.DATABASE_URL ?? "postgres://webdex:webdex@127.0.0.1:55432/webdex";
const needsSsl = /neon\.tech|sslmode=require/i.test(connectionString);

type EnvLike = Partial<Record<string, string | undefined>>;

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  // 빈 문자열(.env 의 `KEY=`)은 미설정으로 취급 — Number("")===0 이 최소값으로 클램프되는 것을 방지.
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

// ── 풀 슬림화: Neon 비용(컴퓨트·전송) 가드 ──
// 카탈로그가 파일 전용으로 빠진 뒤 DB 는 동적 데이터(리뷰·커뮤니티·계정·창작)만 다룬다 — 동시 연결
// 수요가 작다. Neon 무료 플랜은 '연결이 모두 끊긴 유휴' 상태에서만 컴퓨트가 autosuspend 되므로,
// 유휴 연결을 빨리 닫을수록 컴퓨트 시간(과금/쿼터)이 절약된다.
//  - max 3 (WEBDEX_PG_POOL_MAX): 인스턴스 1대 기준 충분. 연결 폭주로 인한 Neon 커넥션 포화 방지.
//  - idleTimeoutMillis 10s (WEBDEX_PG_IDLE_MS): 유휴 커넥션을 빨리 반납 → Neon autosuspend 유도.
//  - connectionTimeoutMillis 10s: autosuspend 해제(cold start) 대기는 허용하되 무한 대기는 차단.
//  - allowExitOnIdle: 유휴 풀이 이벤트 루프를 잡지 않아 CLI/배치 프로세스가 연결을 물고 남지 않는다.
export function resolvePgPoolOptions(env: EnvLike = process.env): {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle: boolean;
} {
  return {
    max: boundedInt(env.WEBDEX_PG_POOL_MAX, 3, 1, 50),
    idleTimeoutMillis: boundedInt(env.WEBDEX_PG_IDLE_MS, 10_000, 1_000, 600_000),
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
}

const pool = new Pool({
  connectionString,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  ...resolvePgPoolOptions(),
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
