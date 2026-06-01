import { forwardToNest } from "@/lib/server/nest-bridge";
import { getUserId, unauthorized } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { reviewId } = await req.json();
  return forwardToNest({
    method: "POST",
    path: "/me/review-like",
    userId: uid,
    body: { reviewId },
    request: req,
  });
}
