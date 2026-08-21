/**
 * 창작 기능 QA가 남긴 예약 계정(`test-user-*`)을 정리한다.
 *
 * 기본 명령은 항상 dry-run이다. 실제 삭제는 명시적인 확인 플래그가 필요하고, 원격 DB에서는
 * 추가로 `--allow-remote`를 지정해야 한다. `seed-*`는 로컬 데모 데이터이므로 대상이 아니다.
 *
 *   pnpm db:cleanup-creator-garbage
 *   pnpm db:cleanup-creator-garbage:delete
 *   pnpm tsx scripts/cleanup-creator-garbage.ts --confirm-test-users --allow-remote
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

export const CREATOR_QA_USER_ID_PREFIX = "test-user-" as const;

export interface CleanupArguments {
  mode: "dry-run" | "delete";
  allowRemote: boolean;
}

export function parseCleanupArguments(args: readonly string[]): CleanupArguments {
  const dryRun = args.includes("--dry-run");
  const confirmed = args.includes("--confirm-test-users");
  const allowRemote = args.includes("--allow-remote");

  if (dryRun && confirmed) {
    throw new Error("--dry-run과 --confirm-test-users는 함께 사용할 수 없습니다.");
  }
  if (!dryRun && !confirmed) {
    throw new Error(
      "[안전] --dry-run 또는 --confirm-test-users가 필요합니다. 일반 확인 플래그만으로는 삭제하지 않습니다."
    );
  }
  return { mode: confirmed ? "delete" : "dry-run", allowRemote };
}

export function isLocalDatabaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL 형식이 올바르지 않습니다.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL은 PostgreSQL 연결 문자열이어야 합니다.");
  }
  const hostname = url.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "host.docker.internal"
  );
}

function qaUserFilter(column: SQLWrapper): SQL {
  return sql`coalesce(${column}, '') LIKE ${`${CREATOR_QA_USER_ID_PREFIX}%`}`;
}

function loadLocalEnvironment(root: string): void {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    throw new Error(".env.local을 읽지 못했습니다.");
  }
}

function countOf(row: { count?: unknown } | undefined): number {
  const count = Number(row?.count ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export async function runCreatorQaCleanup(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseCleanupArguments(args);
  loadLocalEnvironment(process.cwd());

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL이 없습니다.");
  const localDatabase = isLocalDatabaseUrl(databaseUrl);
  if (options.mode === "delete" && !localDatabase && !options.allowRemote) {
    throw new Error(
      "[안전] 원격 DB 삭제를 차단했습니다. 대상을 다시 확인한 뒤 --allow-remote를 명시해 주세요."
    );
  }

  // apps/api/src/db는 모듈 로드 시 DATABASE_URL을 읽으므로 환경 주입과 안전 검증 뒤에만 동적 import한다.
  const {
    creatorAssets,
    creatorFollows,
    creatorProfiles,
    creatorSeries,
    creatorWorkComments,
    creatorWorkLikes,
    creatorWorks,
    db,
    dbPool,
    users,
  } = await import("../apps/api/src/db");

  try {
    const [
      [usersRow],
      [worksRow],
      [seriesRow],
      [assetsRow],
      [profilesRow],
      [likesRow],
      [commentsRow],
      [followsRow],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(qaUserFilter(users.id)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatorWorks).where(qaUserFilter(creatorWorks.userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatorSeries).where(qaUserFilter(creatorSeries.userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatorAssets).where(qaUserFilter(creatorAssets.userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatorProfiles).where(qaUserFilter(creatorProfiles.userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatorWorkLikes).where(qaUserFilter(creatorWorkLikes.userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(creatorWorkComments).where(qaUserFilter(creatorWorkComments.userId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(creatorFollows)
        .where(or(qaUserFilter(creatorFollows.followerId), qaUserFilter(creatorFollows.creatorId))),
    ]);

    const targetUsers = countOf(usersRow);
    console.log(`실행 모드: ${options.mode === "dry-run" ? "DRY-RUN" : "DELETE"} · DB: ${localDatabase ? "local" : "remote"}`);
    console.log(`대상 QA 사용자: ${targetUsers}개`);
    console.log(
      `연결된 창작 데이터: 작품 ${countOf(worksRow)} · 시리즈 ${countOf(seriesRow)} · 에셋 ${countOf(assetsRow)} · 프로필 ${countOf(profilesRow)}`
    );
    console.log(
      `연결된 활동 데이터: 좋아요 ${countOf(likesRow)} · 댓글 ${countOf(commentsRow)} · 팔로우 관계 ${countOf(followsRow)}`
    );
    console.log("참고: 사용자 삭제 시 외래키로 연결된 계정·세션·커뮤니티 등 비창작 QA 데이터도 함께 삭제됩니다.");

    if (options.mode === "dry-run") {
      console.log("DRY-RUN: 삭제를 수행하지 않았습니다.");
      return;
    }
    if (targetUsers === 0) {
      console.log("삭제할 QA 사용자가 없습니다.");
      return;
    }

    // 사용자 FK의 ON DELETE CASCADE/SET NULL을 단일 transaction에서 적용한다. 수동으로 일부 테이블만
    // 지우면 새로 추가된 종속 테이블을 빠뜨릴 수 있어 사용자 행을 정본 삭제 지점으로 삼는다.
    await db.transaction(async (tx) => {
      await tx.delete(users).where(qaUserFilter(users.id));
    });

    const [remainingRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(qaUserFilter(users.id));
    const remaining = countOf(remainingRow);
    if (remaining !== 0) {
      throw new Error(`정리 후에도 QA 사용자가 ${remaining}개 남아 transaction 결과를 확인해야 합니다.`);
    }
    console.log(`삭제 완료: QA 사용자 ${targetUsers}개와 연결 데이터를 정리했습니다.`);
  } finally {
    await dbPool.end();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(path.resolve(entry)).href === import.meta.url);
}

if (isDirectExecution()) {
  runCreatorQaCleanup().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error(`creator QA cleanup failed: ${message}`);
    process.exitCode = 1;
  });
}
