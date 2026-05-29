import { and, eq } from "drizzle-orm";
import { db, collections, collectionItems } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const body = await req.json();
  const action = body.action;

  if (action === "create") {
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "이름 필요" }, { status: 400 });
    const [row] = await db
      .insert(collections)
      .values({ userId: uid, name, emoji: String(body.emoji ?? "📚") })
      .returning({ id: collections.id });
    return Response.json({ ok: true, id: row.id });
  }

  if (action === "delete") {
    await db.delete(collections).where(and(eq(collections.id, String(body.id)), eq(collections.userId, uid)));
    return Response.json({ ok: true });
  }

  if (action === "toggle") {
    const id = String(body.id);
    const titleId = String(body.titleId);
    // 소유 확인
    const [own] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, uid)))
      .limit(1);
    if (!own) return Response.json({ error: "권한 없음" }, { status: 403 });
    const [exists] = await db
      .select()
      .from(collectionItems)
      .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)))
      .limit(1);
    if (exists) {
      await db.delete(collectionItems).where(and(eq(collectionItems.collectionId, id), eq(collectionItems.titleId, titleId)));
    } else {
      await db.insert(collectionItems).values({ collectionId: id, titleId });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "알 수 없는 action" }, { status: 400 });
}
