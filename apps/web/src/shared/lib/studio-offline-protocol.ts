export const STUDIO_OFFLINE_PREPARE_MESSAGE = "toonspectrum-sw:prepare-offline";
export const STUDIO_OFFLINE_STATUS_MESSAGE = "toonspectrum-sw:offline-status";
export const STUDIO_OFFLINE_MAX_RESOURCES = 1024;

export interface StudioOfflinePreparationReport {
  readonly schema: 1;
  readonly buildId: string;
  readonly checked: number;
  readonly cached: number;
  readonly downloadedBytes: number;
  readonly missing: readonly string[];
  readonly complete: boolean;
}

export interface StudioOfflineReadinessReport {
  readonly schema: 1;
  readonly buildId: string;
  readonly ready: boolean;
}

export function normalizeStudioOfflineAssetUrl(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash
      || !/^\/assets\/[A-Za-z0-9_./-]+\.(?:m?js|css|wasm|woff2?|ttf|otf)$/u.test(url.pathname)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export function isStudioOfflinePreparationMessage(value: unknown): value is {
  readonly type: typeof STUDIO_OFFLINE_PREPARE_MESSAGE;
  readonly urls: readonly string[];
} {
  if (!value || typeof value !== "object") return false;
  const record = value as { type?: unknown; urls?: unknown };
  return record.type === STUDIO_OFFLINE_PREPARE_MESSAGE && Array.isArray(record.urls)
    && record.urls.length <= STUDIO_OFFLINE_MAX_RESOURCES
    && record.urls.every((url) => typeof url === "string" && url.length <= 2_048);
}

export function isStudioOfflineStatusMessage(value: unknown): value is {
  readonly type: typeof STUDIO_OFFLINE_STATUS_MESSAGE;
} {
  return Boolean(value && typeof value === "object"
    && "type" in value
    && (value as { readonly type?: unknown }).type === STUDIO_OFFLINE_STATUS_MESSAGE);
}
