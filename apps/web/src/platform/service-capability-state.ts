import { useSyncExternalStore } from "react";

import { apiPath } from "@/platform/api";
import { SERVICE_CAPABILITY_ERROR_EVENT } from "@/platform/api-error";

export type ServiceCapabilityState = "available" | "unavailable";

export interface ServiceCapabilityReport {
  readonly status: "available" | "degraded";
  readonly incidentId: string | null;
  readonly capabilities: Readonly<{
    publicCatalog: ServiceCapabilityState;
    authSession: ServiceCapabilityState;
    communityRead: ServiceCapabilityState;
    communityWrite: ServiceCapabilityState;
    marketplaceRead: ServiceCapabilityState;
    studioLocalEditing: ServiceCapabilityState;
    studioProjectRead: ServiceCapabilityState;
    studioCloudSave: ServiceCapabilityState;
    realtimeCollaboration: ServiceCapabilityState;
    publishing: ServiceCapabilityState;
    serverAi: ServiceCapabilityState;
  }>;
  readonly failedChecks: readonly string[];
  readonly checkedAt: string;
}

export interface ServiceCapabilitySnapshot {
  readonly status: "unknown" | "available" | "degraded";
  readonly checking: boolean;
  readonly report: ServiceCapabilityReport | null;
  readonly detectedAt: string | null;
  readonly recoveredAt: number | null;
  readonly error: string | null;
}

const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const CHANNEL_NAME = "toonspectrum:service-capabilities:v1";

const AVAILABLE_CAPABILITIES: ServiceCapabilityReport["capabilities"] = {
  publicCatalog: "available",
  authSession: "available",
  communityRead: "available",
  communityWrite: "available",
  marketplaceRead: "available",
  studioLocalEditing: "available",
  studioProjectRead: "available",
  studioCloudSave: "available",
  realtimeCollaboration: "available",
  publishing: "available",
  serverAi: "available",
};

let snapshot: ServiceCapabilitySnapshot = Object.freeze({
  status: "unknown",
  checking: false,
  report: null,
  detectedAt: null,
  recoveredAt: null,
  error: null,
});
const listeners = new Set<() => void>();
let runtimeUsers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let requestController: AbortController | null = null;
let removeListeners: (() => void) | null = null;
let channel: BroadcastChannel | null = null;

function publish(next: ServiceCapabilitySnapshot, broadcast = true): void {
  snapshot = Object.freeze(next);
  for (const listener of listeners) listener();
  if (broadcast) {
    try {
      channel?.postMessage({
        type: "capabilities",
        status: next.status,
        report: next.report,
        detectedAt: next.detectedAt,
        recoveredAt: next.recoveredAt,
      });
    } catch {
      // Cross-tab synchronization is optional; the local poll remains authoritative.
    }
  }
}

function isCapabilityState(value: unknown): value is ServiceCapabilityState {
  return value === "available" || value === "unavailable";
}

function parseReport(value: unknown): ServiceCapabilityReport | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ServiceCapabilityReport>;
  const capabilities = source.capabilities;
  if (!capabilities || typeof capabilities !== "object") return null;
  const keys = Object.keys(AVAILABLE_CAPABILITIES) as Array<
    keyof ServiceCapabilityReport["capabilities"]
  >;
  if (!keys.every((key) => isCapabilityState(capabilities[key]))) return null;
  if (source.status !== "available" && source.status !== "degraded") return null;
  if (typeof source.checkedAt !== "string" || !source.checkedAt) return null;
  return {
    status: source.status,
    incidentId: typeof source.incidentId === "string"
      ? source.incidentId
      : null,
    capabilities: capabilities as ServiceCapabilityReport["capabilities"],
    failedChecks: Array.isArray(source.failedChecks)
      ? source.failedChecks.filter((item): item is string => typeof item === "string")
      : [],
    checkedAt: source.checkedAt,
  };
}

function capabilityKey(value: unknown): keyof ServiceCapabilityReport["capabilities"] | null {
  if (typeof value !== "string") return null;
  const map: Record<string, keyof ServiceCapabilityReport["capabilities"]> = {
    "community.read": "communityRead",
    "community.write": "communityWrite",
    "community.reviews.read": "communityRead",
    "marketplace.read": "marketplaceRead",
    "creator.marketplace.read": "marketplaceRead",
    "studio.project.read": "studioProjectRead",
    "studio.cloud.save": "studioCloudSave",
    "studio.collaboration": "realtimeCollaboration",
    "studio.publish": "publishing",
    "server.ai": "serverAi",
  };
  return map[value] ?? null;
}

function publishObservedFailure(event: Event): void {
  const detail = event instanceof CustomEvent && event.detail
    && typeof event.detail === "object"
    ? event.detail as Record<string, unknown>
    : {};
  const key = capabilityKey(detail.capability);
  const capabilities = { ...AVAILABLE_CAPABILITIES };
  if (key) capabilities[key] = "unavailable";
  else {
    capabilities.communityRead = "unavailable";
    capabilities.communityWrite = "unavailable";
    capabilities.marketplaceRead = "unavailable";
    capabilities.studioProjectRead = "unavailable";
    capabilities.studioCloudSave = "unavailable";
    capabilities.publishing = "unavailable";
  }
  const detectedAt = typeof detail.detectedAt === "string"
    ? detail.detectedAt
    : new Date().toISOString();
  publish({
    status: "degraded",
    checking: false,
    report: {
      status: "degraded",
      incidentId: typeof detail.incidentId === "string"
        ? detail.incidentId
        : null,
      capabilities,
      failedChecks: ["observed_request_failure"],
      checkedAt: detectedAt,
    },
    detectedAt,
    recoveredAt: null,
    error: null,
  });
}

export async function refreshServiceCapabilityState(): Promise<void> {
  if (typeof fetch !== "function") return;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  publish({ ...snapshot, checking: true, error: null }, false);
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(apiPath("/health/capabilities"), {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`capability probe failed (${response.status})`);
    const report = parseReport(await response.json());
    if (!report) throw new Error("capability response is invalid");
    const wasDegraded = snapshot.status === "degraded";
    publish({
      status: report.status,
      checking: false,
      report,
      detectedAt: report.status === "degraded"
        ? snapshot.detectedAt ?? report.checkedAt
        : null,
      recoveredAt: wasDegraded && report.status === "available"
        ? Date.now()
        : snapshot.recoveredAt,
      error: null,
    });
  } catch (error) {
    if (controller.signal.aborted && requestController !== controller) return;
    publish({
      ...snapshot,
      checking: false,
      error: error instanceof Error ? error.message : "상태를 확인하지 못했습니다.",
    }, false);
  } finally {
    globalThis.clearTimeout(timeout);
    if (requestController === controller) requestController = null;
  }
}

export function requestServiceCapabilityRefresh(): void {
  void refreshServiceCapabilityState();
}

export function startServiceCapabilityRuntime(): () => void {
  runtimeUsers += 1;
  if (runtimeUsers > 1) return stopServiceCapabilityRuntime;
  if (typeof window === "undefined") return stopServiceCapabilityRuntime;

  try {
    channel = typeof BroadcastChannel === "function"
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (!value || typeof value !== "object") return;
        const message = value as Record<string, unknown>;
        if (message.type !== "capabilities") return;
        const report = parseReport(message.report);
        if (!report) return;
        publish({
          status: report.status,
          checking: false,
          report,
          detectedAt: typeof message.detectedAt === "string"
            ? message.detectedAt
            : null,
          recoveredAt: typeof message.recoveredAt === "number"
            ? message.recoveredAt
            : null,
          error: null,
        }, false);
      };
    }
  } catch {
    channel = null;
  }

  const onFocus = () => requestServiceCapabilityRefresh();
  const onOnline = () => requestServiceCapabilityRefresh();
  const onVisibility = () => {
    if (document.visibilityState === "visible") requestServiceCapabilityRefresh();
  };
  window.addEventListener("focus", onFocus, { passive: true });
  window.addEventListener("online", onOnline, { passive: true });
  window.addEventListener(SERVICE_CAPABILITY_ERROR_EVENT, publishObservedFailure);
  document.addEventListener("visibilitychange", onVisibility, { passive: true });
  removeListeners = () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener(SERVICE_CAPABILITY_ERROR_EVENT, publishObservedFailure);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  timer = globalThis.setInterval(
    requestServiceCapabilityRefresh,
    POLL_INTERVAL_MS,
  );
  requestServiceCapabilityRefresh();
  return stopServiceCapabilityRuntime;
}

function stopServiceCapabilityRuntime(): void {
  runtimeUsers = Math.max(0, runtimeUsers - 1);
  if (runtimeUsers > 0) return;
  requestController?.abort();
  requestController = null;
  if (timer) globalThis.clearInterval(timer);
  timer = null;
  removeListeners?.();
  removeListeners = null;
  channel?.close();
  channel = null;
}

export function getServiceCapabilitySnapshot(): ServiceCapabilitySnapshot {
  return snapshot;
}

export function getServiceCapabilityServerSnapshot(): ServiceCapabilitySnapshot {
  return {
    status: "unknown",
    checking: false,
    report: null,
    detectedAt: null,
    recoveredAt: null,
    error: null,
  };
}

export function subscribeServiceCapabilityState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useServiceCapabilityState(): ServiceCapabilitySnapshot {
  return useSyncExternalStore(
    subscribeServiceCapabilityState,
    getServiceCapabilitySnapshot,
    getServiceCapabilityServerSnapshot,
  );
}
