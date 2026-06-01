import { NextRequest } from "next/server";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  return forwardToNest({ method: "POST", path: "/recommend", body, request: req });
}
