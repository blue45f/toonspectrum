import { and, eq } from "drizzle-orm";
import { db, ratings } from "@/lib/db";
import { getUserId, unauthorized, toDb } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId, value } = await req.json();
  if (!titleId) return Response.json({ error: "titleId 필요" }, { status: 400 });

  if (value == null) {
    await db.delete(ratings).where(and(eq(ratings.userId, uid), eq(ratings.titleId, titleId)));
  } else {
    await db
      .insert(ratings)
      .values({ userId: uid, titleId, value: toDb(Number(value)) })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.titleId],
        set: { value: toDb(Number(value)), updatedAt: new Date() },
      });
  }
  return Response.json({ ok: true });
}
