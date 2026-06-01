import { NextRequest } from "next/server";
import { getUserId, unauthorized } from "@/lib/api-helpers";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return unauthorized();

  return forwardToNest({
    method: "GET",
    path: `/admin/plans${req.nextUrl.search}`,
    userId: uid,
    request: req,
  });
}
export async function POST(req: NextRequest) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const body = await req.json();

  return forwardToNest({
    method: "POST",
    path: "/admin/plans",
    userId: uid,
    body,
    request: req,
  });
}
