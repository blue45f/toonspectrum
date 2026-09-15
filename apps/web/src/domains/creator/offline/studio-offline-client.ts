import {
  STUDIO_OFFLINE_MAX_RESOURCES,
  STUDIO_OFFLINE_PREPARE_MESSAGE,
  STUDIO_OFFLINE_STATUS_MESSAGE,
  normalizeStudioOfflineAssetUrl,
  type StudioOfflinePreparationReport,
  type StudioOfflineReadinessReport,
} from "@/shared/lib/studio-offline-protocol";

export interface StudioOfflineDeviceState {
  readonly online: boolean;
  /** A cached navigation is evidence of fallback, not an API health check. */
  readonly navigationFallback: boolean;
  readonly supported: boolean;
  readonly controlled: boolean;
  readonly offlineReady: boolean | null;
  readonly buildId: string | null;
  readonly persisted: boolean | null;
  readonly usage: number | null;
  readonly quota: number | null;
}

async function bounded<T>(
  operation: () => Promise<T>,
  fallback: T,
  timeoutMs = 2_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation).catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function studioOfflineController(): ServiceWorker | null {
  try { return navigator.serviceWorker?.controller ?? null; } catch { return null; }
}

function messageStudioWorker(
  worker: ServiceWorker,
  data: unknown,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const channel = new MessageChannel();
    const cleanup = (): void => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("오프라인 실행 모듈 응답 시간이 초과됐습니다."));
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      cleanup();
      resolve(event.data);
    };
    channel.port1.onmessageerror = () => {
      cleanup();
      reject(new Error("오프라인 실행 모듈 응답을 읽지 못했습니다."));
    };
    try { worker.postMessage(data, [channel.port2]); }
    catch (cause) { cleanup(); reject(cause); }
  });
}

export function collectLoadedStudioResources(entries: readonly PerformanceEntry[], origin: string): string[] {
  return [...new Set(entries.map((entry) => normalizeStudioOfflineAssetUrl(entry.name, origin))
    .filter((url): url is string => url !== null))].sort((a, b) => a.localeCompare(b));
}

export function studioNavigationUsedOfflineShell(entries: readonly PerformanceEntry[]): boolean {
  return entries.some((entry) => entry.entryType === "navigation"
    && (entry as PerformanceNavigationTiming).serverTiming?.some(
      (timing) => timing.name === "toonstudio-offline",
    ) === true);
}

export function isStudioOfflineReadinessReport(
  value: unknown,
): value is StudioOfflineReadinessReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<StudioOfflineReadinessReport>;
  return report.schema === 1
    && typeof report.buildId === "string"
    && typeof report.ready === "boolean";
}

export async function inspectStudioOfflineReadiness(): Promise<StudioOfflineReadinessReport | null> {
  const worker = studioOfflineController();
  if (!worker) return null;
  const result = await bounded(
    () => messageStudioWorker(worker, { type: STUDIO_OFFLINE_STATUS_MESSAGE }, 4_000),
    null,
    4_500,
  );
  if (studioOfflineController() !== worker || !isStudioOfflineReadinessReport(result)) return null;
  return result;
}

export async function inspectStudioOfflineDevice(): Promise<StudioOfflineDeviceState> {
  const [persisted, estimate, readiness] = await Promise.all([
    bounded<boolean | null>(async () => navigator.storage?.persisted?.() ?? null, null),
    bounded<StorageEstimate | null>(async () => navigator.storage?.estimate?.() ?? null, null),
    inspectStudioOfflineReadiness(),
  ]);
  let supported = false;
  try { supported = window.isSecureContext && "serviceWorker" in navigator && "caches" in window; } catch { /* Restricted frame. */ }
  const bytes = (value: number | undefined): number | null =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
  let navigationFallback = false;
  try { navigationFallback = studioNavigationUsedOfflineShell(performance.getEntriesByType("navigation")); }
  catch { /* Navigation timing may be unavailable in restricted browsers. */ }
  return {
    online: navigator.onLine,
    navigationFallback,
    supported,
    controlled: studioOfflineController() !== null,
    offlineReady: readiness?.ready ?? null,
    buildId: readiness?.buildId ?? null,
    persisted,
    usage: bytes(estimate?.usage),
    quota: bytes(estimate?.quota),
  };
}

export function requestStudioPersistentStorage(): Promise<boolean | null> {
  return bounded<boolean | null>(async () => navigator.storage?.persist?.() ?? null, null);
}

export function isStudioOfflinePreparationReport(value: unknown): value is StudioOfflinePreparationReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<StudioOfflinePreparationReport>;
  return report.schema === 1 && typeof report.buildId === "string"
    && typeof report.checked === "number" && Number.isInteger(report.checked) && report.checked > 0
    && typeof report.cached === "number" && Number.isInteger(report.cached) && report.cached >= 0
    && report.cached <= report.checked && typeof report.downloadedBytes === "number"
    && Number.isFinite(report.downloadedBytes) && report.downloadedBytes >= 0
    && Array.isArray(report.missing) && report.missing.every((item) => typeof item === "string")
    && typeof report.complete === "boolean"
    && (!report.complete || (report.cached === report.checked && report.missing.length === 0));
}

function loadedResourceSnapshot(): string[] {
  // ResourceTiming has a bounded buffer. Vite's actual preload graph retains
  // later modules that timing alone can silently omit from readiness checks.
  const urls = collectLoadedStudioResources(performance.getEntriesByType("resource"), location.origin);
  for (const node of document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
    'link[rel="modulepreload"],link[rel="stylesheet"],script[src]',
  )) {
    const url = normalizeStudioOfflineAssetUrl("href" in node ? node.href : node.src, location.origin);
    if (url) urls.push(url);
  }
  return [...new Set(urls)].sort((left, right) => left.localeCompare(right));
}

export async function prepareLoadedStudioOfflineResources(): Promise<StudioOfflinePreparationReport> {
  const worker = studioOfflineController();
  if (!worker) throw new Error("오프라인 실행 모듈이 아직 준비되지 않았습니다. 온라인에서 편집기를 다시 열고 확인해 주세요.");
  const resources = loadedResourceSnapshot();
  if (resources.length === 0) throw new Error("편집기가 열리고 기본 도구를 사용한 뒤 다시 준비해 주세요.");
  if (resources.length > STUDIO_OFFLINE_MAX_RESOURCES) throw new Error("열린 리소스가 준비 한도를 넘었습니다. 프로젝트를 백업한 뒤 기본 드로잉 화면에서 다시 준비해 주세요.");
  const result = await new Promise<unknown>((resolve, reject) => {
    const channel = new MessageChannel();
    const cleanup = (): void => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("준비 확인 시간이 초과됐습니다. 저장 공간과 연결을 확인하고 다시 시도해 주세요.")); }, 45_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => { cleanup(); resolve(event.data); };
    channel.port1.onmessageerror = () => { cleanup(); reject(new Error("오프라인 준비 응답을 읽지 못했습니다.")); };
    try { worker.postMessage({ type: STUDIO_OFFLINE_PREPARE_MESSAGE, urls: resources }, [channel.port2]); }
    catch (cause) { cleanup(); reject(cause); }
  });
  if (studioOfflineController() !== worker) throw new Error("앱 버전이 바뀌었습니다. 현재 버전에서 오프라인 준비를 다시 확인해 주세요.");
  if (!isStudioOfflinePreparationReport(result)) throw new Error("오프라인 준비를 확인하지 못했습니다. 다른 준비 작업이 끝나거나 앱 업데이트를 적용한 뒤 다시 시도해 주세요.");
  const after = loadedResourceSnapshot();
  if (after.some((url) => !resources.includes(url))) {
    return { ...result, complete: false, missing: [...result.missing, "editor-resources-changed"] };
  }
  return result;
}
