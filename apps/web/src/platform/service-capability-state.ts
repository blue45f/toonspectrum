import { useSyncExternalStore } from "react";
import { z } from "zod";

import {
  SERVICE_CAPABILITY_ERROR_EVENT,
  type AppApiError,
  isAbortError,
  toAppApiError,
} from "@/platform/api-error";
import { api } from "@/platform/api";

const CAPABILITY_STATE_SCHEMA = z.enum([
  "available",
  "degraded",
  "unavailable",
]);

const SERVICE_CAPABILITIES_SCHEMA = z.object({
  status: z.enum(["available", "degraded"]),
  incidentId: z.string().nullable(),
  retryAfterSeconds: z.number().int().min(1).max(3_600).nullable(),
  checkedAt: z.string().datetime(),
  capabilities: z.object({
    publicCatalog: CAPABILITY_STATE_SCHEMA,
    authSession: CAPABILITY_STATE_SCHEMA,
    communityRead: CAPABILITY_STATE_SCHEMA,
    communityWrite: CAPABILITY_STATE_SCHEMA,
    marketplaceRead: CAPABILITY_STATE_SCHEMA,
    studioLocalEditing: CAPABILITY_STATE_SCHEMA,
    studioProjectRead: CAPABILITY_STATE_SCHEMA,
    studioCloudSave: CAPABILITY_STATE_SCHEMA,
    realtimeCollaboration: CAPABILITY_STATE_SCHEMA,
    publishing: CAPABILITY_STATE_SCHEMA,
    serverAi: CAPABILITY_STATE_SCHEMA,
  }),
});

export type ServiceCapabilityState = z.infer<typeof CAPABILITY_STATE_SCHEMA>;
export type ServiceCapabilitiesReport = z.infer<typeof SERVICE_CAPABILITIES_SCHEMA>;

export interface ServiceCapabilitySnapshot {
  readonly status: "unknown" | "available" | "degraded";
  readonly checking: boolean;
  readonly report: ServiceCapabilitiesReport | null;
  readonly lastError: AppApiError | null;
  readonly nextProbeAt: number | null;
  readonly recoveredAt: number | null;
  /**
   * 이 페이지에서 아직 한 번도 서버 확인에 성공하지 못했고, 응답 지연·게이트웨이 오류가
   * 무료 서버의 절전 해제(cold start) 구간과 겹치는 상태. 장애 경고 대신 연결 준비 안내를 보인다.
   */
  readonly warmingUp?: boolean;
}

interface CapabilityErrorEventDetail {
  readonly capability?: unknown;
  readonly retryAfterSeconds?: unknown;
  readonly requestId?: unknown;
  readonly incidentId?: unknown;
  readonly detectedAt?: unknown;
}

const STORAGE_KEY = "toonspectrum:service-capabilities:v1";
const CHECK_INTERVAL_MS = 60_000;
const DEFAULT_RETRY_MS = 30_000;
/** 무료 Core API는 15분 무요청 후 절전하며 첫 응답까지 약 1분이 걸릴 수 있다. */
const WARMUP_WINDOW_MS = 90_000;
const WARMUP_RETRY_MS = 6_000;
/**
 * 절전 해제를 나타내는 게이트웨이 상태. Render는 절전 중 인스턴스를 깨우지 못하면
 * 본문 없는 503(hibernate-wake-error)을 돌려주므로 503도 포함한다. 단, API가 만든 503은
 * 오류 봉투에 Retry-After를 실어 보내며, 그 경우는 isColdStartError의 Retry-After 가드가
 * 절전 해제가 아닌 실제 기능 장애로 분류한다.
 */
const COLD_START_GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
const REPORT_CACHE_TTL_MS = CHECK_INTERVAL_MS * 2;
const MAX_CLOCK_SKEW_MS = 30_000;

function freshReport(report: ServiceCapabilitiesReport): boolean {
  const age = Date.now() - Date.parse(report.checkedAt);
  return Number.isFinite(age) && age >= -MAX_CLOCK_SKEW_MS && age <= REPORT_CACHE_TTL_MS;
}
function readStoredReport(): ServiceCapabilitiesReport | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = SERVICE_CAPABILITIES_SCHEMA.safeParse(JSON.parse(raw));
    return parsed.success && freshReport(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

function persistReport(report: ServiceCapabilitiesReport): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  } catch {
    // 상태 캐시는 편의 기능이며 브라우저 저장 제한이 앱 렌더링을 막아서는 안 된다.
  }
}

const SERVER_SNAPSHOT: ServiceCapabilitySnapshot = Object.freeze({
  status: "unknown", checking: false, report: null, lastError: null,
  nextProbeAt: null, recoveredAt: null,
});
const storedReport = readStoredReport();
let snapshot: ServiceCapabilitySnapshot = Object.freeze({
  status: storedReport?.status ?? "unknown",
  checking: false,
  report: storedReport,
  lastError: null,
  nextProbeAt: null,
  recoveredAt: null,
});
const listeners = new Set<() => void>();
let runtimeUsers = 0;
let activeProbe: Promise<ServiceCapabilitySnapshot> | null = null;
let removeRuntimeListeners: (() => void) | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
// 최신 장애 이벤트나 다른 탭의 확인 결과를 지연 응답이 덮지 않도록 한다.
let observationVersion = 0;
let lastProbeStartedAt: number | null = null;
const FOREGROUND_PROBE_GAP_MS = 5_000;
// 절전 해제 구간 판정: 런타임 시작 시각과 이 페이지에서의 첫 확인 성공 여부.
let runtimeStartedAt: number | null = null;
let confirmedThisSession = false;

function withinWarmupWindow(): boolean {
  return !confirmedThisSession
    && runtimeStartedAt !== null
    && Date.now() - runtimeStartedAt < WARMUP_WINDOW_MS;
}

/** 명시적 Retry-After가 없는 지연·연결 실패·게이트웨이 오류만 절전 해제로 본다. */
function isColdStartError(error: AppApiError): boolean {
  if (error.retryAfterSeconds) return false;
  return error.kind === "timeout"
    || error.kind === "unreachable"
    || (typeof error.status === "number" && COLD_START_GATEWAY_STATUSES.has(error.status));
}

function scheduleNextProbe(): void {
  if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
  retryTimer = null;
  if (runtimeUsers === 0 || snapshot.checking || snapshot.nextProbeAt === null) return;
  retryTimer = globalThis.setTimeout(() => {
    retryTimer = null;
    void probeServiceCapabilities();
  }, Math.max(0, snapshot.nextProbeAt - Date.now()));
}
function publish(next: ServiceCapabilitySnapshot): ServiceCapabilitySnapshot {
  snapshot = Object.freeze(next);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.serviceCapabilityState = next.status;
  }
  scheduleNextProbe();
  for (const listener of listeners) listener();
  return snapshot;
}

export function getServiceCapabilitySnapshot(): ServiceCapabilitySnapshot {
  return snapshot;
}

export function getServiceCapabilityServerSnapshot(): ServiceCapabilitySnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeServiceCapabilityState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function online(): boolean {
  try {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  } catch {
    return true;
  }
}

function retryAt(seconds: number | null): number {
  return Date.now() + (seconds ? seconds * 1_000 : DEFAULT_RETRY_MS);
}
export async function probeServiceCapabilities(
  force = false,
): Promise<ServiceCapabilitySnapshot> {
  if (activeProbe) return activeProbe;
  if (!online()) return snapshot;
  if (!force && snapshot.nextProbeAt && Date.now() < snapshot.nextProbeAt) {
    return snapshot;
  }

  const startedVersion = observationVersion;
  lastProbeStartedAt = Date.now();
  publish({ ...snapshot, checking: true });
  activeProbe = Promise.resolve().then(() => api.get<unknown>("/health/capabilities", {
    timeout: 5_000,
    totalTimeout: 10_000,
    // 재시도는 이 런타임 타이머 한 곳에서 담당한다.
    retry: 0,
    errorMessage: "서비스 상태를 확인하지 못했습니다.",
  })).then((payload) => {
    const report = SERVICE_CAPABILITIES_SCHEMA.parse(payload);
    if (startedVersion !== observationVersion) {
      return publish({ ...snapshot, checking: false });
    }
    // 절전 해제 대기 뒤의 첫 연결은 장애 복구가 아니므로 복구 알림을 띄우지 않는다.
    const recoveredAt = snapshot.status === "degraded" && report.status === "available" && !snapshot.warmingUp
      ? Date.now()
      : snapshot.recoveredAt;
    confirmedThisSession = true;
    persistReport(report);
    return publish({
      status: report.status,
      checking: false,
      report,
      lastError: null,
      nextProbeAt: report.status === "degraded"
        ? retryAt(report.retryAfterSeconds)
        : null,
      recoveredAt,
      warmingUp: false,
    });
  }).catch((error: unknown) => {
    if (isAbortError(error)) return publish({ ...snapshot, checking: false });
    const appError = toAppApiError(error, "서비스 상태를 확인하지 못했습니다.");
    if (startedVersion !== observationVersion) {
      // 상태 API 자신의 오류 이벤트도 같은 경로로 들어온다. 재확인 실패는 즉시 반복하지 않는다.
      return publish({
        ...snapshot,
        checking: false,
        lastError: snapshot.status === "degraded" ? appError : snapshot.lastError,
        nextProbeAt: snapshot.status === "degraded"
          ? Math.max(snapshot.nextProbeAt ?? 0, retryAt(appError.retryAfterSeconds))
          : snapshot.nextProbeAt,
      });
    }
    const degraded = appError.kind === "capability_unavailable"
      || appError.kind === "server"
      || appError.kind === "unreachable"
      || appError.kind === "timeout";
    const warmingUp = degraded && withinWarmupWindow() && isColdStartError(appError);
    return publish({
      ...snapshot,
      status: degraded ? "degraded" : snapshot.status,
      checking: false,
      lastError: appError,
      nextProbeAt: warmingUp ? Date.now() + WARMUP_RETRY_MS : retryAt(appError.retryAfterSeconds),
      warmingUp,
    });
  }).finally(() => {
    activeProbe = null;
    scheduleNextProbe();
  });
  return activeProbe;
}

export function requestServiceCapabilityRefresh(): void {
  void probeServiceCapabilities(true);
}

function boundedRetrySeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(3_600, Math.max(1, Math.trunc(value)));
}
type CapabilityKey = keyof ServiceCapabilitiesReport["capabilities"];

function capabilityKey(value: unknown): CapabilityKey | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("community.")) {
    return value.includes("write") ? "communityWrite" : "communityRead";
  }
  if (value.startsWith("creator.marketplace")) return "marketplaceRead";
  if (value.startsWith("creator.publication")) return "publishing";
  if (
    value.startsWith("creator.directory")
    || value.startsWith("creator.follows")
    || value.startsWith("creator.profile")
  ) return "communityRead";
  if (value.startsWith("creator.challenges")) return "studioProjectRead";
  if (value.startsWith("creator.work") || value.startsWith("creator.series")) {
    return value.includes("write") ? "studioCloudSave" : "studioProjectRead";
  }
  if (value.startsWith("studio.collaboration")) return "realtimeCollaboration";
  if (value.startsWith("studio.ai")) return "serverAi";
  return null;
}

function onCapabilityFailure(event: Event): void {
  observationVersion += 1;
  const detail = event instanceof CustomEvent
    ? event.detail as CapabilityErrorEventDetail
    : null;
  const seconds = boundedRetrySeconds(detail?.retryAfterSeconds);
  const key = capabilityKey(detail?.capability);
  let report = snapshot.report;
  if (report && key) {
    report = {
      ...report,
      status: "degraded",
      incidentId: typeof detail?.incidentId === "string"
        ? detail.incidentId
        : report.incidentId,
      retryAfterSeconds: seconds ?? report.retryAfterSeconds,
      checkedAt: typeof detail?.detectedAt === "string"
        ? detail.detectedAt
        : new Date().toISOString(),
      capabilities: { ...report.capabilities, [key]: "unavailable" },
    };
    persistReport(report);
  }
  publish({
    ...snapshot,
    status: "degraded",
    checking: false,
    report,
    // 절전 해제 대기 중 다른 요청의 실패는 같은 원인이므로 안내 수준을 올리지 않는다.
    warmingUp: key === null && seconds === null && withinWarmupWindow() && snapshot.status !== "available",
    // 범위가 없는 단일 요청 오류는 빠르게 확인하되 반복 오류가 재확인을 미루지 않게 한다.
    nextProbeAt: Math.min(snapshot.nextProbeAt ?? Number.POSITIVE_INFINITY,
      key || seconds !== null ? retryAt(seconds)
        : snapshot.lastError && snapshot.nextProbeAt !== null
          ? snapshot.nextProbeAt : Date.now() + 1_000),
  });
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const parsed = SERVICE_CAPABILITIES_SCHEMA.safeParse(JSON.parse(event.newValue));
    if (!parsed.success || !freshReport(parsed.data)) return;
    if (snapshot.report && Date.parse(parsed.data.checkedAt) <= Date.parse(snapshot.report.checkedAt)) return;
    observationVersion += 1;
    publish({
      ...snapshot,
      recoveredAt: snapshot.status === "degraded" && parsed.data.status === "available"
        ? Date.now() : snapshot.recoveredAt,
      status: parsed.data.status,
      report: parsed.data,
      lastError: null,
      nextProbeAt: parsed.data.status === "degraded"
        ? retryAt(parsed.data.retryAfterSeconds)
        : null,
    });
  } catch {
    // 다른 탭의 손상된 상태 캐시는 무시하고 현재 상태를 유지한다.
  }
}
export function startServiceCapabilityRuntime(): () => void {
  runtimeUsers += 1;
  let stopped = false;
  const release = () => {
    if (stopped) return;
    stopped = true;
    stopServiceCapabilityRuntime();
  };
  if (runtimeUsers > 1) return release;
  runtimeStartedAt ??= Date.now();

  const refresh = () => { void probeServiceCapabilities(); };
  const onOnline = () => { void probeServiceCapabilities(true); };
  const foregroundRefresh = () => {
    // 탭·도구의 연속 포커스가 이미 진행한 상태 확인의 backoff를 매번 우회하지 않는다.
    if (lastProbeStartedAt !== null && Date.now() - lastProbeStartedAt < FOREGROUND_PROBE_GAP_MS) return;
    void probeServiceCapabilities(true);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") foregroundRefresh();
  };
  globalThis.addEventListener("online", onOnline, { passive: true });
  globalThis.addEventListener("focus", foregroundRefresh, { passive: true });
  globalThis.addEventListener(
    SERVICE_CAPABILITY_ERROR_EVENT,
    onCapabilityFailure,
  );
  globalThis.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  intervalId = globalThis.setInterval(refresh, CHECK_INTERVAL_MS);
  removeRuntimeListeners = () => {
    globalThis.removeEventListener("online", onOnline);
    globalThis.removeEventListener("focus", foregroundRefresh);
    globalThis.removeEventListener(
      SERVICE_CAPABILITY_ERROR_EVENT,
      onCapabilityFailure,
    );
    globalThis.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  void probeServiceCapabilities(true);
  return release;
}

function stopServiceCapabilityRuntime(): void {
  runtimeUsers = Math.max(0, runtimeUsers - 1);
  if (runtimeUsers > 0) return;
  removeRuntimeListeners?.();
  removeRuntimeListeners = null;
  if (intervalId) globalThis.clearInterval(intervalId);
  intervalId = null;
  if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
  retryTimer = null;
}

export function useServiceCapabilityState(): ServiceCapabilitySnapshot {
  return useSyncExternalStore(
    subscribeServiceCapabilityState,
    getServiceCapabilitySnapshot,
    getServiceCapabilityServerSnapshot,
  );
}

export function capabilityAvailable(
  key: CapabilityKey,
  state: ServiceCapabilitySnapshot = snapshot,
): boolean {
  return state.report?.capabilities[key] !== "unavailable";
}
