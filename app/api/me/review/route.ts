import { and, eq } from "drizzle-orm";
import { db, reviews, ratings } from "@/lib/db";
import { getUserId, unauthorized, toDb } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId, rating, text, tags, spoiler } = await req.json();
  if (!titleId || rating == null) return Response.json({ error: "titleId·rating 필요" }, { status: 400 });

  const r = toDb(Number(rating));
  const cleanTags = Array.isArray(tags) ? tags.slice(0, 5).map(String) : [];
  await db
    .insert(reviews)
    .values({ userId: uid, titleId, rating: r, text: String(text ?? ""), tags: cleanTags, spoiler: !!spoiler })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.titleId],
      set: { rating: r, text: String(text ?? ""), tags: cleanTags, spoiler: !!spoiler },
    });
  // 리뷰 평점은 평점 테이블에도 동기화
  await db
    .insert(ratings)
    .values({ userId: uid, titleId, value: r })
    .onConflictDoUpdate({ target: [ratings.userId, ratings.titleId], set: { value: r, updatedAt: new Date() } });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId } = await req.json();
  if (!titleId) return Response.json({ error: "titleId 필요" }, { status: 400 });
  await db.delete(reviews).where(and(eq(reviews.userId, uid), eq(reviews.titleId, titleId)));
  return Response.json({ ok: true });
}
