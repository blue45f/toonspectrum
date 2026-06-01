import { NextRequest } from "next/server";
import { getUserId, unauthorized } from "@/lib/api-helpers";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return unauthorized();

  return forwardToNest({
    method: "GET",
    path: `/admin/dashboard${req.nextUrl.search}`,
    userId: uid,
    request: req,
  });
}
