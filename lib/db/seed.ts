/**
 * 샘플 시드 — 기능 점검용 최소 데모 데이터.
 * 동적 데이터(계정·평점·리뷰·컬렉션·창작)만 채운다(카탈로그는 파일 기반).
 * 재실행 안전(onConflictDoNothing). 실행: `pnpm db:seed` (또는 DATABASE_URL=... tsx lib/db/seed.ts)
 */
import { existsSync } from "node:fs";

async function main() {
  // lib/db 는 모듈 로드 시 DATABASE_URL 을 읽으므로 import 전에 .env.local 주입.
  if (!process.env.DATABASE_URL && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const { db } = await import("./index");
  const s = await import("./schema");

  const userId = "seed-user-001";
  const titleId = "demo-webtoon";
  const collectionId = "seed-collection-001";

  await db
    .insert(s.users)
    .values({ id: userId, name: "샘플 독자", email: "sample-reader@toonspectrum.dev", role: "user", avatar: "#7c3aed", bio: "시드 샘플 계정(기능 점검용)" })
    .onConflictDoNothing();

  await db
    .insert(s.creatorProfiles)
    .values({ userId, displayName: "샘플 창작자", profile: "시드로 생성된 데모 창작자 프로필", isVerifiedCreator: true })
    .onConflictDoNothing();

  await db
    .insert(s.creatorWorks)
    .values({ userId, title: "데모 컷툰: 첫 화", description: "시드 샘플 창작물", format: "cuttoon", status: "published", tags: ["데모", "시드"] })
    .onConflictDoNothing();

  await db.insert(s.ratings).values({ userId, titleId, value: 45 }).onConflictDoNothing();
  await db
    .insert(s.reviews)
    .values({ userId, titleId, rating: 45, text: "시드 샘플 리뷰 — 기능 점검용 데모 데이터입니다.", tags: ["스토리"] })
    .onConflictDoNothing();
  await db.insert(s.reads).values({ userId, titleId, state: "reading" }).onConflictDoNothing();
  await db.insert(s.subscriptions).values({ userId, titleId }).onConflictDoNothing();

  await db.insert(s.collections).values({ id: collectionId, userId, name: "내 인생작", emoji: "⭐" }).onConflictDoNothing();
  await db.insert(s.collectionItems).values({ collectionId, titleId }).onConflictDoNothing();

  console.log("✓ seed done (user/creator/work/rating/review/read/subscription/collection)");
  process.exit(0);
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
