/**
 * scripts/verify-studio-mobile-top.mts
 * Mobile TOP-chrome probe for /studio — everything rendered above the canvas.
 *
 * At widths 320/360/390/430 (portrait, touch, iPhone-like UA), for both the
 * immersive (default) and windowed mobile shells, measures:
 * - (a) horizontal overflow contributors (element rects exceeding the viewport
 *   outside any horizontal scroll row) + document scrollWidth overflow
 * - (b) bounding-box overlap between distinct interactive top-chrome controls
 * - (c) menubar clipping (overflow-hidden lane scrollWidth > clientWidth),
 *   hit-test clipped buttons, top-bar height blowup across widths
 *   (h@320 must be ≤ 1.6 × h@430) and canvas-below-the-fold regressions
 * - (d) tap target sizes ≥ 44px for top-bar controls (menubar hard, belt rows
 *   height-hard / width-warn)
 * - (e) safe-area handling — immersive shell must declare
 *   env(safe-area-inset-top) padding on the app shell
 * - (f) menus opened from the top chrome (workspace dialog, tool-belt group
 *   popover) staying inside the viewport
 * Convenience pass: horizontal scroll affordance on scrollable rows,
 * focus-ring clearance at lane edges, aria-labels on icon-only buttons.
 *
 * Run via: pnpm verify:studio-mobile-top  (expects production build in dist/)
 * Logs [verify-mobile-top] per width; exits 1 on hard failures.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

const SCRATCH = process.env.TOONSPECTRUM_MOBILE_TOP_VERIFY_DIR ??
  process.env.TOONSPECTRUM_VERIFY_DIR ??
  join(tmpdir(), "toonspectrum-studio-mobile-top");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const IMMERSIVE_SESSION_KEY = "toonspectrum-studio-mobile-immersive:v1";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const WIDTHS = [320, 360, 390, 430] as const;
/** (c) contract: menubar at the narrowest width must not blow up vs the widest. */
const MAX_HEIGHT_RATIO = 1.6;

// Static preview has no Nest API; these best-effort calls must not fail the gate
// (same contract as verify-studio-launch).
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

function isExpectedStaticPreviewError(message: string, studioUrl: string): boolean {
  if (OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path))) return true;

  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    previewUrl.protocol !== "http:" ||
    previewUrl.hostname !== "127.0.0.1" ||
    previewUrl.port.length === 0
  ) {
    return false;
  }

  const socketUrl =
    `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessages = [
    `WebSocket connection to '${socketUrl}' failed: ` +
    "Connection closed before receiving a handshake response",
    `WebSocket connection to '${socketUrl}' failed: ` +
    "Error during WebSocket handshake: Unexpected response code: 400",
  ] as const;

  if (expectedMessages.includes(message as typeof expectedMessages[number])) return true;

  const sourcePrefix = expectedMessages
    .map((entry) => `${entry} @ `)
    .find((entry) => message.startsWith(entry));
  if (!sourcePrefix) return false;

  try {
    const sourceUrl = new URL(message.slice(sourcePrefix.length));
    return sourceUrl.origin === previewUrl.origin &&
      /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname) &&
      sourceUrl.search === "" &&
      sourceUrl.hash === "";
  } catch {
    return false;
  }
}

type ShellMode = "immersive" | "windowed";

interface TopChromeRectIssue {
  label: string;
  detail: string;
}

interface TopChromeMetrics {
  viewportWidth: number;
  viewportHeight: number;
  menubarVisible: boolean;
  menubarHeight: number;
  laneClippedPx: number;
  docOverflowX: number;
  overflowContributors: TopChromeRectIssue[];
  overlaps: TopChromeRectIssue[];
  clipped: TopChromeRectIssue[];
  smallTargets: TopChromeRectIssue[];
  smallTargetWarnings: TopChromeRectIssue[];
  missingAccessibleNames: TopChromeRectIssue[];
  edgeRingRisks: TopChromeRectIssue[];
  scrollRowsMissingAffordance: TopChromeRectIssue[];
  safeAreaDeclared: boolean;
  canvasTop: number | null;
  canvasVisibleHeight: number | null;
  canvasViewportTop: number | null;
  canvasViewportBottom: number | null;
  canvasViewportHeight: number | null;
  canvasViewportPaddingBottom: number | null;
  dockTop: number | null;
  dockHeight: number | null;
  dockSmallTargets: TopChromeRectIssue[];
}

interface MenuProbeResult {
  id: string;
  opened: boolean;
  withinViewport: boolean;
  docOverflowX: number;
  closed: boolean;
}

interface DockExpansionProbeResult {
  opened: boolean;
  canvasViewportHeight: number | null;
  canvasViewportBottom: number | null;
  canvasViewportPaddingBottom: number | null;
  dockHeight: number | null;
  smallTargets: TopChromeRectIssue[];
}

interface ModeRunResult {
  width: number;
  mode: ShellMode;
  ok: boolean;
  hardFailures: string[];
  warnings: string[];
  metrics: TopChromeMetrics;
  expandedDock: DockExpansionProbeResult;
  menus: MenuProbeResult[];
  errCount: number;
  shot: string;
}

function log(msg: string) {
  const line = `[verify-mobile-top] ${msg}`;
  console.log(line);
  try { appendFileSync(join(SCRATCH, "studio-mobile-top-verify.log"), line + "\n"); } catch {}
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not allocate a preview port"));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("preview server did not become ready");
}

/**
 * Everything above the canvas in one DOM pass. Runs inside the page so rect
 * math sees real computed layout (Tailwind pointer-coarse variants included).
 */
async function measureTopChrome(page: Page, mode: ShellMode): Promise<TopChromeMetrics> {
  return page.evaluate(({ shellMode }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const EPS = 0.5;

    const describe = (element: Element): string => {
      const label =
        element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        (element.textContent ?? "").trim().slice(0, 24);
      const id =
        element.getAttribute("data-studio-main-menu-trigger") ??
        element.getAttribute("data-testid") ??
        "";
      return `${element.tagName.toLowerCase()}${id ? `[${id}]` : ""}“${label}”`;
    };

    const isVisible = (element: Element): boolean => {
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      // <2px in either axis ⇒ sr-only-style visually hidden control; not a touch target.
      return rect.width >= 2 && rect.height >= 2;
    };

    const scrollableXAncestor = (element: Element, boundary: Element): Element | null => {
      let node: Element | null = element.parentElement;
      while (node && node !== boundary.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    interface Box { left: number; right: number; top: number; bottom: number }

    /** Painted box: the element rect clipped by every overflow-clipping ancestor. */
    const clippedBox = (element: Element): Box | null => {
      const rect = element.getBoundingClientRect();
      let box: Box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      let node: Element | null = element.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const clipsX = style.overflowX !== "visible";
        const clipsY = style.overflowY !== "visible";
        if (clipsX || clipsY) {
          const host = node.getBoundingClientRect();
          if (clipsX) {
            box = { ...box, left: Math.max(box.left, host.left), right: Math.min(box.right, host.right) };
          }
          if (clipsY) {
            box = { ...box, top: Math.max(box.top, host.top), bottom: Math.min(box.bottom, host.bottom) };
          }
          if (box.right <= box.left || box.bottom <= box.top) return null;
        }
        node = node.parentElement;
      }
      return box;
    };

    const menubar = document.querySelector('[data-studio-app-menubar="true"]');
    const lane = document.querySelector('[data-studio-app-menubar-scroll="true"]');
    const statusRail = document.querySelector("[data-studio-global-status-rail]");
    const toolBelt = document.querySelector('[data-studio-tool-belt="true"]');
    const siteHeader = shellMode === "windowed" ? document.querySelector("body header") : null;
    const canvasViewport = document.querySelector<HTMLElement>(
      '[data-studio-canvas-viewport="true"]',
    );
    const mobileDock = document.querySelector<HTMLElement>(
      '[data-studio-mobile-editing-dock="true"]',
    );

    const containers: Element[] = [];
    for (const candidate of [siteHeader, menubar, statusRail, toolBelt]) {
      if (candidate && isVisible(candidate)) containers.push(candidate);
    }

    const menubarVisible = Boolean(menubar && isVisible(menubar));
    const menubarHeight = menubar ? menubar.getBoundingClientRect().height : 0;
    const laneClippedPx = lane ? Math.max(0, lane.scrollWidth - lane.clientWidth) : 0;

    const docOverflowX = Math.max(
      0,
      document.documentElement.scrollWidth - vw,
      document.body.scrollWidth - vw,
    );

    interface Interactive {
      element: Element;
      container: Element;
      rect: DOMRect;
      painted: Box | null;
      scrollRow: Element | null;
      disabled: boolean;
    }

    const INTERACTIVE_SELECTOR =
      "button, a[href], input:not([type='hidden']), select, textarea, [role='button']";
    const interactives: Interactive[] = [];
    for (const container of containers) {
      for (const element of container.querySelectorAll(INTERACTIVE_SELECTOR)) {
        if (!isVisible(element)) continue;
        interactives.push({
          element,
          container,
          rect: element.getBoundingClientRect(),
          painted: clippedBox(element),
          scrollRow: scrollableXAncestor(element, container),
          disabled:
            (element as HTMLButtonElement).disabled === true ||
            element.getAttribute("aria-disabled") === "true",
        });
      }
    }

    // (a) horizontal overflow contributors — anything outside the viewport that
    // is NOT inside a working horizontal scroll row is unreachable content.
    const overflowContributors: { label: string; detail: string }[] = [];
    for (const item of interactives) {
      if (item.scrollRow) continue;
      if (item.rect.left < -EPS || item.rect.right > vw + EPS) {
        overflowContributors.push({
          label: describe(item.element),
          detail: `rect=[${item.rect.left.toFixed(1)}, ${item.rect.right.toFixed(1)}] vw=${vw}`,
        });
      }
    }
    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.right > vw + EPS || rect.left < -EPS) {
        overflowContributors.push({
          label: describe(container),
          detail: `container rect=[${rect.left.toFixed(1)}, ${rect.right.toFixed(1)}] vw=${vw}`,
        });
      }
    }

    // (b) overlap between distinct interactive controls. Pairs sharing the same
    // horizontal scroll row are compared with raw content-space rects (their
    // relative geometry is scroll-invariant, so this catches overlaps that are
    // currently scrolled off-screen). Pairs in different clip contexts are
    // compared with painted boxes so scroll-clipped content cannot false-flag.
    const overlaps: { label: string; detail: string }[] = [];
    for (let i = 0; i < interactives.length; i += 1) {
      for (let j = i + 1; j < interactives.length; j += 1) {
        const a = interactives[i];
        const b = interactives[j];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const sameScrollContext = a.scrollRow === b.scrollRow;
        const boxA = sameScrollContext ? a.rect : a.painted;
        const boxB = sameScrollContext ? b.rect : b.painted;
        if (!boxA || !boxB) continue;
        const overlapW = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
        const overlapH = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
        if (overlapW > 2 && overlapH > 2) {
          overlaps.push({
            label: `${describe(a.element)} × ${describe(b.element)}`,
            detail: `overlap=${overlapW.toFixed(1)}×${overlapH.toFixed(1)}px`,
          });
        }
      }
    }

    // (c) hit-test — a control painted inside the viewport (and not inside a
    // scroll row) must win elementFromPoint at its painted center.
    const clipped: { label: string; detail: string }[] = [];
    for (const item of interactives) {
      if (item.scrollRow || item.disabled) continue;
      if (!item.painted) {
        clipped.push({
          label: describe(item.element),
          detail: "fully clipped by overflow ancestor",
        });
        continue;
      }
      const cx = (item.painted.left + item.painted.right) / 2;
      const cy = (item.painted.top + item.painted.bottom) / 2;
      if (cx < 0 || cx > vw || cy < 0 || cy > vh) {
        clipped.push({
          label: describe(item.element),
          detail: `center (${cx.toFixed(0)},${cy.toFixed(0)}) offscreen`,
        });
        continue;
      }
      const hit = document.elementFromPoint(cx, cy);
      const ok = Boolean(
        hit && (hit === item.element || item.element.contains(hit) || hit.contains(item.element)),
      );
      if (!ok) {
        clipped.push({
          label: describe(item.element),
          detail: `hit-test lost to ${hit ? hit.tagName.toLowerCase() : "nothing"}`,
        });
      }
      // Partial horizontal clipping of a non-scroll-row control is unreachable UI.
      const hiddenX = item.rect.width - (item.painted.right - item.painted.left);
      if (hiddenX > 2) {
        clipped.push({
          label: describe(item.element),
          detail: `${hiddenX.toFixed(1)}px clipped horizontally by overflow ancestor`,
        });
      }
    }

    // (d) tap targets — hard ≥44×44 for menubar and tool-belt controls
    // (pointer-coarse touch contract for the whole top chrome).
    const smallTargets: { label: string; detail: string }[] = [];
    const smallTargetWarnings: { label: string; detail: string }[] = [];
    const dockSmallTargets: { label: string; detail: string }[] = [];
    const MIN = 43.5;
    for (const item of interactives) {
      const size = `${item.rect.width.toFixed(1)}×${item.rect.height.toFixed(1)}`;
      if (item.container === menubar || item.container === toolBelt) {
        const where = item.container === menubar ? "menubar" : "belt";
        if (item.rect.height < MIN || item.rect.width < MIN) {
          smallTargets.push({ label: describe(item.element), detail: `${where} target ${size}` });
        }
      }
    }
    if (mobileDock) {
      for (const element of mobileDock.querySelectorAll(INTERACTIVE_SELECTOR)) {
        if (!isVisible(element)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.height < MIN || rect.width < MIN) {
          dockSmallTargets.push({
            label: describe(element),
            detail: `mobile dock target ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`,
          });
        }
      }
    }

    // Convenience: icon-only controls need accessible names (a wrapping <label>
    // with text also provides one, e.g. the belt's file-picker label).
    const missingAccessibleNames: { label: string; detail: string }[] = [];
    for (const item of interactives) {
      const element = item.element;
      const text = (element.textContent ?? "").trim();
      const labelText = (element.closest("label")?.textContent ?? "").trim();
      const named =
        text.length > 0 ||
        labelText.length > 0 ||
        Boolean(element.getAttribute("aria-label")) ||
        Boolean(element.getAttribute("aria-labelledby")) ||
        Boolean(element.getAttribute("title"));
      if (!named) {
        missingAccessibleNames.push({
          label: `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`,
          detail: "icon-only control without aria-label/title",
        });
      }
    }

    // Convenience: focus rings on the lane's first/last control need breathing
    // room before the overflow-hidden edge (outline-offset 2 ⇒ ~2px).
    const edgeRingRisks: { label: string; detail: string }[] = [];
    if (lane) {
      const laneRect = lane.getBoundingClientRect();
      const menubarItems = interactives.filter((item) => item.container === menubar);
      if (menubarItems.length > 0) {
        const first = menubarItems.reduce((low, item) => (item.rect.left < low.rect.left ? item : low));
        const last = menubarItems.reduce((high, item) => (item.rect.right > high.rect.right ? item : high));
        if (first.rect.left - laneRect.left < 2) {
          edgeRingRisks.push({
            label: describe(first.element),
            detail: `left clearance ${(first.rect.left - laneRect.left).toFixed(1)}px`,
          });
        }
        if (laneRect.right - last.rect.right < 2) {
          edgeRingRisks.push({
            label: describe(last.element),
            detail: `right clearance ${(laneRect.right - last.rect.right).toFixed(1)}px`,
          });
        }
      }
    }

    // Convenience: scrollable top rows should show a visual scroll affordance
    // (a sticky edge fade) because their scrollbars are hidden.
    const scrollRowsMissingAffordance: { label: string; detail: string }[] = [];
    for (const container of containers) {
      const rows = new Set<Element>();
      const containerStyle = getComputedStyle(container);
      if (
        (containerStyle.overflowX === "auto" || containerStyle.overflowX === "scroll") &&
        container.scrollWidth > container.clientWidth + 1
      ) {
        rows.add(container);
      }
      for (const row of container.querySelectorAll("*")) {
        const style = getComputedStyle(row);
        if (
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          row.scrollWidth > row.clientWidth + 1 &&
          isVisible(row)
        ) {
          rows.add(row);
        }
      }
      for (const row of rows) {
        const hasFade = Boolean(
          row.querySelector("[class*='bg-gradient-to-r'], [class*='bg-gradient-to-l']"),
        );
        const scrollbarVisible = getComputedStyle(row).scrollbarWidth !== "none";
        if (!hasFade && !scrollbarVisible) {
          scrollRowsMissingAffordance.push({
            label: describe(row),
            detail: `scrollWidth=${row.scrollWidth} clientWidth=${row.clientWidth}`,
          });
        }
      }
    }

    // (e) safe-area declaration on the immersive shell.
    const editorRoot = document.querySelector<HTMLElement>('[data-studio-editor="true"]');
    const safeAreaDeclared =
      shellMode !== "immersive" ||
      Boolean(editorRoot?.style.paddingTop.includes("safe-area-inset-top"));

    // (c) canvas must stay above the fold.
    const stage = document.querySelector(".konvajs-content");
    let canvasTop: number | null = null;
    let canvasVisibleHeight: number | null = null;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      canvasTop = rect.top;
      canvasVisibleHeight = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    }
    const canvasViewportRect = canvasViewport?.getBoundingClientRect() ?? null;
    const mobileDockRect = mobileDock?.getBoundingClientRect() ?? null;

    return {
      viewportWidth: vw,
      viewportHeight: vh,
      menubarVisible,
      menubarHeight,
      laneClippedPx,
      docOverflowX,
      overflowContributors,
      overlaps,
      clipped,
      smallTargets,
      smallTargetWarnings,
      missingAccessibleNames,
      edgeRingRisks,
      scrollRowsMissingAffordance,
      safeAreaDeclared,
      canvasTop,
      canvasVisibleHeight,
      canvasViewportTop: canvasViewportRect?.top ?? null,
      canvasViewportBottom: canvasViewportRect?.bottom ?? null,
      canvasViewportHeight: canvasViewportRect?.height ?? null,
      canvasViewportPaddingBottom: canvasViewport
        ? Number.parseFloat(getComputedStyle(canvasViewport).paddingBottom)
        : null,
      dockTop: mobileDockRect?.top ?? null,
      dockHeight: mobileDockRect?.height ?? null,
      dockSmallTargets,
    };
  }, { shellMode: mode });
}

/** (f) open a top-chrome menu/popover and require it to stay inside the viewport. */
async function probeMenuWithinViewport(
  page: Page,
  id: string,
  open: () => Promise<void>,
  panelSelector: string,
  close: () => Promise<void>,
): Promise<MenuProbeResult> {
  const panel = page.locator(panelSelector).first();
  let opened = false;
  let withinViewport = false;
  let docOverflowX = -1;
  let closed = false;
  try {
    await open();
    await panel.waitFor({ state: "visible", timeout: 8000 });
    opened = true;
    // Entrance animations move the panel; wait bounded (a looping spinner inside
    // must not stall the probe) before taking final geometry.
    await panel.evaluate(async (element) => {
      await Promise.race([
        Promise.allSettled(
          element.getAnimations({ subtree: true }).map((animation) =>
            animation.finished.catch(() => undefined),
          ),
        ),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    });
    const geometry = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        vw: window.innerWidth,
        panelScrollOverflow: Math.max(0, element.scrollWidth - element.clientWidth),
        docOverflowX: Math.max(
          0,
          document.documentElement.scrollWidth - window.innerWidth,
          document.body.scrollWidth - window.innerWidth,
        ),
      };
    });
    withinViewport =
      geometry.left >= -0.5 &&
      geometry.right <= geometry.vw + 0.5 &&
      geometry.panelScrollOverflow <= 1;
    docOverflowX = geometry.docOverflowX;
    await close();
    closed = await panel
      .waitFor({ state: "hidden", timeout: 4000 })
      .then(() => true)
      .catch(() => false);
  } catch {
    // fall through with defaults; caller decides hard/soft
  }
  return { id, opened, withinViewport, docOverflowX, closed };
}

async function runMode(
  browser: Browser,
  url: string,
  width: (typeof WIDTHS)[number],
  mode: ShellMode,
): Promise<ModeRunResult> {
  const shot = join(SCRATCH, `studio-mobile-top-${mode}-${width}.png`);
  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    userAgent: MOBILE_UA,
    viewport: { width, height: 844 },
  });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const text = location ? `${message.text()} @ ${location}` : message.text();
    if (!isExpectedStaticPreviewError(text, url)) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  // tsx(esbuild) keepNames rewrites nested functions with a `__name` helper that
  // does not exist inside the page; give the evaluated snippets a no-op shim.
  await page.addInitScript(() => {
    (globalThis as unknown as { __name: (fn: unknown) => unknown }).__name = (fn) => fn;
  });
  await page.addInitScript(({ quickStartKey, mobileHintKey, immersiveKey, immersiveValue }) => {
    try {
      window.localStorage.setItem(quickStartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
      window.sessionStorage.setItem(immersiveKey, immersiveValue);
    } catch {}
  }, {
    quickStartKey: QUICKSTART_KEY,
    mobileHintKey: MOBILE_HINT_KEY,
    immersiveKey: IMMERSIVE_SESSION_KEY,
    immersiveValue: mode === "immersive" ? "immersive" : "windowed",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const dock = page.locator('nav[aria-label="스튜디오 모바일 도구막대"]');
  await dock.waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator(`[data-studio-editor="true"][data-studio-mobile-immersive="${mode === "immersive"}"]`)
    .waitFor({ state: "attached", timeout: 5000 });
  // Let the lazy menubar content + belt suspense settle before measuring.
  await page.locator('[data-studio-menubar-actions="true"]').waitFor({ state: "attached", timeout: 8000 });
  await page.waitForTimeout(400);

  const metrics = await measureTopChrome(page, mode);
  await page.screenshot({ path: shot, fullPage: false });

  const expandedDock: DockExpansionProbeResult = {
    opened: false,
    canvasViewportHeight: null,
    canvasViewportBottom: null,
    canvasViewportPaddingBottom: null,
    dockHeight: null,
    smallTargets: [],
  };
  const workspaceToggle = page.locator(
    '[data-studio-mobile-workspace-toggle="true"]',
  ).first();
  if (await workspaceToggle.count() > 0) {
    await workspaceToggle.click();
    await page
      .locator(
        '[data-studio-mobile-editing-dock="true"][data-studio-mobile-dock-expanded="true"]',
      )
      .waitFor({ state: "attached", timeout: 4000 });
    const expandedMetrics = await measureTopChrome(page, mode);
    expandedDock.opened = true;
    expandedDock.canvasViewportHeight = expandedMetrics.canvasViewportHeight;
    expandedDock.canvasViewportBottom = expandedMetrics.canvasViewportBottom;
    expandedDock.canvasViewportPaddingBottom =
      expandedMetrics.canvasViewportPaddingBottom;
    expandedDock.dockHeight = expandedMetrics.dockHeight;
    expandedDock.smallTargets = expandedMetrics.dockSmallTargets;
    await workspaceToggle.click();
  }

  const menus: MenuProbeResult[] = [];
  if (mode === "windowed") {
    // Workspace menu gate lives in the scrollable primary lane; reveal then activate.
    // Close via a page-context click: the sheet keeps a long-running subtree
    // animation that never satisfies Playwright's stability gate.
    const workspaceTrigger = page.locator('button[aria-haspopup="dialog"][aria-label^="작업공간:"]');
    if (await workspaceTrigger.count() > 0) {
      menus.push(await probeMenuWithinViewport(
        page,
        "workspace-dialog",
        async () => {
          await workspaceTrigger.evaluate((element) =>
            element.scrollIntoView({ block: "nearest", inline: "nearest" }));
          await workspaceTrigger.click();
        },
        '[data-testid="studio-workspace-dialog"]',
        async () => {
          await page.evaluate(() => {
            const buttons = [...document.querySelectorAll<HTMLButtonElement>(
              '[data-testid="studio-workspace-dialog"] button',
            )];
            const close = buttons.find((button) =>
              button.getAttribute("aria-label") === "작업공간 메뉴 닫기" &&
              button.getBoundingClientRect().width > 0);
            close?.click();
          });
        },
      ));
    }
    // Tool-belt group popover (에셋 라이브러리) — the belt is the windowed
    // mobile discovery surface for the newly added tools. Keyboard activation:
    // the touch-hold hint coach can intercept a synthetic hover+click.
    const assetTrigger = page
      .locator('[data-studio-tool-belt="true"] button[aria-haspopup="menu"]')
      .filter({ hasText: "템플릿·에셋" })
      .first();
    if (await assetTrigger.count() > 0) {
      menus.push(await probeMenuWithinViewport(
        page,
        "belt-asset-popover",
        async () => {
          await assetTrigger.evaluate((element) =>
            element.scrollIntoView({ block: "nearest", inline: "nearest" }));
          await assetTrigger.focus();
          await page.keyboard.press("Enter");
        },
        '[data-studio-tool-popover="asset-group"]',
        async () => {
          await assetTrigger.evaluate((element) => (element as HTMLButtonElement).click());
        },
      ));
    }
  }

  const hardFailures: string[] = [];
  const warnings: string[] = [];

  if (!metrics.menubarVisible) hardFailures.push("menubar not visible");
  if (metrics.docOverflowX > 0) {
    hardFailures.push(`document horizontal overflow ${metrics.docOverflowX}px`);
  }
  if (metrics.laneClippedPx > 1) {
    hardFailures.push(`menubar lane clips ${metrics.laneClippedPx}px of content (overflow-hidden)`);
  }
  for (const issue of metrics.overflowContributors) {
    hardFailures.push(`overflow contributor: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.overlaps) {
    hardFailures.push(`overlap: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.clipped) {
    hardFailures.push(`clipped control: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.smallTargets) {
    hardFailures.push(`small target: ${issue.label} ${issue.detail}`);
  }
  if (!metrics.safeAreaDeclared) {
    hardFailures.push("immersive shell missing env(safe-area-inset-top) padding");
  }
  if (metrics.canvasTop === null || metrics.canvasVisibleHeight === null) {
    hardFailures.push("canvas stage not found");
  } else {
    if (metrics.canvasTop > 844 * 0.5) {
      hardFailures.push(`canvas pushed below the fold (top=${metrics.canvasTop.toFixed(0)}px)`);
    }
    if (metrics.canvasVisibleHeight < 844 * 0.3) {
      hardFailures.push(
        `canvas visible height ${metrics.canvasVisibleHeight.toFixed(0)}px < 30% of viewport`,
      );
    }
  }
  if (
    metrics.canvasViewportTop === null ||
    metrics.canvasViewportBottom === null ||
    metrics.canvasViewportHeight === null ||
    metrics.canvasViewportPaddingBottom === null
  ) {
    hardFailures.push("canvas scroll viewport not found");
  } else {
    if (
      mode === "immersive" &&
      metrics.canvasViewportBottom < metrics.viewportHeight - 1
    ) {
      hardFailures.push(
        `canvas viewport stops ${(
          metrics.viewportHeight - metrics.canvasViewportBottom
        ).toFixed(1)}px above the dynamic viewport bottom`,
      );
    }
    if (
      metrics.dockHeight !== null &&
      metrics.canvasViewportPaddingBottom < metrics.dockHeight - 1
    ) {
      hardFailures.push(
        `canvas dock-safe padding ${metrics.canvasViewportPaddingBottom.toFixed(1)}px ` +
        `< dock height ${metrics.dockHeight.toFixed(1)}px`,
      );
    }
  }
  if (metrics.dockTop === null || metrics.dockHeight === null) {
    hardFailures.push("mobile editing dock not found");
  } else if (
    mode === "immersive" &&
    metrics.canvasViewportBottom !== null &&
    metrics.canvasViewportBottom <= metrics.dockTop + 1
  ) {
    hardFailures.push("mobile dock still shrinks the canvas instead of overlaying its scrollport");
  }
  for (const issue of metrics.dockSmallTargets) {
    hardFailures.push(`small dock target: ${issue.label} ${issue.detail}`);
  }
  if (!expandedDock.opened) {
    hardFailures.push("expanded mobile workspace dock did not open");
  } else {
    if (
      expandedDock.canvasViewportHeight === null ||
      metrics.canvasViewportHeight === null ||
      Math.abs(expandedDock.canvasViewportHeight - metrics.canvasViewportHeight) > 1
    ) {
      hardFailures.push("expanded mobile dock changes the canvas viewport height");
    }
    if (
      mode === "immersive" &&
      (
        expandedDock.canvasViewportBottom === null ||
        expandedDock.canvasViewportBottom < metrics.viewportHeight - 1
      )
    ) {
      hardFailures.push("expanded mobile dock shrinks the dynamic canvas viewport");
    }
    if (
      expandedDock.canvasViewportPaddingBottom === null ||
      expandedDock.dockHeight === null ||
      expandedDock.canvasViewportPaddingBottom < expandedDock.dockHeight - 1
    ) {
      hardFailures.push("expanded mobile dock is not covered by canvas scroll-safe padding");
    }
    for (const issue of expandedDock.smallTargets) {
      hardFailures.push(`small expanded dock target: ${issue.label} ${issue.detail}`);
    }
  }
  for (const menu of menus) {
    if (!menu.opened) hardFailures.push(`menu ${menu.id} did not open`);
    else if (!menu.withinViewport) hardFailures.push(`menu ${menu.id} escapes the viewport`);
    else if (menu.docOverflowX > 0) {
      hardFailures.push(`menu ${menu.id} causes ${menu.docOverflowX}px document overflow`);
    }
    if (menu.opened && !menu.closed) hardFailures.push(`menu ${menu.id} did not close`);
  }
  if (consoleErrors.length > 0) {
    hardFailures.push(`console errors: ${consoleErrors.length}`);
  }

  for (const issue of metrics.smallTargetWarnings) {
    warnings.push(`narrow belt target: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.missingAccessibleNames) {
    warnings.push(`unnamed control: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.edgeRingRisks) {
    warnings.push(`focus ring may clip: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.scrollRowsMissingAffordance) {
    warnings.push(`scroll row without affordance: ${issue.label} ${issue.detail}`);
  }

  const ok = hardFailures.length === 0;
  log(
    `${mode}-${width}: menubarH=${metrics.menubarHeight.toFixed(1)} ` +
    `laneClip=${metrics.laneClippedPx.toFixed(1)} docOverflowX=${metrics.docOverflowX} ` +
    `overflow=${metrics.overflowContributors.length} overlaps=${metrics.overlaps.length} ` +
    `clipped=${metrics.clipped.length} smallTargets=${metrics.smallTargets.length} ` +
    `safeArea=${metrics.safeAreaDeclared} canvasTop=${metrics.canvasTop?.toFixed(0) ?? "-"} ` +
    `canvasVisible=${metrics.canvasVisibleHeight?.toFixed(0) ?? "-"} ` +
    `viewport=${metrics.canvasViewportHeight?.toFixed(0) ?? "-"} ` +
    `dock=${metrics.dockHeight?.toFixed(0) ?? "-"} ` +
    `dockPad=${metrics.canvasViewportPaddingBottom?.toFixed(0) ?? "-"} ` +
    `expandedDock=${expandedDock.dockHeight?.toFixed(0) ?? "-"} ` +
    `expandedPad=${expandedDock.canvasViewportPaddingBottom?.toFixed(0) ?? "-"} ` +
    `menus=${menus.map((menu) => `${menu.id}:${menu.opened && menu.withinViewport && menu.closed}`).join(",") || "-"} ` +
    `errs=${consoleErrors.length} ok=${ok}`,
  );
  for (const failure of hardFailures) log(`${mode}-${width} FAIL: ${failure}`);
  for (const warning of warnings) log(`${mode}-${width} warn: ${warning}`);
  for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
    log(`${mode}-${width} consoleError[${index}]: ${message}`);
  }

  await ctx.close();
  return {
    width,
    mode,
    ok,
    hardFailures,
    warnings,
    metrics,
    expandedDock,
    menus,
    errCount: consoleErrors.length,
    shot,
  };
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/studio`;

  const server: ChildProcess = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { stdio: "ignore" },
  );

  let browser: Browser | null = null;
  try {
    await waitForServer(url, 20000);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

    const results: ModeRunResult[] = [];
    for (const width of WIDTHS) {
      for (const mode of ["immersive", "windowed"] as const) {
        results.push(await runMode(browser, url, width, mode));
      }
    }

    // (c) cross-width contract: the top bar must not balloon at narrow widths.
    for (const mode of ["immersive", "windowed"] as const) {
      const narrow = results.find((r) => r.width === 320 && r.mode === mode);
      const wide = results.find((r) => r.width === 430 && r.mode === mode);
      if (narrow && wide && wide.metrics.menubarHeight > 0) {
        const ratio = narrow.metrics.menubarHeight / wide.metrics.menubarHeight;
        if (ratio > MAX_HEIGHT_RATIO) {
          narrow.ok = false;
          narrow.hardFailures.push(
            `menubar height blowup: ${narrow.metrics.menubarHeight.toFixed(1)}px @320 vs ` +
            `${wide.metrics.menubarHeight.toFixed(1)}px @430 (ratio ${ratio.toFixed(2)} > ${MAX_HEIGHT_RATIO})`,
          );
          log(`${mode}-320 FAIL: ${narrow.hardFailures.at(-1)}`);
        } else {
          log(`${mode}: menubar height ratio 320/430 = ${ratio.toFixed(2)} (≤ ${MAX_HEIGHT_RATIO})`);
        }
      }
    }

    await browser.close();
    browser = null;

    const failed = results.filter((result) => !result.ok);
    log(`screenshots: ${results.map((result) => result.shot).join(" ")}`);
    if (failed.length > 0) {
      log(`RESULT: FAIL (${failed.length}/${results.length} runs)`);
      process.exitCode = 1;
    } else {
      log(`RESULT: OK (${results.length} runs green)`);
    }
    console.log(JSON.stringify({ results }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    try { server.kill("SIGKILL"); } catch {}
  }
}

main().catch((error: unknown) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
