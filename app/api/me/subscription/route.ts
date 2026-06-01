import { forwardToNest } from "@/lib/server/nest-bridge";
import { getUserId, unauthorized } from "@/lib/api-helpers";

// 토글
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { titleId } = await req.json();
  return forwardToNest({
    method: "POST",
    path: "/me/subscription",
    userId: uid,
    body: { titleId },
    request: req,
  });
}
