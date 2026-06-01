import { NextRequest } from "next/server";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return forwardToNest({ method: "GET", path: "/calendar", request: req });
}
