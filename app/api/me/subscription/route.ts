import { and, eq } from "drizzle-orm";
import { db, subscriptions } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/api-helpers";

// 토글
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId } = await req.json();
  if (!titleId) return Response.json({ error: "titleId 필요" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, uid), eq(subscriptions.titleId, titleId)))
    .limit(1);

  if (existing) {
    await db.delete(subscriptions).where(and(eq(subscriptions.userId, uid), eq(subscriptions.titleId, titleId)));
    return Response.json({ ok: true, subscribed: false });
  }
  await db.insert(subscriptions).values({ userId: uid, titleId });
  return Response.json({ ok: true, subscribed: true });
}
