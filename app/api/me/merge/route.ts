import { forwardToNest } from "@/lib/server/nest-bridge";
import { getUserId, unauthorized } from "@/lib/api-helpers";
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const body = await req.json().catch(() => ({}));
  return forwardToNest({
    method: "POST",
    path: "/me/merge",
    userId: uid,
    body,
    request: req,
  });
}
