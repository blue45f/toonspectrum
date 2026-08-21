/**
 * Production-preview E2E for the real multi-window Studio companion.
 *
 * This deliberately does not mock BroadcastChannel or render multiple React roots in one
 * document. It opens the shipped Studio, follows the user-visible View menu into an actual popup,
 * verifies bidirectional tool commands across two top-level pages, opens a dedicated Navigator
 * window, and proves close/reopen recovery.
 *
 * Run after `pnpm run build`:
 *   pnpm run verify:studio-companion
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  chromium,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "playwright";
import { preview, type PreviewServer } from "vite";

import { findFreePort, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const LANGUAGE_KEY = "toonspectrum-lang";
const SCRATCH =
  process.env.TOONSPECTRUM_COMPANION_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-companion");
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

type PageDiagnostics = {
  consoleErrors: string[];
  failedResponses: string[];
  pageErrors: string[];
};

type VerificationResult = {
  companionConnected: boolean;
  commandRoundTrip: boolean;
  navigatorConnected: boolean;
  navigatorPreviewReady: boolean;
  navigatorReconnected: boolean;
  workspaceReconnected: boolean;
  sessionPreserved: boolean;
  diagnostics: Record<string, PageDiagnostics>;
  screenshots: string[];
};

type PopupObserver = (page: Page) => void;

function log(message: string): void {
  console.log(`[verify-companion] ${message}`);
}

function staticPreviewUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:"
      && parsed.hostname === "127.0.0.1"
      && parsed.port.length > 0
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isExpectedStaticPreviewApiUrl(value: string, previewBaseUrl: string): boolean {
  const parsed = staticPreviewUrl(value);
  const preview = staticPreviewUrl(previewBaseUrl);
  return parsed !== null
    && preview !== null
    && parsed.origin === preview.origin
    && parsed.search === ""
    && parsed.hash === ""
    && OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => path === parsed.pathname);
}

function isExpectedStaticPreviewSocketIoHandshakeClose(
  message: string,
  previewBaseUrl: string,
): boolean {
  const preview = staticPreviewUrl(previewBaseUrl);
  if (!preview) return false;
  return message === [
    "WebSocket connection to ",
    `'ws://127.0.0.1:${preview.port}/socket.io/?EIO=4&transport=websocket' failed: `,
    "Connection closed before receiving a handshake response",
  ].join("");
}

function isExpectedStaticPreviewConsoleError(
  message: ConsoleMessage,
  previewBaseUrl: string,
): boolean {
  const text = message.text();
  const location = message.location().url;
  if (
    isExpectedStaticPreviewApiUrl(location, previewBaseUrl)
    && text.startsWith("Failed to load resource:")
  ) {
    return true;
  }
  if (!isExpectedStaticPreviewSocketIoHandshakeClose(text, previewBaseUrl)) return false;
  if (!location) return true;
  const preview = staticPreviewUrl(previewBaseUrl);
  try {
    const source = new URL(location);
    return preview !== null
      && source.origin === preview.origin
      && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(source.pathname)
      && source.search === ""
      && source.hash === "";
  } catch {
    return false;
  }
}

function messageWithLocation(message: ConsoleMessage): string {
  const location = message.location().url;
  return location ? `${message.text()} @ ${location}` : message.text();
}

function observePage(
  page: Page,
  label: string,
  previewBaseUrl: string,
): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleErrors: [],
    failedResponses: [],
    pageErrors: [],
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = messageWithLocation(message);
    if (!isExpectedStaticPreviewConsoleError(message, previewBaseUrl)) {
      diagnostics.consoleErrors.push(value);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(String(error));
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const value = `${response.status()} ${response.url()}`;
    if (!isExpectedStaticPreviewApiUrl(response.url(), previewBaseUrl)) {
      diagnostics.failedResponses.push(value);
    }
  });
  page.on("requestfailed", (request) => {
    if (isExpectedStaticPreviewApiUrl(request.url(), previewBaseUrl)) return;
    diagnostics.failedResponses.push(
      `${request.failure()?.errorText ?? "request failed"} ${request.url()}`,
    );
  });
  page.on("close", () => {
    log(`${label} window closed`);
  });
  return diagnostics;
}

async function waitForCompanionConnection(
  page: Page,
  surface: "workspace" | "navigator",
): Promise<void> {
  await page.waitForURL((url) => {
    if (url.pathname !== "/studio/tools-companion") return false;
    const view = url.searchParams.get("view");
    return surface === "workspace" ? view === null : view === surface;
  }, { timeout: 20_000 });
  await page.locator(
    `[data-testid="studio-tools-companion-root"][data-companion-surface="${surface}"]`,
  ).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("status").filter({ hasText: "연결됨" }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

async function waitForNavigatorPreview(page: Page): Promise<boolean> {
  const navigatorImage = page.getByRole("img", {
    name: "현재 페이지 전체 캔버스",
    exact: true,
  });
  await navigatorImage.waitFor({ state: "visible", timeout: 20_000 });
  return navigatorImage.evaluate(async (image) => {
    try {
      await (image as HTMLImageElement).decode();
    } catch {
      return false;
    }
    return (image as HTMLImageElement).complete
      && (image as HTMLImageElement).naturalWidth > 0
      && (image as HTMLImageElement).naturalHeight > 0;
  }).catch(() => false);
}

async function openWindowMenu(page: Page): Promise<ReturnType<Page["locator"]>> {
  const menuBar = page.locator('[data-studio-main-menu="true"]');
  await menuBar.waitFor({ state: "visible", timeout: 20_000 });
  await page.keyboard.press("Escape").catch(() => undefined);
  await menuBar.getByRole("menuitem", { name: "창", exact: true }).click();
  const menu = page.locator('[role="menu"][aria-label="창"]');
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  return menu;
}

async function openWorkspaceCompanion(
  primary: Page,
  observePopup: PopupObserver,
): Promise<Page> {
  const menu = await openWindowMenu(primary);
  const launcher = menu.getByRole("menuitem", {
    name: "멀티 디스플레이 작업공간…",
    exact: true,
  });
  await launcher.waitFor({ state: "visible", timeout: 5_000 });
  const popupPromise = primary.waitForEvent("popup", { timeout: 15_000 });
  await launcher.click();
  const popup = await popupPromise;
  // Attach diagnostics before any additional await. A fast production preview can emit a boot
  // error between the popup event and its first visible DOM.
  observePopup(popup);
  await popup.setViewportSize({ width: 520, height: 820 });
  return popup;
}

async function openNavigatorCompanion(
  workspace: Page,
  observePopup: PopupObserver,
): Promise<Page> {
  const launcher = workspace.getByRole("button", {
    name: "Navigator 전용 창 열기 또는 앞으로 가져오기",
    exact: true,
  });
  await launcher.waitFor({ state: "visible", timeout: 10_000 });
  const popupPromise = workspace.waitForEvent("popup", { timeout: 15_000 });
  await launcher.click();
  const popup = await popupPromise;
  observePopup(popup);
  await popup.setViewportSize({ width: 420, height: 760 });
  return popup;
}

function sessionId(page: Page): string | null {
  try {
    return new URL(page.url()).searchParams.get("session");
  } catch {
    return null;
  }
}

async function verifyToolRoundTrip(primary: Page, workspace: Page): Promise<boolean> {
  const palette = workspace.getByRole("region", { name: "도구 팔레트" });
  // Companion → primary command path.
  await palette.getByRole("button", { name: "지우개", exact: true }).click();
  const eraser = primary.locator(
    'button[aria-label="지우개 (E)"][aria-pressed="true"]',
  );
  await eraser.waitFor({ state: "visible", timeout: 10_000 });

  // Primary → companion state publication path. Clicking the primary avoids falsely calling two
  // same-direction commands a round-trip.
  const pen = primary.getByRole("button", { name: "펜 (B)", exact: true });
  await pen.click();
  await palette.locator('button[aria-pressed="true"]', { hasText: /^펜$/u })
    .waitFor({ state: "visible", timeout: 10_000 });
  return true;
}

async function installStudioPreferences(context: BrowserContext): Promise<void> {
  await context.addInitScript(({ quickStartKey, densityKey, languageKey }) => {
    try {
      globalThis.localStorage.setItem(quickStartKey, "1");
      globalThis.localStorage.setItem(densityKey, JSON.stringify({ mode: "full" }));
      globalThis.localStorage.setItem(
        languageKey,
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
    } catch {
      // Hardened storage must not stop the browser contract itself.
    }
  }, {
    quickStartKey: QUICKSTART_KEY,
    densityKey: UI_DENSITY_KEY,
    languageKey: LANGUAGE_KEY,
  });
}

function diagnosticsAreClean(diagnostics: Record<string, PageDiagnostics>): boolean {
  return Object.values(diagnostics).every((entry) =>
    entry.consoleErrors.length === 0
    && entry.failedResponses.length === 0
    && entry.pageErrors.length === 0
  );
}

async function verify(baseUrl: string): Promise<VerificationResult> {
  mkdirSync(SCRATCH, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await installStudioPreferences(context);

  const diagnostics: Record<string, PageDiagnostics> = {};
  const screenshots: string[] = [];
  let companionConnected: boolean;
  let commandRoundTrip: boolean;
  let navigatorConnected: boolean;
  let navigatorPreviewReady: boolean;
  let navigatorReconnected: boolean;
  let workspaceReconnected: boolean;
  let sessionPreserved: boolean;

  try {
    const primary = await context.newPage();
    diagnostics.primary = observePage(primary, "primary", baseUrl);
    await primary.goto(`${baseUrl}/studio`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await primary.locator('[data-studio-main-menu="true"]').waitFor({
      state: "visible",
      timeout: 30_000,
    });

    let workspace = await openWorkspaceCompanion(primary, (popup) => {
      diagnostics.workspace = observePage(popup, "workspace", baseUrl);
    });
    await waitForCompanionConnection(workspace, "workspace");
    companionConnected = true;
    const originalSessionId = sessionId(workspace);
    if (!originalSessionId) throw new Error("workspace companion has no valid session");

    commandRoundTrip = await verifyToolRoundTrip(primary, workspace);

    let navigator = await openNavigatorCompanion(workspace, (popup) => {
      diagnostics.navigator = observePage(popup, "navigator", baseUrl);
    });
    await waitForCompanionConnection(navigator, "navigator");
    navigatorConnected = sessionId(navigator) === originalSessionId;
    navigatorPreviewReady = await waitForNavigatorPreview(navigator);

    const primaryShot = join(SCRATCH, "studio-companion-primary.png");
    const workspaceShot = join(SCRATCH, "studio-companion-workspace.png");
    const navigatorShot = join(SCRATCH, "studio-companion-navigator.png");
    await primary.screenshot({ path: primaryShot, fullPage: false });
    await workspace.screenshot({ path: workspaceShot, fullPage: true });
    await navigator.screenshot({ path: navigatorShot, fullPage: true });
    screenshots.push(primaryShot, workspaceShot, navigatorShot);

    await navigator.close();
    navigator = await openNavigatorCompanion(workspace, (popup) => {
      diagnostics.navigatorReopened = observePage(popup, "navigator-reopened", baseUrl);
    });
    await waitForCompanionConnection(navigator, "navigator");
    navigatorReconnected = sessionId(navigator) === originalSessionId
      && await waitForNavigatorPreview(navigator);

    await workspace.close();
    workspace = await openWorkspaceCompanion(primary, (popup) => {
      diagnostics.workspaceReopened = observePage(popup, "workspace-reopened", baseUrl);
    });
    await waitForCompanionConnection(workspace, "workspace");
    workspaceReconnected = true;
    sessionPreserved = sessionId(workspace) === originalSessionId;
    commandRoundTrip = commandRoundTrip && await verifyToolRoundTrip(primary, workspace);

    const reopenedShot = join(SCRATCH, "studio-companion-reconnected.png");
    await workspace.screenshot({ path: reopenedShot, fullPage: true });
    screenshots.push(reopenedShot);
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    companionConnected,
    commandRoundTrip,
    navigatorConnected,
    navigatorPreviewReady,
    navigatorReconnected,
    workspaceReconnected,
    sessionPreserved,
    diagnostics,
    screenshots,
  };
}

async function main(): Promise<void> {
  const port = await findFreePort({ unavailableMessage: "could not allocate preview port" });
  const baseUrl = `http://127.0.0.1:${port}`;
  let previewServer: PreviewServer | null = null;

  try {
    previewServer = await preview({
      preview: {
        host: "127.0.0.1",
        port,
        strictPort: true,
      },
    });
    await waitForServer(baseUrl, {
      notReadyMessage: `preview did not become ready: ${baseUrl}`,
    });
    log(`production preview ready @ ${baseUrl}`);

    const result = await verify(baseUrl);
    const ok =
      result.companionConnected
      && result.commandRoundTrip
      && result.navigatorConnected
      && result.navigatorPreviewReady
      && result.navigatorReconnected
      && result.workspaceReconnected
      && result.sessionPreserved
      && diagnosticsAreClean(result.diagnostics);
    log(JSON.stringify(result, null, 2));
    if (!ok) throw new Error("multi-window companion verification failed");
    log(`PASS · real popup transport, command round-trip, preview, and reconnect (${SCRATCH})`);
  } finally {
    await previewServer?.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[verify-companion] fatal:", error);
  process.exitCode = 1;
});
