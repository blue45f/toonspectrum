import { apiFetch } from "@/platform/api";

export const STUDIO_CONNECTIVITY_EVENT = "toonspectrum:studio-connectivity";

export type StudioConnectivityMode =
  | "online"
  | "reconnecting"
  | "server-unavailable"
  | "offline";

export interface StudioConnectivitySnapshot {
  readonly browserOnline: boolean;
  readonly serverReachable: boolean | null;
  readonly checking: boolean;
  readonly mode: StudioConnectivityMode;
  /** Unknown reachability stays optimistic until the first bounded probe fails. */
  readonly serverAvailable: boolean;
  readonly localOnly: boolean;
  readonly lastCheckedAt: number | null;
  readonly consecutiveFailures: number;
}

export interface StudioConnectivityInput {
  readonly browserOnline: boolean;
  readonly serverReachable: boolean | null;
  readonly checking: boolean;
  readonly lastCheckedAt?: number | null;
  readonly consecutiveFailures?: number;
}

const HEALTH_TIMEOUT_MS = 4_000;
const HEALTH_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 45_000;

function onlineFromNavigator(): boolean {
  try {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  } catch {
    return true;
  }
}

export function resolveStudioConnectivitySnapshot(
  input: StudioConnectivityInput,
): StudioConnectivitySnapshot {
  const mode: StudioConnectivityMode = !input.browserOnline
    ? "offline"
    : input.checking && input.serverReachable !== true
      ? "reconnecting"
      : input.serverReachable === false
        ? "server-unavailable"
        : "online";
  const verifiedReconnectPending = input.checking
    && input.serverReachable !== true
    && input.lastCheckedAt !== null
    && input.lastCheckedAt !== undefined;
  const serverAvailable = input.browserOnline
    && input.serverReachable !== false
    && !verifiedReconnectPending;
  return Object.freeze({
    browserOnline: input.browserOnline,
    serverReachable: input.serverReachable,
    checking: input.checking,
    mode,
    serverAvailable,
    localOnly: !serverAvailable,
    lastCheckedAt: input.lastCheckedAt ?? null,
    consecutiveFailures: Math.max(0, Math.trunc(input.consecutiveFailures ?? 0)),
  });
}

let snapshot = resolveStudioConnectivitySnapshot({
  browserOnline: onlineFromNavigator(),
  serverReachable: null,
  checking: false,
});
const listeners = new Set<() => void>();
let runtimeUsers = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let probeController: AbortController | null = null;
let removeRuntimeListeners: (() => void) | null = null;
let removePassiveNetworkListeners: (() => void) | null = null;

export function getStudioConnectivitySnapshot(): StudioConnectivitySnapshot {
  const browserOnline = onlineFromNavigator();
  if (browserOnline !== snapshot.browserOnline) {
    snapshot = resolveStudioConnectivitySnapshot({
      browserOnline,
      serverReachable: browserOnline ? null : false,
      checking: false,
      lastCheckedAt: snapshot.lastCheckedAt,
      consecutiveFailures: snapshot.consecutiveFailures,
    });
  }
  return snapshot;
}

export function getStudioConnectivityServerSnapshot(): StudioConnectivitySnapshot {
  return resolveStudioConnectivitySnapshot({
    browserOnline: true,
    serverReachable: null,
    checking: false,
  });
}

export function subscribeStudioConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  if (!removePassiveNetworkListeners && typeof window !== "undefined") {
    const syncBrowserConnection = (): void => {
      const browserOnline = onlineFromNavigator();
      update({
        browserOnline,
        serverReachable: browserOnline ? null : false,
        checking: browserOnline && runtimeUsers > 0,
        lastCheckedAt: Date.now(),
      });
    };
    window.addEventListener("online", syncBrowserConnection);
    window.addEventListener("offline", syncBrowserConnection);
    removePassiveNetworkListeners = () => {
      window.removeEventListener("online", syncBrowserConnection);
      window.removeEventListener("offline", syncBrowserConnection);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      removePassiveNetworkListeners?.();
      removePassiveNetworkListeners = null;
    }
  };
}

function publish(next: StudioConnectivitySnapshot): void {
  if (
    next.browserOnline === snapshot.browserOnline
    && next.serverReachable === snapshot.serverReachable
    && next.checking === snapshot.checking
    && next.mode === snapshot.mode
    && next.lastCheckedAt === snapshot.lastCheckedAt
    && next.consecutiveFailures === snapshot.consecutiveFailures
  ) return;
  snapshot = next;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.studioConnectivity = next.mode;
    document.documentElement.dataset.studioNetworkFeatures = next.serverAvailable ? "enabled" : "local-only";
  }
  if (typeof globalThis.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    globalThis.dispatchEvent(new CustomEvent(STUDIO_CONNECTIVITY_EVENT, { detail: next }));
  }
  for (const listener of listeners) listener();
}

function update(input: Partial<StudioConnectivityInput>): void {
  publish(resolveStudioConnectivitySnapshot({
    browserOnline: input.browserOnline ?? snapshot.browserOnline,
    serverReachable: input.serverReachable !== undefined
      ? input.serverReachable
      : snapshot.serverReachable,
    checking: input.checking ?? snapshot.checking,
    lastCheckedAt: input.lastCheckedAt !== undefined
      ? input.lastCheckedAt
      : snapshot.lastCheckedAt,
    consecutiveFailures: input.consecutiveFailures ?? snapshot.consecutiveFailures,
  }));
}

export async function isStudioServerCapabilityAvailable(
  response: Response,
): Promise<boolean> {
  if (!response.ok) return false;
  try {
    const payload = await response.json() as {
      readonly capabilities?: {
        readonly studioProjectRead?: unknown;
        readonly studioCloudSave?: unknown;
      };
    };
    return payload.capabilities?.studioProjectRead !== "unavailable"
      && payload.capabilities?.studioCloudSave !== "unavailable";
  } catch {
    return false;
  }
}

async function probeStudioServer(): Promise<void> {
  if (!onlineFromNavigator()) {
    probeController?.abort();
    probeController = null;
    update({
      browserOnline: false,
      serverReachable: false,
      checking: false,
      lastCheckedAt: Date.now(),
    });
    return;
  }
  probeController?.abort();
  const controller = new AbortController();
  probeController = controller;
  update({ browserOnline: true, checking: true });
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await apiFetch("/health/capabilities", {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (probeController !== controller) return;
    const reachable = await isStudioServerCapabilityAvailable(response);
    update({
      browserOnline: true,
      serverReachable: reachable,
      checking: false,
      lastCheckedAt: Date.now(),
      consecutiveFailures: reachable ? 0 : snapshot.consecutiveFailures + 1,
    });
  } catch {
    if (probeController !== controller) return;
    update({
      browserOnline: onlineFromNavigator(),
      serverReachable: false,
      checking: false,
      lastCheckedAt: Date.now(),
      consecutiveFailures: snapshot.consecutiveFailures + 1,
    });
  } finally {
    clearTimeout(timer);
    if (probeController === controller) probeController = null;
  }
}

function probeIfStale(): void {
  if (!onlineFromNavigator()) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const checkedAt = snapshot.lastCheckedAt ?? 0;
  if (snapshot.checking || Date.now() - checkedAt < STALE_AFTER_MS) return;
  void probeStudioServer();
}

export function isStudioServerUnavailableError(error: unknown): boolean {
  if (!onlineFromNavigator()) return true;
  if (error instanceof TypeError) {
    const message = error.message.trim().toLowerCase();
    return /failed to fetch|fetch failed|networkerror|network request failed|load failed/u.test(message);
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "NetworkError" || error.name === "TimeoutError";
  }
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { readonly response?: unknown }).response;
    if (response && typeof response === "object" && "status" in response) {
      const status = (response as { readonly status?: unknown }).status;
      return typeof status === "number" && status >= 500;
    }
  }
  return false;
}

export function reportStudioServerRequestSuccess(): void {
  if (!onlineFromNavigator()) return;
  update({
    browserOnline: true,
    serverReachable: true,
    checking: false,
    lastCheckedAt: Date.now(),
    consecutiveFailures: 0,
  });
}

export function reportStudioServerRequestFailure(error: unknown): boolean {
  if (!isStudioServerUnavailableError(error)) return false;
  update({
    browserOnline: onlineFromNavigator(),
    serverReachable: false,
    checking: false,
    lastCheckedAt: Date.now(),
    consecutiveFailures: snapshot.consecutiveFailures + 1,
  });
  return true;
}

/** Starts bounded server-health monitoring while a Studio document is mounted. */
export function startStudioConnectivityRuntime(): () => void {
  runtimeUsers += 1;
  if (runtimeUsers > 1) return stopStudioConnectivityRuntime;

  const onOffline = (): void => {
    probeController?.abort();
    probeController = null;
    update({
      browserOnline: false,
      serverReachable: false,
      checking: false,
      lastCheckedAt: Date.now(),
    });
  };
  const onOnline = (): void => {
    update({ browserOnline: true, checking: true });
    void probeStudioServer();
  };
  const onFocus = (): void => probeIfStale();
  const onVisibility = (): void => {
    if (typeof document === "undefined" || document.visibilityState === "visible") probeIfStale();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    removeRuntimeListeners = () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }
  intervalId = setInterval(probeIfStale, HEALTH_INTERVAL_MS);
  if (onlineFromNavigator()) {
    update({ browserOnline: true, checking: true });
    void probeStudioServer();
  } else {
    onOffline();
  }
  return stopStudioConnectivityRuntime;
}

function stopStudioConnectivityRuntime(): void {
  runtimeUsers = Math.max(0, runtimeUsers - 1);
  if (runtimeUsers > 0) return;
  removeRuntimeListeners?.();
  removeRuntimeListeners = null;
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  probeController?.abort();
  probeController = null;
}
