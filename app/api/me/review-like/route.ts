import { and, eq } from "drizzle-orm";
import { db, reviewLikes } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { reviewId } = await req.json();
  if (!reviewId) return Response.json({ error: "reviewId 필요" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(reviewLikes)
    .where(and(eq(reviewLikes.userId, uid), eq(reviewLikes.reviewId, reviewId)))
    .limit(1);
  if (existing) {
    await db.delete(reviewLikes).where(and(eq(reviewLikes.userId, uid), eq(reviewLikes.reviewId, reviewId)));
    return Response.json({ ok: true, liked: false });
  }
  await db.insert(reviewLikes).values({ userId: uid, reviewId });
  return Response.json({ ok: true, liked: true });
}
