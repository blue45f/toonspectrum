// 내 정보(/api/me) 프로필 갱신 전용 fetch 헬퍼.
// 인증은 기존 세션 스킴(localStorage → x-user-id 헤더)을 재사용한다(creator-client 와 동일).
import { getAuthUserId } from "@/src/compat/auth-session";
import { resolveApiError, safeParseJson } from "@/lib/http-safe";

export interface MeProfile {
  id: string;
  name: string | null;
  image: string | null;
  avatar: string | null;
  email: string | null;
  bio: string | null;
}

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  image?: string | null; // dataURL(webp/png/jpeg) 또는 null(제거). 미포함 시 변경 없음.
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const userId = getAuthUserId();
  if (userId) headers["x-user-id"] = userId;
  return headers;
}

// 프로필(name·bio·image) 갱신. 성공 시 갱신된 프로필을 반환.
export async function updateMyProfile(payload: UpdateProfilePayload): Promise<MeProfile> {
  const res = await fetch("/api/me/profile", {
    method: "PATCH",
    cache: "no-store",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await safeParseJson<{ profile?: MeProfile }>(res);
  if (!res.ok) throw new Error(resolveApiError(data, `프로필을 저장하지 못했어요. (${res.status})`));
  if (!data?.profile) throw new Error("프로필을 저장하지 못했어요.");
  return data.profile;
}
