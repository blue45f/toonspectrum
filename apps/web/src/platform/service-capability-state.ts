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
  }).strict(),
}).strict();

export type ServiceCapabilityState = z.infer<typeof CAPABILITY_STATE_SCHEMA>;
export type ServiceCapabilitiesReport = z.infer<typeof SERVICE_CAPABILITIES_SCHEMA>;

export interface ServiceCapabilitySnapshot {
  readonly status: "unknown" | "available" | "degraded";
  readonly checking: boolean;
  readonly report: ServiceCapabilitiesReport | null;
  readonly lastError: AppApiError | null;
  readonly nextProbeAt: number | null;
  readonly recoveredAt: number | null;
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
function readStoredReport(): ServiceCapabilitiesReport | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = SERVICE_CAPABILITIES_SCHEMA.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
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
function publish(next: ServiceCapabilitySnapshot): ServiceCapabilitySnapshot {
  snapshot = Object.freeze(next);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.serviceCapabilityState = next.status;
  }
  for (const listener of listeners) listener();
  return snapshot;
}

export function getServiceCapabilitySnapshot(): ServiceCapabilitySnapshot {
  return snapshot;
}

export function getServiceCapabilityServerSnapshot(): ServiceCapabilitySnapshot {
  return {
    status: "unknown",
    checking: false,
    report: null,
    lastError: null,
    nextProbeAt: null,
    recoveredAt: null,
  };
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

  publish({ ...snapshot, checking: true });
  activeProbe = api.get<unknown>("/health/capabilities", {
    timeout: 5_000,
    totalTimeout: 10_000,
    retry: {
      limit: 1,
      methods: ["get"],
      statusCodes: [408, 429, 502, 503, 504],
      afterStatusCodes: [429, 503],
      maxRetryAfter: 5_000,
      jitter: true,
      retryOnTimeout: true,
    },
    errorMessage: "서비스 상태를 확인하지 못했습니다.",
  }).then((payload) => {
    const report = SERVICE_CAPABILITIES_SCHEMA.parse(payload);
    const recoveredAt = snapshot.status === "degraded" && report.status === "available"
      ? Date.now()
      : snapshot.recoveredAt;
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
    });
  }).catch((error: unknown) => {
    if (isAbortError(error)) return snapshot;
    const appError = toAppApiError(error, "서비스 상태를 확인하지 못했습니다.");
    const degraded = appError.kind === "capability_unavailable"
      || appError.kind === "server"
      || appError.kind === "unreachable"
      || appError.kind === "timeout";
    return publish({
      ...snapshot,
      status: degraded ? "degraded" : snapshot.status,
      checking: false,
      lastError: appError,
      nextProbeAt: retryAt(appError.retryAfterSeconds),
    });
  }).finally(() => {
    activeProbe = null;
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
    nextProbeAt: retryAt(seconds),
  });
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const parsed = SERVICE_CAPABILITIES_SCHEMA.safeParse(JSON.parse(event.newValue));
    if (!parsed.success) return;
    publish({
      ...snapshot,
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
  if (runtimeUsers > 1) return stopServiceCapabilityRuntime;

  const refresh = () => { void probeServiceCapabilities(); };
  const onVisibility = () => {
    if (document.visibilityState === "visible") refresh();
  };
  globalThis.addEventListener("online", refresh, { passive: true });
  globalThis.addEventListener("focus", refresh, { passive: true });
  globalThis.addEventListener(
    SERVICE_CAPABILITY_ERROR_EVENT,
    onCapabilityFailure,
  );
  globalThis.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  intervalId = globalThis.setInterval(refresh, CHECK_INTERVAL_MS);
  removeRuntimeListeners = () => {
    globalThis.removeEventListener("online", refresh);
    globalThis.removeEventListener("focus", refresh);
    globalThis.removeEventListener(
      SERVICE_CAPABILITY_ERROR_EVENT,
      onCapabilityFailure,
    );
    globalThis.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  void probeServiceCapabilities();
  return stopServiceCapabilityRuntime;
}

function stopServiceCapabilityRuntime(): void {
  runtimeUsers = Math.max(0, runtimeUsers - 1);
  if (runtimeUsers > 0) return;
  removeRuntimeListeners?.();
  removeRuntimeListeners = null;
  if (intervalId) globalThis.clearInterval(intervalId);
  intervalId = null;
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
