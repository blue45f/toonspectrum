export interface CreatorOfflineSnapshot {
  online: boolean;
  secure: boolean;
  controlled: boolean;
  shellCached: boolean | null;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export interface CreatorOfflineDrawingCheck {
  /** Only the cached shell's declared dependencies and both Studio dictionaries are inspected. */
  status: "cached" | "missing" | "unavailable";
  checked: number;
  missing: readonly string[];
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

function usableStudioShell(response: Response | undefined): boolean {
  return Boolean(response?.ok && response.headers.get("content-type")?.includes("text/html")
    && response.headers.get("cross-origin-opener-policy") === "same-origin"
    && ["require-corp", "credentialless"].includes(response.headers.get("cross-origin-embedder-policy") ?? ""));
}

/** A cached HTML shell is NOT proof that a project, every brush or the current build is cached. */
export async function inspectCreatorOfflineReadiness(): Promise<CreatorOfflineSnapshot> {
  const [persisted, estimate, shellCached] = await Promise.all([
    boundedStorageRead<boolean | null>(Promise.resolve().then(() => navigator.storage?.persisted?.() ?? null), null),
    boundedStorageRead<StorageEstimate | null>(Promise.resolve().then(() => navigator.storage?.estimate?.() ?? null), null),
    boundedStorageRead<boolean | null>(Promise.resolve().then(async () => {
      if (!("caches" in window)) return null;
      return usableStudioShell(await window.caches.match(new URL("/studio", window.location.origin)));
    }), null),
  ]);
  return {
    online: navigator.onLine, secure: window.isSecureContext,
    controlled: Boolean(creatorServiceWorker()?.controller), persisted, shellCached,
    usage: finiteStorageBytes(estimate?.usage), quota: finiteStorageBytes(estimate?.quota),
  };
}

/** Read-only: never claims a save, fetches private documents, opens OPFS, or changes SW ownership. */
export async function inspectCreatorDrawingDependencies(): Promise<CreatorOfflineDrawingCheck> {
  const unavailable: CreatorOfflineDrawingCheck = { status: "unavailable", checked: 0, missing: [] };
  return boundedStorageRead(Promise.resolve().then(async (): Promise<CreatorOfflineDrawingCheck> => {
    if (!("caches" in window)) return unavailable;
    const origin = window.location.origin;
    const response = await window.caches.match(new URL("/studio", origin));
    if (!response || !usableStudioShell(response)) return { status: "missing", checked: 1, missing: ["/studio"] };
    // Parse, never execute, cached markup; no remote URLs are admitted by the extractor.
    const html = await response.text();
    const urls = creatorDrawingDependencyUrls(html, origin);
    if (!urls) return unavailable;
    const missing: string[] = [];
    for (let offset = 0; offset < urls.length; offset += 8) {
      const batch = urls.slice(offset, offset + 8);
      const results = await Promise.all(batch.map(async (url) => {
        const cached = await window.caches.match(new URL(url, origin));
        // A successful HTML fallback is not a JS/CSS/JSON cache hit.
        const type = cached?.headers.get("content-type")?.toLowerCase() ?? "";
        const expected = url.startsWith("/i18n/") ? type.includes("json")
          : /\.css(?:\?|$)/u.test(url) ? type.includes("text/css")
          : type.includes("javascript") || type.includes("ecmascript");
        return cached?.ok && expected;
      }));
      batch.forEach((url, index) => { if (!results[index]) missing.push(url); });
    }
    return { status: missing.length ? "missing" : "cached", checked: urls.length, missing };
  }), unavailable);
}

/** Bounded static shell inventory. This deliberately does not claim a complete dynamic import graph. */
export function creatorDrawingDependencyUrls(html: string, origin: string): string[] | null {
  if (!html || html.length > 1_000_000) return null;
  const result = new Set<string>(["/i18n/studio/ko.json", "/i18n/studio/en.json"]);
  let scripts = 0;
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/giu)) {
    const attributes = new Map<string, string>();
    for (const match of tag[0].matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)) {
      attributes.set((match[1] ?? "").toLowerCase(), match[2] ?? match[3] ?? "");
    }
    const script = /^<script\b/iu.test(tag[0]);
    if (!script && !["stylesheet", "modulepreload"].includes(attributes.get("rel")?.toLowerCase() ?? "")) continue;
    const raw = attributes.get(script ? "src" : "href");
    if (!raw) continue;
    let url: URL;
    try { url = new URL(raw, origin); } catch { return null; }
    // Foreign, inline and runtime scripts are not cacheable drawing dependencies.
    if (url.origin !== origin || !url.pathname.startsWith("/assets/")) continue;
    if (!/\.(?:m?js|css)$/u.test(url.pathname)) continue;
    result.add(url.pathname + url.search);
    if (script) scripts++;
    if (result.size > 128) return null;
  }
  return scripts ? [...result] : null;
}

export function creatorStoragePressure(usage: number | null, quota: number | null): "unknown" | "normal" | "low" {
  if (finiteStorageBytes(usage) === null || finiteStorageBytes(quota) === null || !quota || usage === null) return "unknown";
  return usage / quota >= 0.85 || quota - usage < 50 * 1024 * 1024 ? "low" : "normal";
}

/** Some restricted frames throw when the serviceWorker getter is read. */
export function creatorServiceWorker(): ServiceWorkerContainer | null {
  try { return navigator.serviceWorker ?? null; } catch { return null; }
}
