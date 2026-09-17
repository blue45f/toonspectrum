// 내 정보(/api/me) 조회·프로필 갱신 전용 ky 헬퍼.
// 공유 클라이언트가 HttpOnly 세션 쿠키와 CSRF 헤더를 처리한다.
import {
  getAuthSession,
  mergeCurrentSessionProfile,
} from "@/compat/auth-session-state";
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
type ProfileListener = (profile: MeProfile | null) => void;

const PROFILE_CHANNEL_NAME = "toonspectrum:me-profile:v1";
let cachedProfile: MeProfile | null = null;
let inFlightProfile: Promise<MeProfile> | null = null;
let profileChannel: BroadcastChannel | null = null;
let channelInitialized = false;
const profileListeners = new Set<ProfileListener>();

function normalizeMeProfile(profile: MeProfileResponse): MeProfile {
  return {
    ...profile,
    creatorRoleProfile: normalizeCreatorRoleProfile(profile.creatorRoleProfile),
  };
}

function currentSessionUserId(): string | null {
  return getAuthSession()?.user.id ?? null;
}

function notifyProfileListeners(profile: MeProfile | null): void {
  for (const listener of profileListeners) listener(profile);
}

function ensureProfileChannel(): void {
  if (channelInitialized || typeof BroadcastChannel === "undefined") return;
  channelInitialized = true;
  profileChannel = new BroadcastChannel(PROFILE_CHANNEL_NAME);
  profileChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const value = event.data;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (record.type === "invalidate") {
      cachedProfile = null;
      inFlightProfile = null;
      notifyProfileListeners(null);
      return;
    }
    if (record.type !== "profile") return;
    const candidate = record.profile;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const normalized = normalizeMeProfile(candidate as MeProfileResponse);
    const sessionUserId = currentSessionUserId();
    if (sessionUserId && normalized.id !== sessionUserId) return;
    cachedProfile = normalized;
    mergeCurrentSessionProfile(normalized);
    notifyProfileListeners(normalized);
  });
}

function commitProfile(profile: MeProfile, broadcast: boolean): MeProfile {
  cachedProfile = profile;
  mergeCurrentSessionProfile(profile);
  notifyProfileListeners(profile);
  if (broadcast) {
    ensureProfileChannel();
    try {
      profileChannel?.postMessage({ type: "profile", profile });
    } catch {
      // Profile cache synchronization is an optimization; the server remains authoritative.
    }
  }
  return profile;
}

export function subscribeMyProfile(listener: ProfileListener): () => void {
  ensureProfileChannel();
  profileListeners.add(listener);
  return () => profileListeners.delete(listener);
}

export function getCachedMyProfile(): MeProfile | null {
  const sessionUserId = currentSessionUserId();
  if (cachedProfile && sessionUserId && cachedProfile.id !== sessionUserId) {
    cachedProfile = null;
  }
  return cachedProfile;
}

export function invalidateMyProfileCache(options?: {
  readonly broadcast?: boolean;
}): void {
  cachedProfile = null;
  inFlightProfile = null;
  notifyProfileListeners(null);
  if (options?.broadcast !== false) {
    ensureProfileChannel();
    try {
      profileChannel?.postMessage({ type: "invalidate" });
    } catch {
      // Other tabs will refresh naturally on their next profile request.
    }
  }
}

export async function getMyProfile(
  signal?: AbortSignal,
  force = false,
): Promise<MeProfile> {
  ensureProfileChannel();
  const cached = getCachedMyProfile();
  if (!force && cached) return cached;
  if (!force && !signal && inFlightProfile) return inFlightProfile;

  const request = (async () => {
    let data: { profile?: MeProfileResponse } | undefined;
    try {
      data = await api.get<{ profile?: MeProfileResponse }>("/me", { signal });
    } catch (err) {
      throw await toApiError(err, "프로필을 불러오지 못했어요.");
    }
    if (!data?.profile?.id) throw new Error("프로필을 불러오지 못했어요.");
    return commitProfile(normalizeMeProfile(data.profile), false);
  })();

  if (!signal) inFlightProfile = request;
  try {
    return await request;
  } finally {
    if (!signal && inFlightProfile === request) inFlightProfile = null;
  }
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
  return commitProfile(normalizeMeProfile(data.profile), true);
}

export async function deleteMyAccount(): Promise<{ ok: true; deletedAt: string }> {
  let data: { ok?: boolean; deletedAt?: string } | undefined;
  try {
    data = await api.delete<{ ok?: boolean; deletedAt?: string }>("/me/account");
  } catch (err) {
    throw await toApiError(err, "계정을 탈퇴 처리하지 못했어요.");
  }
  if (!data?.ok || !data.deletedAt) throw new Error("계정을 탈퇴 처리하지 못했어요.");
  invalidateMyProfileCache();
  return { ok: true, deletedAt: data.deletedAt };
}
