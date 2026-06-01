import { forwardToNest } from "@/lib/server/nest-bridge";
import { getUserId, unauthorized } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId, rating, text, tags, spoiler } = await req.json();
  return forwardToNest({
    method: "POST",
    path: "/me/review",
    userId: uid,
    body: { titleId, rating, text, tags, spoiler },
    request: req,
  });
}

export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId } = await req.json();
  return forwardToNest({
    method: "DELETE",
    path: "/me/review",
    userId: uid,
    body: { titleId },
    request: req,
  });
}
