// 내 정보(/api/me) 조회·프로필 갱신 전용 ky 헬퍼.
// 공유 클라이언트가 HttpOnly 세션 쿠키와 CSRF 헤더를 처리한다.
import {
  getAuthUserId,
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

const PROFILE_CACHE_TTL_MS = 30_000;
const PROFILE_CHANNEL_NAME = "toonspectrum:me-profile:v1";
const profileListeners = new Set<ProfileListener>();
let cachedProfile: { readonly value: MeProfile; readonly cachedAt: number } | null = null;
let inFlightProfile: { readonly userId: string | null; readonly promise: Promise<MeProfile> } | null = null;
let profileChannel: BroadcastChannel | null = null;

function normalizeMeProfile(profile: MeProfileResponse): MeProfile {
  return {
    ...profile,
    creatorRoleProfile: normalizeCreatorRoleProfile(profile.creatorRoleProfile),
  };
}

function currentCacheMatchesUser(): boolean {
  const authUserId = getAuthUserId();
  return Boolean(cachedProfile && (!authUserId || cachedProfile.value.id === authUserId));
}

function emitProfile(profile: MeProfile | null): void {
  for (const listener of profileListeners) listener(profile);
}

function ensureProfileChannel(): BroadcastChannel | null {
  if (profileChannel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return profileChannel;
  }
  try {
    profileChannel = new BroadcastChannel(PROFILE_CHANNEL_NAME);
    profileChannel.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
      const record = payload as Record<string, unknown>;
      if (record.type === "profile-invalidated") {
        cachedProfile = null;
        inFlightProfile = null;
        emitProfile(null);
        return;
      }
      if (record.type !== "profile-updated" || !record.profile || typeof record.profile !== "object") {
        return;
      }
      const profile = normalizeMeProfile(record.profile as MeProfileResponse);
      const authUserId = getAuthUserId();
      if (authUserId && profile.id !== authUserId) return;
      cachedProfile = { value: profile, cachedAt: Date.now() };
      mergeCurrentSessionProfile(profile);
      emitProfile(profile);
    };
  } catch {
    profileChannel = null;
  }
  return profileChannel;
}

function commitProfile(profile: MeProfile, broadcast: boolean): MeProfile {
  cachedProfile = { value: profile, cachedAt: Date.now() };
  mergeCurrentSessionProfile(profile);
  emitProfile(profile);
  if (broadcast) {
    try {
      ensureProfileChannel()?.postMessage({ type: "profile-updated", profile });
    } catch {
      // Cross-tab delivery is best effort; the successful server update remains authoritative.
    }
  }
  return profile;
}

export function getCachedMyProfile(): MeProfile | null {
  return currentCacheMatchesUser() ? cachedProfile?.value ?? null : null;
}

export function subscribeMyProfile(listener: ProfileListener): () => void {
  profileListeners.add(listener);
  ensureProfileChannel();
  const cached = getCachedMyProfile();
  if (cached) listener(cached);
  return () => profileListeners.delete(listener);
}

export function invalidateMyProfileCache(options?: {
  readonly broadcast?: boolean;
}): void {
  cachedProfile = null;
  inFlightProfile = null;
  emitProfile(null);
  if (options?.broadcast === false) return;
  try {
    ensureProfileChannel()?.postMessage({ type: "profile-invalidated" });
  } catch {
    // Other tabs will refresh naturally on their next profile request.
  }
}

export function clearMyProfileCache(): void {
  invalidateMyProfileCache({ broadcast: false });
}

export async function getMyProfile(
  signal?: AbortSignal,
  forceOrOptions: boolean | { readonly force?: boolean } = {},
): Promise<MeProfile> {
  const force = typeof forceOrOptions === "boolean"
    ? forceOrOptions
    : Boolean(forceOrOptions.force);
  const userId = getAuthUserId();
  const cached = getCachedMyProfile();
  if (
    !force
    && !signal
    && cached
    && cachedProfile
    && Date.now() - cachedProfile.cachedAt < PROFILE_CACHE_TTL_MS
  ) {
    return cached;
  }
  if (!force && !signal && inFlightProfile?.userId === userId) {
    return inFlightProfile.promise;
  }

  const load = async (): Promise<MeProfile> => {
    let data: { profile?: MeProfileResponse } | undefined;
    try {
      data = await api.get<{ profile?: MeProfileResponse }>("/me", { signal });
    } catch (err) {
      throw await toApiError(err, "프로필을 불러오지 못했어요.");
    }
    if (!data?.profile?.id) throw new Error("프로필을 불러오지 못했어요.");
    return commitProfile(normalizeMeProfile(data.profile), false);
  };

  const promise = load();
  if (!signal) inFlightProfile = { userId, promise };
  try {
    return await promise;
  } finally {
    if (inFlightProfile?.promise === promise) inFlightProfile = null;
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
