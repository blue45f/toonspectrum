import { NextRequest } from "next/server";
import { getUserId, unauthorized } from "@/lib/api-helpers";
import { forwardToNest } from "@/lib/server/nest-bridge";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  const { id } = await params;

  return forwardToNest({
    method: "DELETE",
    path: `/admin/campaigns/${id}`,
    userId: uid,
    request: _req,
  });
}
