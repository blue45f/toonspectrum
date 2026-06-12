// catalog_snapshot 정리 — 카탈로그 파일 전용화 이후 DB에 잔존하는 대형 스냅샷 행을 삭제한다.
//
// 배경: 행당 ~22MB(24k편 Title[] JSON) 스냅샷을 읽고 쓰던 구조가 Neon 무료 전송 쿼터를 소진시켰다.
// 이제 카탈로그는 catalog.json.gz 파일 전용이라 이 테이블의 행은 죽은 무게다 — 지워서
// 스토리지·백업·향후 실수 조회(전송) 리스크를 없앤다. catalog_ingest_run(수 KB 이력)은 건드리지 않는다.
//
// 전송량: DELETE 는 서버 측에서 행을 지울 뿐 행 본문을 클라이언트로 보내지 않으므로
// 이 스크립트의 왕복은 쿼리 텍스트 + 카운트 몇 줄(수 KB)에 그친다 — Neon 전송 쿼터에 안전.
//
//   node scripts/db-prune-snapshots.mjs                # catalog_snapshot 모든 행 삭제(파일 전용 운영)
//   node scripts/db-prune-snapshots.mjs --keep-current # isCurrent=true 최신 1행만 보존(레거시 롤백 대비)
import pg from "pg";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// 레포 루트 .env.local 로드(DATABASE_URL — Neon 또는 로컬 docker 폴백).
if (existsSync(path.join(ROOT, ".env.local"))) {
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // 무시
  }
}

const keepCurrent = process.argv.includes("--keep-current");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://webdex:webdex@127.0.0.1:55432/webdex";
  const needsSsl = /neon\.tech|sslmode=require/i.test(url);
  const client = new pg.Client({
    connectionString: url,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();

  try {
    // 테이블이 아예 없으면(신규 DB·이미 정리됨) 할 일 없음.
    const { rows: reg } = await client.query(`SELECT to_regclass('public.catalog_snapshot') AS t`);
    if (!reg[0]?.t) {
      console.error("catalog_snapshot 테이블이 없습니다 — 정리할 것이 없습니다.");
      return;
    }

    // 정리 전 현황(카운트/총 크기) — 집계값만 받으므로 전송량 미미.
    const { rows: before } = await client.query(
      `SELECT count(*)::int AS rows,
              COALESCE(pg_size_pretty(pg_total_relation_size('public.catalog_snapshot')), '0') AS size
         FROM catalog_snapshot`
    );
    console.error(`정리 전: ${before[0].rows}행 · 테이블 크기 ${before[0].size}`);

    let deleted = 0;
    if (keepCurrent) {
      // 레거시 롤백(WEBDEX_CATALOG_FORCE_DB=1) 대비 — current 최신 1행만 남긴다.
      const res = await client.query(
        `DELETE FROM catalog_snapshot
          WHERE id NOT IN (
            SELECT id FROM catalog_snapshot
             WHERE "isCurrent" = true
             ORDER BY "createdAt" DESC
             LIMIT 1
          )`
      );
      deleted = res.rowCount ?? 0;
    } else {
      const res = await client.query(`DELETE FROM catalog_snapshot`);
      deleted = res.rowCount ?? 0;
    }

    const { rows: after } = await client.query(`SELECT count(*)::int AS rows FROM catalog_snapshot`);
    console.error(
      `삭제 완료: ${deleted}행 제거, ${after[0].rows}행 보존${keepCurrent ? " (--keep-current)" : ""}.\n` +
        `참고: 공간 회수는 autovacuum 이 처리합니다(Neon 관리). 카탈로그는 catalog.json.gz 파일이 운영 소스입니다.`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("db-prune-snapshots 실패:", error?.message ?? error);
  process.exit(1);
});
