import { NextRequest } from "next/server";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return forwardToNest({ method: "GET", path: `/authors/${encodeURIComponent(name)}` });
}
