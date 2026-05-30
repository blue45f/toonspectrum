import { eq, desc, inArray, sql } from "drizzle-orm";
import { db, reviews, users, reviewLikes } from "@/lib/db";
import { fromDb } from "@/lib/api-helpers";

// 공개: 특정 작품의 DB 리뷰 (사용자 간 공유) + 좋아요 수
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      rating: reviews.rating,
      text: reviews.text,
      tags: reviews.tags,
      spoiler: reviews.spoiler,
      createdAt: reviews.createdAt,
      author: users.name,
      avatar: users.avatar,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.titleId, id))
    .orderBy(desc(reviews.createdAt));

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ reviewId: reviewLikes.reviewId, c: sql<number>`count(*)`.as("c") })
        .from(reviewLikes)
        .where(inArray(reviewLikes.reviewId, ids))
        .groupBy(reviewLikes.reviewId)
    : [];
  const lc: Record<string, number> = Object.fromEntries(counts.map((x) => [x.reviewId, Number(x.c)]));

  return Response.json(
    rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      author: r.author ?? "익명",
      avatar: r.avatar ?? "#7c5cfc",
      rating: fromDb(r.rating),
      text: r.text,
      tags: r.tags ?? [],
      spoiler: r.spoiler,
      likes: lc[r.id] ?? 0,
      createdAt: new Date(r.createdAt ?? Date.now()).toISOString(),
    }))
  );
}
