import { getUserId, unauthorized } from "@/lib/api-helpers";
import { forwardToNest } from "@/lib/server/nest-bridge";

// 로그인 사용자의 모든 데이터 (클라이언트 하이드레이션용)
export async function GET() {
  const uid = await getUserId();
  if (!uid) return unauthorized();
  return forwardToNest({ method: "GET", path: "/me", userId: uid });
}
