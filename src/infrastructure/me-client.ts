// 내 정보(/api/me) 프로필 갱신 전용 ky 헬퍼.
// 인증은 기존 세션 스킴(localStorage → x-user-id 헤더)을 재사용한다(creator-client 와 동일).
// 공유 ky 클라이언트(api)의 beforeRequest 훅이 x-user-id 를 자동 주입한다.
import { api, toApiError } from "@/src/infrastructure/api";

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

// 프로필(name·bio·image) 갱신. 성공 시 갱신된 프로필을 반환.
export async function updateMyProfile(payload: UpdateProfilePayload): Promise<MeProfile> {
  let data: { profile?: MeProfile } | undefined;
  try {
    data = await api.patch<{ profile?: MeProfile }>("/me/profile", payload);
  } catch (err) {
    throw await toApiError(err, "프로필을 저장하지 못했어요.");
  }
  if (!data?.profile) throw new Error("프로필을 저장하지 못했어요.");
  return data.profile;
}

export async function deleteMyAccount(): Promise<{ ok: true; deletedAt: string }> {
  let data: { ok?: boolean; deletedAt?: string } | undefined;
  try {
    data = await api.delete<{ ok?: boolean; deletedAt?: string }>("/me/account");
  } catch (err) {
    throw await toApiError(err, "계정을 탈퇴 처리하지 못했어요.");
  }
  if (!data?.ok || !data.deletedAt) throw new Error("계정을 탈퇴 처리하지 못했어요.");
  return { ok: true, deletedAt: data.deletedAt };
}
