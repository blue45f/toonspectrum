import { forwardToNest } from "@/lib/server/nest-bridge";
import { getUserId, unauthorized } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId, value } = await req.json();
  return forwardToNest({
    method: "POST",
    path: "/me/rating",
    userId: uid,
    body: { titleId, value },
    request: req,
  });
}
