export interface CreatorOfflineSnapshot {
  online: boolean;
  secure: boolean;
  controlled: boolean;
  shellCached: boolean | null;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export const CREATOR_STORAGE_TIMEOUT_MS = 2000;
export async function boundedStorageRead<T>(operation: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), CREATOR_STORAGE_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function finiteStorageBytes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A cached HTML shell is NOT proof that a project, every brush or the current build is cached. */
export async function inspectCreatorOfflineReadiness(): Promise<CreatorOfflineSnapshot> {
  const [persisted, estimate, shellCached] = await Promise.all([
    boundedStorageRead<boolean | null>(Promise.resolve().then(() => navigator.storage?.persisted?.() ?? null), null),
    boundedStorageRead<StorageEstimate | null>(Promise.resolve().then(() => navigator.storage?.estimate?.() ?? null), null),
    boundedStorageRead<boolean | null>(Promise.resolve().then(async () => {
      if (!("caches" in window)) return null;
      const response = await window.caches.match(new URL("/studio", window.location.origin));
      return Boolean(response?.ok && response.headers.get("content-type")?.includes("text/html")
        && response.headers.get("cross-origin-opener-policy") === "same-origin"
        && ["require-corp", "credentialless"].includes(response.headers.get("cross-origin-embedder-policy") ?? ""));
    }), null),
  ]);
  return {
    online: navigator.onLine, secure: window.isSecureContext,
    controlled: Boolean(creatorServiceWorker()?.controller), persisted, shellCached,
    usage: finiteStorageBytes(estimate?.usage), quota: finiteStorageBytes(estimate?.quota),
  };
}

/** Some restricted frames throw when the serviceWorker getter is read. */
export function creatorServiceWorker(): ServiceWorkerContainer | null {
  try { return navigator.serviceWorker ?? null; } catch { return null; }
}
