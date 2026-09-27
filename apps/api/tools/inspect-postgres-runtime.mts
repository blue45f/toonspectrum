import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { normalizePgConnectionStringForTls } from "../src/platform/database/pg-connection";

type DiagnosticClient = { query(text: string): Promise<{ rows: Record<string, unknown>[] }> };

/** 쿼리 본문·계정·세션 식별자 없이 현재 DB의 집계 메타데이터만 반환한다. */
export async function inspectPostgresRuntime(client: DiagnosticClient) {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const mode = await client.query("SHOW transaction_read_only");
    if (mode.rows[0]?.transaction_read_only !== "on") throw new Error("읽기 전용 트랜잭션을 확인하지 못했습니다.");
    const activity = await client.query(`SELECT
      count(*)::int AS connections,
      count(*) FILTER (WHERE state = 'active')::int AS active,
      count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_transaction,
      count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0)::int AS blocked,
      count(*) FILTER (WHERE state IS NULL)::int AS visibility_limited,
      coalesce(max(extract(epoch FROM (now() - xact_start))), 0)::float AS oldest_transaction_seconds
      FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`);
    const database = await client.query(`SELECT numbackends, xact_commit, xact_rollback,
      deadlocks, temp_files, temp_bytes, conflicts,
      pg_database_size(current_database())::text AS size_bytes
      FROM pg_stat_database WHERE datname = current_database()`);
    const indexes = await client.query(`SELECT count(*)::int AS invalid_indexes
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT i.indisvalid AND n.nspname NOT IN ('pg_catalog', 'information_schema')`);
    return { readOnly: true, activity: activity.rows[0], database: database.rows[0], indexes: indexes.rows[0] };
  } finally {
    await client.query("ROLLBACK");
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => !["--execute-read-only", "--dry-run", "--help"].includes(argument))) {
    throw new Error("지원하지 않는 옵션입니다. --dry-run 또는 --execute-read-only를 사용하세요.");
  }
  if (!args.includes("--execute-read-only") || args.includes("--dry-run") || args.includes("--help")) {
    console.log(JSON.stringify({ mode: "dry-run", connects: false,
      checks: ["connection and lock aggregates", "transaction age", "database counters", "invalid indexes"],
      instruction: "대상 DB를 확인하고 DATABASE_URL을 안전하게 주입한 뒤 --execute-read-only로 실행하세요." }));
    return;
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL을 안전하게 주입하세요. 명령행 인자에는 넣지 마세요.");
  const client = new Client({ connectionString: normalizePgConnectionStringForTls(raw),
    connectionTimeoutMillis: 10_000, query_timeout: 10_000,
    application_name: "toonstudio-readonly-diagnostics" });
  try {
    await client.connect();
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...await inspectPostgresRuntime(client) }, null, 2));
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("DB 읽기 전용 진단에 실패했습니다. 대상·접근 권한·TLS·연결 상태를 확인하세요. 자격증명과 원본 오류는 출력하지 않습니다.");
    process.exitCode = 1;
  });
}
