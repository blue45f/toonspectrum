import { NextRequest } from "next/server";
import { getUserId, unauthorized } from "@/lib/api-helpers";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardToNest({
    method: "GET",
    path: `/community/posts/${id}/replies`,
    userId: await getUserId(),
    request: _req,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { id } = await params;
  const body = await req.json();
  return forwardToNest({
    method: "POST",
    path: `/community/posts/${id}/replies`,
    userId: uid,
    body,
    request: req,
  });
}
