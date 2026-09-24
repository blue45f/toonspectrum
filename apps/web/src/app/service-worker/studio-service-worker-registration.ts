/**
 * Client half of the Service Worker contract: registration, the update prompt,
 * and the field-recovery kill switch.
 *
 * Loaded through a dynamic `import()` from `main.tsx` after `load`, so none of
 * this joins the app entry chunk or competes with first paint.
 *
 * Update UX, stated plainly, because a creative tool gets exactly one chance to
 * get this right:
 *
 *  1. A new worker installs in the background and *parks in `waiting`*. It
 *     controls nothing, purges nothing, and the running build keeps every lazy
 *     chunk it already had. There is no mid-stroke swap, ever.
 *  2. The artist is told with a dismissible prompt. Nothing is forced.
 *  3. The apply action reads Studio's live update-safety registry first. Unsaved ink, an active
 *     save receipt, or a pending collaboration boundary disables the action before a reload is
 *     attempted. `beforeunload` remains a final browser-level backstop, not the primary safeguard.
 */
import {
  STUDIO_SERVICE_WORKER_CACHE_PREFIX,
  STUDIO_SERVICE_WORKER_MESSAGE,
} from "./studio-service-worker-policy";
import {
  getStudioUpdateSafetySnapshot,
  subscribeStudioUpdateSafety,
  type StudioUpdateSafetySnapshot,
} from "../../domains/creator/studio-update-safety";

const SERVICE_WORKER_URL = "/sw.js";
/** Append to any URL to recover from a bad worker. Documented in DEPLOY.md. */
export const STUDIO_SERVICE_WORKER_RESET_QUERY = "__toonspectrumSwReset";
const RESET_SESSION_KEY = "toonspectrum:sw-reset:v1";
const UPDATE_ATTRIBUTE = "data-studio-sw-update";
const UPDATE_MESSAGE_TIMEOUT_MS = 5_000;
const RELOAD_CANCELLED_FEEDBACK_MS = 1_500;

export type StudioServiceWorkerClientStatus =
  | "unsupported"
  | "registering"
  | "active"
  | "update-waiting"
  | "reset"
  | "failed";

interface StudioServiceWorkerClientApi {
  readonly status: StudioServiceWorkerClientStatus;
  applyUpdate(): Promise<void>;
  reset(): Promise<void>;
  inspect(): Promise<unknown>;
}

interface UpdatePromptCopy {
  readonly readyTitle: string;
  readonly readyDescription: string;
  readonly applyingTitle: string;
  readonly applyingDescription: string;
  readonly cancelledTitle: string;
  readonly cancelledDescription: string;
  readonly failedTitle: string;
  readonly failedDescription: string;
  readonly blockedTitle: string;
  readonly apply: string;
  readonly blockedApply: string;
  readonly retry: string;
  readonly dismiss: string;
}

let current: StudioServiceWorkerClientStatus = "registering";
let waitingWorker: ServiceWorker | null = null;

function publishStatus(next: StudioServiceWorkerClientStatus): void {
  current = next;
  document.documentElement.setAttribute(UPDATE_ATTRIBUTE, next);
  globalThis.dispatchEvent(
    new CustomEvent("toonspectrum:service-worker", { detail: { status: next } }),
  );
}

/** Purges every cache this app owns. Safe: no artist data lives in the Cache
 * API — documents are in OPFS/SQLite, which this never touches. */
async function purgeOwnedCaches(): Promise<void> {
  if (!("caches" in globalThis)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(
        (key) =>
          key.startsWith(STUDIO_SERVICE_WORKER_CACHE_PREFIX)
          || key.startsWith("toonspectrum-pwa-")
          || key.startsWith("toonspectrum-covers-"),
      )
      .map((key) => caches.delete(key)),
  );
}

/**
 * Unregisters every worker on this origin and drops our caches. Reachable
 * without any application code running, which is what makes it a real recovery
 * path rather than a debug affordance.
 */
export async function resetStudioServiceWorker(): Promise<void> {
  const registrations = await navigator.serviceWorker
    .getRegistrations()
    .catch(() => []);
  await Promise.all(registrations.map((entry) => entry.unregister()));
  await purgeOwnedCaches();
  publishStatus("reset");
}

function consumeResetRequest(): boolean {
  const url = new URL(globalThis.location.href);
  if (url.searchParams.get(STUDIO_SERVICE_WORKER_RESET_QUERY) !== "1") {
    return false;
  }
  url.searchParams.delete(STUDIO_SERVICE_WORKER_RESET_QUERY);
  try {
    // One reload per session: a reset that somehow does not stick must not
    // trap the browser in a loop.
    if (sessionStorage.getItem(RESET_SESSION_KEY) === "done") return true;
    sessionStorage.setItem(RESET_SESSION_KEY, "done");
  } catch {
    return true;
  }
  void resetStudioServiceWorker().finally(() => {
    globalThis.location.replace(url.toString());
  });
  return true;
}

async function messageWorker(
  worker: ServiceWorker,
  type: string,
): Promise<unknown> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(undefined), UPDATE_MESSAGE_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}

function updatePromptCopy(): UpdatePromptCopy {
  const english = document.documentElement.lang.toLowerCase().startsWith("en");
  return english
    ? {
        readyTitle: "A new version is ready",
        readyDescription: "Update now to use the latest features and stability improvements.",
        applyingTitle: "Applying the update…",
        applyingDescription: "This usually takes only a moment. Unsaved work stays protected by the browser reload guard.",
        cancelledTitle: "The reload was cancelled",
        cancelledDescription: "Save your work, then try the update again when you are ready.",
        failedTitle: "The update could not be applied",
        failedDescription: "Your current session is unchanged. You can safely try again.",
        blockedTitle: "Finish saving before updating",
        apply: "Update now",
        blockedApply: "Waiting for a safe state",
        retry: "Try again",
        dismiss: "Later",
      }
    : {
        readyTitle: "새 버전이 준비됐습니다",
        readyDescription: "지금 업데이트하면 최신 기능과 안정성 개선을 바로 적용할 수 있습니다.",
        applyingTitle: "업데이트 적용 중…",
        applyingDescription: "잠시만 기다려 주세요. 저장하지 않은 작업은 새로고침 보호 기능이 지켜줍니다.",
        cancelledTitle: "새로고침이 취소됐습니다",
        cancelledDescription: "작업을 저장한 뒤 준비되었을 때 다시 업데이트해 주세요.",
        failedTitle: "업데이트를 적용하지 못했습니다",
        failedDescription: "현재 작업은 그대로 유지됩니다. 안전하게 다시 시도할 수 있습니다.",
        blockedTitle: "저장과 동기화가 끝난 뒤 업데이트할 수 있습니다",
        apply: "지금 업데이트",
        blockedApply: "안전 상태 대기 중",
        retry: "다시 시도",
        dismiss: "나중에",
      };
}

export function renderStudioServiceWorkerUpdatePrompt(onApply: () => Promise<void>): void {
  if (document.getElementById("toonspectrum-sw-update")) return;
  const copy = updatePromptCopy();
  const host = document.createElement("div");
  host.id = "toonspectrum-sw-update";
  // A shadow root keeps this prompt out of reach of the app's cascade — and
  // keeps it from perturbing Studio's own layout.
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { color-scheme: inherit; }
      .card {
        position: fixed; inset-block-end: 16px; inset-inline-start: 16px;
        z-index: 2147483000; display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 12px; align-items: center; width: min(520px, calc(100vw - 32px));
        padding: 14px; border: 1px solid var(--color-control-border, #64748b); border-radius: 14px;
        font: 500 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--color-fg, #f8fafc); background: var(--color-panel, #0f172a);
        background: color-mix(in oklch, var(--color-panel, #0f172a) 96%, transparent);
        box-shadow: 0 14px 38px rgb(0 0 0 / 42%);
        backdrop-filter: blur(14px);
      }
      .status-dot {
        width: 10px; height: 10px; border-radius: 999px; background: var(--color-accent, #818cf8);
        box-shadow: 0 0 0 5px color-mix(in oklch, var(--color-accent, #818cf8) 18%, transparent);
      }
      .copy { min-width: 0; }
      .title { display: block; font-weight: 750; letter-spacing: -0.01em; }
      .description { display: block; margin-top: 2px; color: var(--color-fg-2, #cbd5e1); font-size: 12px; }
      .actions { display: flex; gap: 7px; align-items: center; }
      button {
        min-height: 44px; font: inherit; font-weight: 700; cursor: pointer;
        border-radius: 8px; border: 1px solid transparent; padding: 7px 11px;
        transition: transform 90ms ease, filter 120ms ease, opacity 120ms ease, background 120ms ease;
      }
      button:hover:not(:disabled) { filter: brightness(1.08); }
      button:active:not(:disabled) { transform: translateY(1px) scale(.985); }
      button:focus-visible { outline: 3px solid var(--color-focus-ring, #a5b4fc); outline-offset: 2px; }
      button:disabled { cursor: wait; opacity: .68; }
      .apply { min-width: 104px; background: var(--color-accent, #6366f1); color: var(--color-on-accent, #fff); }
      .dismiss { background: var(--color-card, transparent); color: var(--color-fg-2, #cbd5e1); border-color: var(--color-control-border, #475569); }
      .spinner {
        display: none; width: 13px; height: 13px; margin-inline-end: 6px; vertical-align: -2px;
        border: 2px solid color-mix(in oklch, var(--color-on-accent, #fff) 35%, transparent); border-top-color: var(--color-on-accent, #fff); border-radius: 999px;
        animation: spin .7s linear infinite;
      }
      .card[data-state="applying"] .spinner { display: inline-block; }
      .card[data-state="applying"] .status-dot { animation: pulse 1s ease-in-out infinite; }
      .card[data-state="error"] .status-dot { background: var(--color-bad, #fb7185); box-shadow: 0 0 0 5px color-mix(in oklch, var(--color-bad, #fb7185) 18%, transparent); }
      .card[data-state="blocked"] .status-dot { background: var(--color-warn, #fbbf24); box-shadow: 0 0 0 5px color-mix(in oklch, var(--color-warn, #fbbf24) 18%, transparent); }
      .card[data-state="blocked"] .apply { cursor: not-allowed; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulse { 50% { opacity: .45; transform: scale(.82); } }
      @media (prefers-reduced-motion: reduce) {
        button, .status-dot, .spinner { animation: none !important; transition: none !important; }
      }
      @media (prefers-contrast: more) {
        .card { border-width: 2px; border-color: var(--color-line-strong, #cbd5e1); box-shadow: none; backdrop-filter: none; }
        button { border-color: var(--color-line-strong, #cbd5e1); }
      }
      @media (forced-colors: active) {
        .card { border: 2px solid CanvasText; color: CanvasText; background: Canvas; box-shadow: none; backdrop-filter: none; }
        .status-dot { background: Highlight; box-shadow: none; }
        button { border: 2px solid ButtonText; color: ButtonText; background: ButtonFace; forced-color-adjust: auto; }
        button:focus-visible { outline-color: Highlight; }
      }
      @media (max-width: 560px) {
        .card { inset-inline: 12px; inset-block-end: 12px; width: auto; grid-template-columns: auto minmax(0, 1fr); }
        .actions { grid-column: 1 / -1; width: 100%; }
        .apply { flex: 1; }
      }
    </style>
    <div class="card" data-state="ready" role="region" aria-labelledby="toonspectrum-sw-update-title">
      <span class="status-dot" aria-hidden="true"></span>
      <span class="copy" role="status" aria-live="polite" aria-atomic="true">
        <strong class="title" id="toonspectrum-sw-update-title"></strong>
        <span class="description"></span>
      </span>
      <span class="actions">
        <button class="apply" type="button"><span class="spinner" aria-hidden="true"></span><span class="apply-label"></span></button>
        <button class="dismiss" type="button"></button>
      </span>
    </div>`;

  const card = root.querySelector<HTMLElement>(".card");
  const title = root.querySelector<HTMLElement>(".title");
  const description = root.querySelector<HTMLElement>(".description");
  const apply = root.querySelector<HTMLButtonElement>(".apply");
  const applyLabel = root.querySelector<HTMLElement>(".apply-label");
  const dismiss = root.querySelector<HTMLButtonElement>(".dismiss");
  if (!card || !title || !description || !apply || !applyLabel || !dismiss) return;

  const setReady = (variant: "ready" | "cancelled" = "ready"): void => {
    card.dataset.state = "ready";
    title.textContent = variant === "cancelled" ? copy.cancelledTitle : copy.readyTitle;
    description.textContent = variant === "cancelled" ? copy.cancelledDescription : copy.readyDescription;
    applyLabel.textContent = variant === "cancelled" ? copy.retry : copy.apply;
    apply.disabled = false;
    apply.removeAttribute("aria-busy");
    apply.removeAttribute("aria-disabled");
    dismiss.disabled = false;
  };
  const setBlocked = (snapshot: StudioUpdateSafetySnapshot): void => {
    card.dataset.state = "blocked";
    title.textContent = copy.blockedTitle;
    description.textContent = snapshot.message;
    applyLabel.textContent = copy.blockedApply;
    apply.disabled = true;
    apply.setAttribute("aria-disabled", "true");
    apply.removeAttribute("aria-busy");
    dismiss.disabled = false;
  };
  const setApplying = (): void => {
    card.dataset.state = "applying";
    title.textContent = copy.applyingTitle;
    description.textContent = copy.applyingDescription;
    applyLabel.textContent = copy.applyingTitle;
    apply.disabled = true;
    apply.setAttribute("aria-busy", "true");
    dismiss.disabled = true;
  };
  const setFailed = (): void => {
    card.dataset.state = "error";
    title.textContent = copy.failedTitle;
    description.textContent = copy.failedDescription;
    applyLabel.textContent = copy.retry;
    apply.disabled = false;
    apply.removeAttribute("aria-busy");
    apply.removeAttribute("aria-disabled");
    dismiss.disabled = false;
  };

  const refreshSafety = (snapshot = getStudioUpdateSafetySnapshot()): void => {
    if (card.dataset.state === "applying") return;
    if (snapshot.safe) setReady();
    else setBlocked(snapshot);
  };
  refreshSafety();
  const unsubscribeSafety = subscribeStudioUpdateSafety(refreshSafety);
  const safetyTimer = globalThis.setInterval(refreshSafety, 1_000);
  const dispose = () => {
    unsubscribeSafety();
    globalThis.clearInterval(safetyTimer);
  };
  dismiss.textContent = copy.dismiss;
  apply.addEventListener("click", () => {
    const safety = getStudioUpdateSafetySnapshot();
    if (!safety.safe) {
      setBlocked(safety);
      return;
    }
    if (apply.disabled) return;
    setApplying();
    void onApply().then(
      () => {
        // If navigation succeeds this context disappears before the timer fires.
        // If another unload guard kept the artist on the page, restore an actionable prompt.
        globalThis.setTimeout(() => {
          if (document.getElementById(host.id) !== host) return;
          const latest = getStudioUpdateSafetySnapshot();
          if (latest.safe) setReady("cancelled");
          else setBlocked(latest);
        }, RELOAD_CANCELLED_FEEDBACK_MS);
      },
      () => {
        const latest = getStudioUpdateSafetySnapshot();
        if (latest.safe) setFailed();
        else setBlocked(latest);
      },
    );
  });
  dismiss.addEventListener("click", () => {
    dispose();
    host.remove();
  });
  document.body.append(host);
}

/**
 * Hands control to the waiting worker and reloads. `location.reload()` is a
 * plain navigation, so any `beforeunload` guard Studio installed still gets to
 * warn about unsaved work — the artist keeps the final say.
 */
export async function applyStudioServiceWorkerUpdate(): Promise<void> {
  const worker = waitingWorker;
  if (!worker) return;
  const safety = getStudioUpdateSafetySnapshot();
  if (!safety.safe) {
    throw new Error(`studio-update-blocked:${safety.reason ?? "unsafe"}:${safety.message}`);
  }
  const response = await messageWorker(worker, STUDIO_SERVICE_WORKER_MESSAGE.applyUpdate);
  if (
    response
    && typeof response === "object"
    && "ok" in response
    && (response as { readonly ok?: unknown }).ok === false
  ) {
    throw new Error(String((response as { readonly error?: unknown }).error ?? "service worker update failed"));
  }
  globalThis.location.reload();
}

function watchForUpdate(registration: ServiceWorkerRegistration): void {
  const announce = (worker: ServiceWorker | null): void => {
    // `controller` being present is what distinguishes "an update is waiting"
    // from "this is the very first install", which must stay silent.
    if (!worker || !navigator.serviceWorker.controller) return;
    waitingWorker = worker;
    publishStatus("update-waiting");
    renderStudioServiceWorkerUpdatePrompt(applyStudioServiceWorkerUpdate);
  };

  announce(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") announce(registration.waiting);
    });
  });
}

export function registerStudioServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    publishStatus("unsupported");
    return;
  }
  if (consumeResetRequest()) return;

  const api: StudioServiceWorkerClientApi = {
    get status() {
      return current;
    },
    applyUpdate: applyStudioServiceWorkerUpdate,
    reset: resetStudioServiceWorker,
    inspect: async () => {
      const worker = navigator.serviceWorker.controller;
      return worker
        ? messageWorker(worker, STUDIO_SERVICE_WORKER_MESSAGE.inspect)
        : undefined;
    },
  };
  Object.defineProperty(globalThis, "__toonspectrumServiceWorker", {
    value: api,
    configurable: true,
  });

  publishStatus("registering");
  navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" }).then(
    (registration) => {
      if (!registration) {
        publishStatus("failed");
        return;
      }
      publishStatus(
        navigator.serviceWorker.controller ? "active" : "registering",
      );
      watchForUpdate(registration);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        publishStatus("active");
      });
    },
    () => {
      publishStatus("failed");
    },
  );
}
