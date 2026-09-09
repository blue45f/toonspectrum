export type PwaInstallStatus =
  | "idle"
  | "available"
  | "prompting"
  | "accepted"
  | "dismissed"
  | "manual"
  | "installed"
  | "unavailable";

export type PwaInstallPlatform = "ios" | "android" | "desktop" | "unknown";
export type PwaInstallResult = "accepted" | "dismissed" | "manual" | "installed" | "unavailable";
export type PwaServiceWorkerStatus =
  | "unknown"
  | "unsupported"
  | "registering"
  | "active"
  | "update-waiting"
  | "reset"
  | "failed";

export interface PwaInstallSnapshot {
  readonly status: PwaInstallStatus;
  readonly platform: PwaInstallPlatform;
  readonly standalone: boolean;
  readonly online: boolean;
  readonly serviceWorkerStatus: PwaServiceWorkerStatus;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISPLAY_MODE_QUERY = "(display-mode: standalone)";
const SERVER_SNAPSHOT: PwaInstallSnapshot = Object.freeze({
  status: "unavailable",
  platform: "unknown",
  standalone: false,
  online: true,
  serviceWorkerStatus: "unknown",
});

let snapshot: PwaInstallSnapshot = SERVER_SNAPSHOT;
let installPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function detectPlatform(userAgent: string): PwaInstallPlatform {
  if (/iPad|iPhone|iPod/u.test(userAgent)) return "ios";
  if (/Android/u.test(userAgent)) return "android";
  if (/Macintosh|Windows|Linux|CrOS/u.test(userAgent)) return "desktop";
  return "unknown";
}

function displayModeStandalone(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(DISPLAY_MODE_QUERY).matches;
  } catch {
    return false;
  }
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return Boolean(navigatorWithStandalone.standalone) || displayModeStandalone();
}

function isServiceWorkerStatus(value: unknown): value is PwaServiceWorkerStatus {
  return value === "unknown"
    || value === "unsupported"
    || value === "registering"
    || value === "active"
    || value === "update-waiting"
    || value === "reset"
    || value === "failed";
}

function serviceWorkerStatusFromDocument(): PwaServiceWorkerStatus {
  if (typeof document === "undefined") return "unknown";
  const value = document.documentElement.getAttribute("data-studio-sw-update");
  return isServiceWorkerStatus(value) ? value : "unknown";
}

function update(patch: Partial<PwaInstallSnapshot>): void {
  const next = Object.freeze({ ...snapshot, ...patch });
  if (
    next.status === snapshot.status
    && next.platform === snapshot.platform
    && next.standalone === snapshot.standalone
    && next.online === snapshot.online
    && next.serviceWorkerStatus === snapshot.serviceWorkerStatus
  ) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function initializePwaInstallCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const standalone = detectStandalone();
  const platform = detectPlatform(navigator.userAgent);
  snapshot = Object.freeze({
    status: standalone ? "installed" : platform === "ios" ? "manual" : "idle",
    platform,
    standalone,
    online: navigator.onLine,
    serviceWorkerStatus: serviceWorkerStatusFromDocument(),
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    update({ status: "available" });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    update({ status: "installed", standalone: true });
  });
  window.addEventListener("online", () => update({ online: true }));
  window.addEventListener("offline", () => update({ online: false }));
  window.addEventListener("toonspectrum:service-worker", (event) => {
    const detail = (event as CustomEvent<{ status?: unknown }>).detail;
    if (isServiceWorkerStatus(detail?.status)) {
      update({ serviceWorkerStatus: detail.status });
    }
  });

  if (typeof window.matchMedia === "function") {
    const displayMode = window.matchMedia(DISPLAY_MODE_QUERY);
    const onDisplayModeChange = () => {
      const nextStandalone = detectStandalone();
      update({
        standalone: nextStandalone,
        status: nextStandalone ? "installed" : snapshot.status,
      });
    };
    if (typeof displayMode.addEventListener === "function") {
      displayMode.addEventListener("change", onDisplayModeChange);
    } else {
      displayMode.addListener(onDisplayModeChange);
    }
  }
}

export function getPwaInstallSnapshot(): PwaInstallSnapshot {
  initializePwaInstallCapture();
  return snapshot;
}

export function getPwaInstallServerSnapshot(): PwaInstallSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribePwaInstall(listener: () => void): () => void {
  initializePwaInstallCapture();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function requestPwaInstall(): Promise<PwaInstallResult> {
  initializePwaInstallCapture();
  if (snapshot.standalone || snapshot.status === "installed") return "installed";
  if (!installPrompt) {
    if (snapshot.platform === "ios") {
      update({ status: "manual" });
      return "manual";
    }
    update({ status: "unavailable" });
    return "unavailable";
  }

  const prompt = installPrompt;
  update({ status: "prompting" });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    installPrompt = null;
    if (choice.outcome === "accepted") {
      update({ status: "accepted" });
      return "accepted";
    }
    update({ status: "dismissed" });
    return "dismissed";
  } catch {
    installPrompt = null;
    update({ status: "unavailable" });
    return "unavailable";
  }
}
