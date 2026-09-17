// 내 정보(/api/me) 조회·프로필 갱신 전용 ky 헬퍼.
// 공유 클라이언트가 HttpOnly 세션 쿠키와 CSRF 헤더를 처리한다.
import { mergeCurrentSessionProfile } from "@/compat/auth-session-state";
import {
  normalizeCreatorRoleProfile,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { api, toApiError } from "@/infrastructure/api";

export interface MeProfile {
  id: string;
  name: string | null;
  image: string | null;
  avatar: string | null;
  email: string | null;
  bio: string | null;
  creatorRoleProfile: CreatorRoleProfile;
}

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  image?: string | null; // dataURL(webp/png/jpeg) 또는 null(제거). 미포함 시 변경 없음.
  creatorRoleProfile?: CreatorRoleProfile;
}

type MeProfileResponse = Omit<MeProfile, "creatorRoleProfile"> & {
  creatorRoleProfile?: unknown;
};

function normalizeMeProfile(profile: MeProfileResponse): MeProfile {
  return {
    ...profile,
    creatorRoleProfile: normalizeCreatorRoleProfile(profile.creatorRoleProfile),
  };
}

export async function getMyProfile(signal?: AbortSignal): Promise<MeProfile> {
  let data: { profile?: MeProfileResponse } | undefined;
  try {
    data = await api.get<{ profile?: MeProfileResponse }>("/me", { signal });
  } catch (err) {
    throw await toApiError(err, "프로필을 불러오지 못했어요.");
  }
  if (!data?.profile?.id) throw new Error("프로필을 불러오지 못했어요.");
  return normalizeMeProfile(data.profile);
}

// 프로필(name·bio·image·직무) 갱신. 성공 시 갱신된 프로필을 반환.
export async function updateMyProfile(payload: UpdateProfilePayload): Promise<MeProfile> {
  let data: { profile?: MeProfileResponse } | undefined;
  try {
    data = await api.patch<{ profile?: MeProfileResponse }>("/me/profile", payload);
  } catch (err) {
    throw await toApiError(err, "프로필을 저장하지 못했어요.");
  }
  if (!data?.profile) throw new Error("프로필을 저장하지 못했어요.");
  const profile = normalizeMeProfile(data.profile);
  mergeCurrentSessionProfile(profile);
  return profile;
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
