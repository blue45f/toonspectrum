import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

const STORAGE_PREFIX = "toonstudio:office-desk-preference:v1:";

export interface StudioOfficeDeskPreferenceScope {
  readonly userId: string | null;
  readonly projectId: string;
  readonly activeWorldScope: string;
  readonly authoringMode: boolean;
}

export interface StudioOfficeDeskPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StudioOfficeDeskPreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function studioOfficeDeskPreferenceStorageKey(scope: StudioOfficeDeskPreferenceScope): string {
  return STORAGE_PREFIX + JSON.stringify([scope.userId, scope.projectId, scope.activeWorldScope, scope.authoringMode]);
}

function exists(manifest: StudioVirtualSpaceWorldManifest, slotId: unknown): slotId is string {
  return typeof slotId === "string" && Boolean(manifest.interactionSlots?.some((slot) => slot.id === slotId));
}

/** 선호 ID만 복원한다. 실제 자리 점유와 도착 처리는 requestSlot의 서버 계약을 따른다. */
export function readStudioOfficeDeskPreference(
  scope: StudioOfficeDeskPreferenceScope,
  manifest: StudioVirtualSpaceWorldManifest,
  storage: StudioOfficeDeskPreferenceStorage | null = browserStorage(),
): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(studioOfficeDeskPreferenceStorageKey(scope));
    if (!raw || raw.length > 512) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("slotId" in value)) return null;
    return exists(manifest, value.slotId) ? value.slotId : null;
  } catch { return null; }
}

/** 저장 성공 여부만 반환하며 lease, 위치, 권한에는 영향을 주지 않는다. */
export function writeStudioOfficeDeskPreference(
  scope: StudioOfficeDeskPreferenceScope,
  manifest: StudioVirtualSpaceWorldManifest,
  slotId: string | null,
  storage: StudioOfficeDeskPreferenceStorage | null = browserStorage(),
): boolean {
  if (!storage || (slotId !== null && !exists(manifest, slotId))) return false;
  try {
    const key = studioOfficeDeskPreferenceStorageKey(scope);
    if (slotId === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, slotId }));
    return true;
  } catch { return false; }
}
