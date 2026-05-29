import { and, eq } from "drizzle-orm";
import { db, reads } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/api-helpers";

const STATES = ["want", "reading", "done", "dropped"];

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId, state } = await req.json();
  if (!titleId) return Response.json({ error: "titleId 필요" }, { status: 400 });

  if (state == null) {
    await db.delete(reads).where(and(eq(reads.userId, uid), eq(reads.titleId, titleId)));
  } else if (STATES.includes(state)) {
    await db
      .insert(reads)
      .values({ userId: uid, titleId, state })
      .onConflictDoUpdate({ target: [reads.userId, reads.titleId], set: { state } });
  } else {
    return Response.json({ error: "잘못된 state" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
