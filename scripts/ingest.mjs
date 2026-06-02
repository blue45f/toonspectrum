// 로컬 카탈로그 ingest — 크롤러를 돌려(또는 --from 파일을 읽어) DB 스냅샷을 채운다.
//
// 서버 런타임(catalog-store)은 부팅 시 catalog_snapshot.isCurrent=1 을 메모리로 로드한다.
// seed를 쓰지 않으므로, 한 번도 ingest하지 않으면 /api/titles·/api/search·/api/explore 가 빈 상태다.
// 이 스크립트는 로컬 개발에서 그 스냅샷을 손쉽게 채우기 위한 도구다(품질 게이트는 건너뛴다 — 로컬 강제 채움).
// 프로덕션은 cron(CATALOG_INGEST_MODE=fixed) 또는 POST /api/catalog/ingest/run(runCatalogIngest)을 사용한다.
//
//   pnpm ingest                     # 기본 소스셋으로 새로 크롤 후 적재
//   pnpm ingest --from out.json     # 미리 크롤해 둔 JSON(crawl.mjs --json) 적재(재크롤 없음)
//   WEBDEX_SOURCE_IDS=all pnpm ingest
import { createClient } from "@libsql/client";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function isTitleLike(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.slug === "string" &&
    typeof item.title === "string" &&
    Array.isArray(item.availability)
  );
}

async function loadPayload() {
  const from = argValue("--from");
  if (from) {
    const raw = readFileSync(path.resolve(ROOT, from), "utf8");
    return JSON.parse(raw);
  }
  const sourceIds =
    process.env.WEBDEX_SOURCE_IDS || "naver-webtoon,naver-series,kakao-webtoon,lezhin";
  console.error(`crawl 시작 (WEBDEX_SOURCE_IDS=${sourceIds}) …`);
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join("scripts", "crawl.mjs"), "--json", "--no-file"],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 600_000,
      // 네이버시리즈 등 대형 소스 포함 시 출력이 수십 MB가 되므로 넉넉히 잡는다.
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, TZ: process.env.TZ ?? "Asia/Seoul", WEBDEX_SOURCE_IDS: sourceIds },
    }
  );
  return JSON.parse(stdout);
}

async function ensureSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS catalog_snapshot (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      sourceVersion TEXT,
      titleCount INTEGER NOT NULL DEFAULT 0,
      isCurrent INTEGER NOT NULL DEFAULT 0,
      snapshot TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_catalog_snapshot_current ON catalog_snapshot(isCurrent, createdAt)"
  );
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_catalog_snapshot_created ON catalog_snapshot(createdAt)"
  );
}

async function main() {
  const payload = await loadPayload();
  const titles = Array.isArray(payload?.titles) ? payload.titles.filter(isTitleLike) : [];
  if (!titles.length) {
    console.error("적재할 유효한 title이 없습니다. (crawler 출력 확인 필요)");
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL ?? "file:./data/webdex.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const db = createClient({ url, ...(authToken ? { authToken } : {}) });

  await ensureSchema(db);

  const snapshotJson = JSON.stringify(titles);
  const id = randomUUID();
  const sourceVersion = payload.sourceVersion ?? `local-ingest/${new Date().toISOString()}`;
  const runHash = createHash("sha256").update(snapshotJson).digest("hex");
  const metadata = JSON.stringify({
    runHash,
    runId: id,
    requestedBy: "local-cli",
    triggeredBy: "ingest.mjs",
    crawler: payload.metadata ?? null,
  });

  // 원자적 승격: 직전 current 내림 → 신규 current 적재.
  await db.batch(
    [
      { sql: "UPDATE catalog_snapshot SET isCurrent = 0 WHERE isCurrent = 1" },
      {
        sql: `INSERT INTO catalog_snapshot
                (id, source, sourceVersion, titleCount, isCurrent, snapshot, metadata, createdAt)
              VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
        args: [id, "local-ingest", sourceVersion, titles.length, snapshotJson, metadata, Date.now()],
      },
    ],
    "write"
  );

  const withCover = titles.filter((t) => t.coverImage).length;
  const sources = payload.metadata?.sources ?? {};
  console.error(
    `적재 완료: ${titles.length}편 (coverImage ${withCover}) · snapshot=${id}\n` +
      `소스: ${JSON.stringify(sources)}\n` +
      `→ 개발 서버를 재시작하면 카탈로그에 반영됩니다 (catalog-store는 부팅 시 로드).`
  );
}

main().catch((error) => {
  console.error("ingest 실패:", error?.message ?? error);
  process.exit(1);
});
