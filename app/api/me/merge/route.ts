import { eq } from "drizzle-orm";
import {
  db,
  ratings,
  reads,
  subscriptions,
  reviews,
  reviewLikes,
  collections,
  collectionItems,
} from "@/lib/db";
import { getUserId, unauthorized, toDb } from "@/lib/api-helpers";
import { loadMe } from "@/lib/server/me";

// 게스트(로컬) 상태를 로그인 계정으로 1회 병합.
// 충돌 시 서버 우선(onConflictDoNothing) → 로컬 전용 항목만 추가되어 데이터 손실 없음.
// 멱등: 이미 동기화된 상태로 다시 호출해도 모두 무시되고 통합 결과만 반환.
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const body = await req.json().catch(() => ({}));

  const ratingRows = Object.entries(body.ratings ?? {})
    .filter(([, v]) => typeof v === "number")
    .map(([titleId, v]) => ({ userId: uid, titleId, value: toDb(v as number) }));
  if (ratingRows.length) await db.insert(ratings).values(ratingRows).onConflictDoNothing();

  const readRows = Object.entries(body.reads ?? {})
    .filter(([, st]) => typeof st === "string")
    .map(([titleId, st]) => ({ userId: uid, titleId, state: st as string }));
  if (readRows.length) await db.insert(reads).values(readRows).onConflictDoNothing();

  const subRows = Object.entries(body.subscriptions ?? {})
    .filter(([, on]) => on)
    .map(([titleId]) => ({ userId: uid, titleId }));
  if (subRows.length) await db.insert(subscriptions).values(subRows).onConflictDoNothing();

  const reviewRows = Object.entries(body.reviews ?? {})
    .filter(([, x]) => x && typeof x === "object")
    .map(([titleId, x]) => {
      const o = x as { rating?: number; text?: string; tags?: string[]; spoiler?: boolean };
      return {
        userId: uid,
        titleId,
        rating: toDb(Number(o.rating) || 0),
        text: String(o.text ?? ""),
        tags: Array.isArray(o.tags) ? o.tags : [],
        spoiler: !!o.spoiler,
      };
    });
  if (reviewRows.length) await db.insert(reviews).values(reviewRows).onConflictDoNothing();

  const likeRows = Object.entries(body.likedReviews ?? {})
    .filter(([, on]) => on)
    .map(([reviewId]) => ({ userId: uid, reviewId }));
  if (likeRows.length) await db.insert(reviewLikes).values(likeRows).onConflictDoNothing();

  // 컬렉션 — 이름 기준 매칭. 서버에 없는 게스트 컬렉션은 생성, 같은 이름이면 아이템만 합침.
  // 비어있는 컬렉션(시드 포함)은 보존할 내용이 없으므로 건너뜀.
  const cols = Array.isArray(body.collections) ? body.collections : [];
  if (cols.length) {
    const serverCols = await db.select().from(collections).where(eq(collections.userId, uid));
    const byName = new Map(serverCols.map((c) => [c.name, c.id]));
    for (const c of cols) {
      const name = String(c?.name ?? "").trim();
      const titleIds: string[] = Array.isArray(c?.titleIds) ? c.titleIds.map(String) : [];
      if (!name || !titleIds.length) continue;
      let colId = byName.get(name);
      if (!colId) {
        const [row] = await db
          .insert(collections)
          .values({ userId: uid, name, emoji: String(c?.emoji ?? "📚") })
          .returning({ id: collections.id });
        colId = row.id;
        byName.set(name, colId);
      }
      await db
        .insert(collectionItems)
        .values(titleIds.map((titleId) => ({ collectionId: colId as string, titleId })))
        .onConflictDoNothing();
    }
  }

  return Response.json(await loadMe(uid));
}
