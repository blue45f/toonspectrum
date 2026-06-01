import { NextRequest } from "next/server";
import { getUserId } from "@/lib/api-helpers";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = await getUserId();
  return forwardToNest({
    method: "GET",
    path: `/community/boards${req.nextUrl.search}`,
    userId: uid,
    request: req,
  });
}
