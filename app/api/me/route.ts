import { eq, inArray } from "drizzle-orm";
import { db, users, ratings, reads, subscriptions, reviews, reviewLikes, collections, collectionItems } from "@/lib/db";
import { getUserId, unauthorized, fromDb } from "@/lib/api-helpers";

// 로그인 사용자의 모든 데이터 (클라이언트 하이드레이션용)
export async function GET() {
  const uid = await getUserId();
  if (!uid) return unauthorized();

  const [me] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  const [rt, rd, sub, rv, lk, cols] = await Promise.all([
    db.select().from(ratings).where(eq(ratings.userId, uid)),
    db.select().from(reads).where(eq(reads.userId, uid)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, uid)),
    db.select().from(reviews).where(eq(reviews.userId, uid)),
    db.select().from(reviewLikes).where(eq(reviewLikes.userId, uid)),
    db.select().from(collections).where(eq(collections.userId, uid)),
  ]);

  // 컬렉션 아이템은 이 사용자의 컬렉션 id로 한정해 조회(과거: 전체 테이블 스캔 후 JS 필터)
  const colIds = cols.map((c) => c.id);
  const colItems = colIds.length
    ? await db.select().from(collectionItems).where(inArray(collectionItems.collectionId, colIds))
    : [];

  const itemsByCol: Record<string, string[]> = {};
  for (const it of colItems) {
    (itemsByCol[it.collectionId] ??= []).push(it.titleId);
  }

  return Response.json({
    profile: { id: me?.id, name: me?.name, avatar: me?.avatar, email: me?.email, bio: me?.bio },
    ratings: Object.fromEntries(rt.map((r) => [r.titleId, fromDb(r.value)])),
    reads: Object.fromEntries(rd.map((r) => [r.titleId, r.state])),
    subscriptions: Object.fromEntries(sub.map((s) => [s.titleId, true])),
    reviews: Object.fromEntries(
      rv.map((r) => [
        r.titleId,
        { rating: fromDb(r.rating), text: r.text, tags: r.tags, spoiler: r.spoiler, createdAt: new Date(r.createdAt ?? Date.now()).toISOString() },
      ])
    ),
    likedReviews: Object.fromEntries(lk.map((l) => [l.reviewId, true])),
    collections: cols.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      titleIds: itemsByCol[c.id] ?? [],
      createdAt: new Date(c.createdAt ?? Date.now()).toISOString(),
    })),
  });
}
