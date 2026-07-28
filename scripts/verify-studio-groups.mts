/**
 * Production-preview browser gate for Studio's PPT/Figma-style group selection contract.
 *
 * The verifier creates a real mixed fixture through the shipped UI (draw + text + PNG image),
 * groups it, and then proves the user-facing contract through canvas gestures, DOM selection
 * state, debounced autosave coordinates, one-step Undo, and screenshots.
 *
 * Run after `pnpm build`:
 *   pnpm verify:studio-groups
 *
 * Reuse an already running production preview:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4173 pnpm verify:studio-groups
 *
 * Artifacts:
 *   TOONSPECTRUM_GROUP_VERIFY_DIR=/tmp/studio-groups pnpm verify:studio-groups
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

const SCRATCH =
  process.env.TOONSPECTRUM_GROUP_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-groups");
const LOG_PATH = join(SCRATCH, "studio-group-verify.log");
const RESULT_PATH = join(SCRATCH, "studio-group-evidence.json");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";
const CLEAN_SESSION_KEY = "toonspectrum-group-verifier-cleaned";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;
const POSITION_TOLERANCE = 0.15;
const RESIZE_TOLERANCE = 0.35;

interface BrowserErrorCollector {
  messages: string[];
  failedResponses: string[];
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface PersistedElement {
  id: string;
  type: string;
  groupId: string | null;
  locked: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  fontSize: number | null;
  strokeWidth: number | null;
  points: number[];
}

interface PersistedGroup {
  id: string;
  name: string | null;
  locked: boolean;
}

interface PersistedSnapshot {
  key: string;
  raw: string;
  savedAt: string;
  currentPageId: string | null;
  pageId: string | null;
  elements: PersistedElement[];
  groups: PersistedGroup[];
}

interface ColorBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  center: ScreenPoint;
  pixelCount: number;
}

interface GroupResizeHandleState {
  transformerPresent: boolean;
  transformerVisible: boolean;
  attachedNodeCount: number;
  cornerName: string | null;
  point: ScreenPoint | null;
}

interface KonvaElementTransformState {
  className: string;
  name: string;
  draggable: boolean;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

interface DesktopEvidence {
  fixtureIds: string[];
  fixtureTypes: string[];
  groupId: string;
  groupName: string | null;
  firstDragDelta: ScreenPoint;
  unlockedDragDelta: ScreenPoint;
  uniformResizeScale: number;
  uniformResizeOffset: ScreenPoint;
  uniformResizeTransformedAllMembers: boolean;
  resizeUndoRestoredAllMembers: boolean;
  lockedGroupResizeHandleHidden: boolean;
  drawPreviewTransformNeutral: boolean;
  escapeCancelledDragPreviewRestored: boolean;
  escapeCancelledDragPersistedUnchanged: boolean;
  escapeCancelledDragUndoStackUnchanged: boolean;
  lockedDragUnchanged: boolean;
  undoRestoredAllMembers: boolean;
  canvasClickSelectedWholeGroup: boolean;
  shiftClickRemovedWholeGroup: boolean;
  shiftClickRestoredWholeGroup: boolean;
  layerNavigatorRowSelectedWholeGroup: boolean;
  layerNavigatorGroupLockAccessible: boolean;
  doubleClickEnteredGroup: boolean;
  escapeRestoredWholeGroup: boolean;
  marqueeSelectedWholeGroup: boolean;
  rightClickSelectedWholeGroup: boolean;
  screenshots: string[];
  errorCount: number;
}

interface MobileEvidence {
  viewport: { width: number; height: number };
  tapSelectedWholeGroup: boolean;
  groupResizeHandleVisible: boolean;
  doubleTapEnteredGroup: boolean;
  escapeRestoredWholeGroup: boolean;
  escapeRestoredResizeHandle: boolean;
  screenshot: string;
  errorCount: number;
}

interface DesktopAuditResult {
  evidence: DesktopEvidence;
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
}

function log(message: string): void {
  const line = `[verify-groups] ${message}`;
  console.log(line);
  appendFileSync(LOG_PATH, `${line}\n`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectedStaticPreviewError(message: string, studioUrl: string): boolean {
  if (OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path))) return true;

  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    previewUrl.protocol !== "http:"
    || previewUrl.hostname !== "127.0.0.1"
    || previewUrl.port.length === 0
  ) {
    return false;
  }

  const socketUrl =
    `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessage =
    `WebSocket connection to '${socketUrl}' failed: `
    + "Connection closed before receiving a handshake response";
  if (message === expectedMessage) return true;

  const sourcePrefix = `${expectedMessage} @ `;
  if (!message.startsWith(sourcePrefix)) return false;
  try {
    const sourceUrl = new URL(message.slice(sourcePrefix.length));
    return sourceUrl.origin === previewUrl.origin
      && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname)
      && sourceUrl.search === ""
      && sourceUrl.hash === "";
  } catch {
    return false;
  }
}

function collectBrowserErrors(
  page: Page,
  label: string,
  studioUrl: string,
): BrowserErrorCollector {
  const collector: BrowserErrorCollector = { messages: [], failedResponses: [] };
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (!expectedStaticPreviewError(message, studioUrl)) {
      collector.messages.push(`${label}: ${message}`);
    }
  });
  page.on("pageerror", (error) => collector.messages.push(`${label}: ${String(error)}`));
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStaticPreviewError(message, studioUrl)) {
      collector.failedResponses.push(`${label}: ${message}`);
    }
  });
  return collector;
}

function reportBrowserErrors(collector: BrowserErrorCollector): void {
  for (const message of collector.messages.slice(0, 10)) log(`browser error: ${message}`);
  for (const message of collector.failedResponses.slice(0, 10)) {
    log(`failed response: ${message}`);
  }
}

async function installCleanStudioState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ autosavePrefix, cleanSessionKey, mobileHintKey, quickstartKey }) => {
      try {
        window.localStorage.setItem(quickstartKey, "1");
        window.localStorage.setItem(mobileHintKey, "1");
        window.localStorage.setItem(
          "toonspectrum-studio-ui-density:v1",
          JSON.stringify({ mode: "full" }),
        );
        if (window.sessionStorage.getItem(cleanSessionKey) !== "1") {
          for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(autosavePrefix)) window.localStorage.removeItem(key);
          }
          window.sessionStorage.setItem(cleanSessionKey, "1");
        }
      } catch {
        // Studio itself handles unavailable storage; visible assertions remain strict.
      }
    },
    {
      autosavePrefix: AUTOSAVE_PREFIX,
      cleanSessionKey: CLEAN_SESSION_KEY,
      mobileHintKey: MOBILE_HINT_KEY,
      quickstartKey: QUICKSTART_KEY,
    },
  );
}

async function installSeededMobileState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ mobileHintKey, quickstartKey }) => {
      try {
        window.localStorage.setItem(quickstartKey, "1");
        window.localStorage.setItem(mobileHintKey, "1");
      } catch {
        // The restored fixture assertion below remains authoritative.
      }
    },
    { mobileHintKey: MOBILE_HINT_KEY, quickstartKey: QUICKSTART_KEY },
  );
}

async function dismissTransientChrome(page: Page, clearAutosave = true): Promise<void> {
  const quickstart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickstart.isVisible({ timeout: 250 }).catch(() => false)) {
    await quickstart.getByRole("button", { name: "닫기", exact: true }).click();
  }
  if (
    clearAutosave
    && await page.getByText("이전에 작성 중이던 임시저장 데이터가 있습니다.", {
      exact: false,
    }).isVisible({ timeout: 250 }).catch(() => false)
  ) {
    await page.getByRole("button", { name: "비우기", exact: true }).click();
  }
}

async function prepareStudioPage(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(8_000);
  await installCleanStudioState(page);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await dismissTransientChrome(page);
  const shellState = await page.evaluate(() => ({
    bodyTextLength: document.body.innerText.trim().length,
    hasErrorOverlay: Boolean(
      document.querySelector(
        "vite-error-overlay, .vite-error-overlay, #webpack-dev-server-client-overlay",
      ),
    ),
  }));
  invariant(shellState.bodyTextLength > 0, "Studio rendered a blank document");
  invariant(!shellState.hasErrorOverlay, "Vite error overlay is visible");
}

async function prepareSeededMobilePage(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(8_000);
  await installSeededMobileState(page);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const restore = page.getByRole("button", { name: "복구하기", exact: true });
  // Static preview can spend a few seconds waiting for unavailable API proxies before
  // the autosave banner settles. Do not start the mobile canvas audit against the
  // temporary blank document just because the Konva shell became visible first.
  if (await restore.isVisible({ timeout: 9_000 }).catch(() => false)) {
    await restore.click();
    await restore.waitFor({ state: "hidden" });
  }
  await page.locator(".konvajs-content").first().waitFor({ state: "visible" });
  await page.waitForTimeout(180);
}

async function visible(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error(`no visible locator matched ${String(locator)}`);
}

async function assertCanvasPoint(page: Page, point: ScreenPoint, label: string): Promise<void> {
  const reachesCanvas = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".konvajs-content") !== null,
    point,
  );
  invariant(reachesCanvas, `${label} is covered by editor chrome at ${point.x},${point.y}`);
}

async function drawMousePath(page: Page, points: readonly ScreenPoint[]): Promise<void> {
  invariant(points.length >= 2, "drawMousePath needs at least two points");
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps: 2 });
  }
  await page.mouse.up();
}

async function readLatestSnapshot(page: Page): Promise<PersistedSnapshot | null> {
  return page.evaluate((prefix) => {
    interface StoredDocument {
      savedAt?: unknown;
      currentPageId?: unknown;
      pagesList?: Array<{
        id?: unknown;
        elements?: unknown[];
        groups?: unknown[];
      }>;
    }

    let newest: { key: string; raw: string; value: StoredDocument } | null = null;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as StoredDocument;
        if (!Array.isArray(value.pagesList)) continue;
        if (
          !newest
          || String(value.savedAt ?? "") >= String(newest.value.savedAt ?? "")
        ) {
          newest = { key, raw, value };
        }
      } catch {
        // Ignore corrupt or unrelated entries; the scenario wait remains strict.
      }
    }
    if (!newest) return null;

    const currentPageId =
      typeof newest.value.currentPageId === "string"
        ? newest.value.currentPageId
        : null;
    const pageRecord =
      newest.value.pagesList?.find((candidate) => candidate.id === currentPageId)
      ?? newest.value.pagesList?.[0];
    if (!pageRecord) return null;

    const elements = (pageRecord.elements ?? []).flatMap((element) => {
      if (!element || typeof element !== "object" || Array.isArray(element)) return [];
      const record = element as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.type !== "string") return [];
      return [{
        id: record.id,
        type: record.type,
        groupId: typeof record.groupId === "string" ? record.groupId : null,
        locked: record.locked === true,
        x:
          typeof record.x === "number" && Number.isFinite(record.x)
            ? record.x
            : null,
        y:
          typeof record.y === "number" && Number.isFinite(record.y)
            ? record.y
            : null,
        width:
          typeof record.width === "number" && Number.isFinite(record.width)
            ? record.width
            : null,
        height:
          typeof record.height === "number" && Number.isFinite(record.height)
            ? record.height
            : null,
        fontSize:
          typeof record.fontSize === "number" && Number.isFinite(record.fontSize)
            ? record.fontSize
            : null,
        strokeWidth:
          typeof record.strokeWidth === "number" && Number.isFinite(record.strokeWidth)
            ? record.strokeWidth
            : null,
        points: Array.isArray(record.points)
          ? record.points.filter(
              (value): value is number =>
                typeof value === "number" && Number.isFinite(value),
            )
          : [],
      }];
    });
    const groups = (pageRecord.groups ?? []).flatMap((group) => {
      if (!group || typeof group !== "object" || Array.isArray(group)) return [];
      const record = group as Record<string, unknown>;
      if (typeof record.id !== "string") return [];
      return [{
        id: record.id,
        name: typeof record.name === "string" ? record.name : null,
        locked: record.locked === true,
      }];
    });

    return {
      key: newest.key,
      raw: newest.raw,
      savedAt:
        typeof newest.value.savedAt === "string" ? newest.value.savedAt : "",
      currentPageId,
      pageId: typeof pageRecord.id === "string" ? pageRecord.id : null,
      elements,
      groups,
    };
  }, AUTOSAVE_PREFIX);
}

async function waitForSnapshot(
  page: Page,
  description: string,
  predicate: (snapshot: PersistedSnapshot) => boolean,
  timeoutMs = 9_000,
): Promise<PersistedSnapshot> {
  const startedAt = Date.now();
  let latest: PersistedSnapshot | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await readLatestSnapshot(page);
    if (latest && predicate(latest)) return latest;
    await page.waitForTimeout(120);
  }
  const summary = latest
    ? {
        savedAt: latest.savedAt,
        types: latest.elements.map((element) => element.type),
        groupIds: latest.elements.map((element) => element.groupId),
        groups: latest.groups,
      }
    : null;
  throw new Error(`${description}; latest autosave=${JSON.stringify(summary)}`);
}

function byId(snapshot: PersistedSnapshot, id: string): PersistedElement {
  const element = snapshot.elements.find((candidate) => candidate.id === id);
  invariant(element, `autosave no longer contains fixture element ${id}`);
  return element;
}

function positionVector(element: PersistedElement): number[] {
  if (element.points.length >= 2) return [...element.points];
  invariant(
    element.x !== null && element.y !== null,
    `${element.id}/${element.type} has no translatable coordinates`,
  );
  return [element.x, element.y];
}

function samePositions(
  left: PersistedSnapshot,
  right: PersistedSnapshot,
  ids: readonly string[],
): boolean {
  return ids.every((id) => {
    const a = positionVector(byId(left, id));
    const b = positionVector(byId(right, id));
    return a.length === b.length
      && a.every((value, index) => Math.abs(value - b[index]!) <= POSITION_TOLERANCE);
  });
}

function sameOptionalNumber(
  left: number | null,
  right: number | null,
  tolerance: number,
): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= tolerance;
}

function sameGeometry(
  left: PersistedSnapshot,
  right: PersistedSnapshot,
  ids: readonly string[],
): boolean {
  return ids.every((id) => {
    const a = byId(left, id);
    const b = byId(right, id);
    return a.type === b.type
      && a.groupId === b.groupId
      && a.locked === b.locked
      && sameOptionalNumber(a.x, b.x, POSITION_TOLERANCE)
      && sameOptionalNumber(a.y, b.y, POSITION_TOLERANCE)
      && sameOptionalNumber(a.width, b.width, POSITION_TOLERANCE)
      && sameOptionalNumber(a.height, b.height, POSITION_TOLERANCE)
      && sameOptionalNumber(a.fontSize, b.fontSize, POSITION_TOLERANCE)
      && sameOptionalNumber(a.strokeWidth, b.strokeWidth, POSITION_TOLERANCE)
      && a.points.length === b.points.length
      && a.points.every(
        (value, index) =>
          Math.abs(value - b.points[index]!) <= POSITION_TOLERANCE,
      );
  });
}

function assertNear(
  actual: number,
  expected: number,
  label: string,
  tolerance = RESIZE_TOLERANCE,
): void {
  invariant(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected.toFixed(4)}, received ${actual.toFixed(4)}`,
  );
}

function assertUniformResize(
  before: PersistedSnapshot,
  after: PersistedSnapshot,
  ids: readonly string[],
  expectedGroupId: string,
): { scale: number; offset: ScreenPoint } {
  const imageId = ids.find((id) => byId(before, id).type === "image");
  invariant(imageId, "uniform resize fixture has no image member");
  const imageBefore = byId(before, imageId);
  const imageAfter = byId(after, imageId);
  invariant(
    imageBefore.x !== null
      && imageBefore.y !== null
      && imageBefore.width !== null
      && imageBefore.width > 0
      && imageBefore.height !== null
      && imageBefore.height > 0
      && imageAfter.x !== null
      && imageAfter.y !== null
      && imageAfter.width !== null
      && imageAfter.height !== null,
    "uniform resize image member has incomplete box geometry",
  );
  const scale = imageAfter.width / imageBefore.width;
  const imageHeightScale = imageAfter.height / imageBefore.height;
  invariant(
    Number.isFinite(scale)
      && scale > 0
      && Math.abs(scale - 1) >= 0.03,
    `corner drag did not produce a material positive scale: ${String(scale)}`,
  );
  assertNear(
    imageHeightScale,
    scale,
    "image width and height did not use the same uniform scale",
    0.002,
  );
  const offset = {
    x: imageAfter.x - imageBefore.x * scale,
    y: imageAfter.y - imageBefore.y * scale,
  };
  invariant(
    Number.isFinite(offset.x) && Number.isFinite(offset.y),
    "uniform resize produced a non-finite affine offset",
  );

  for (const id of ids) {
    const previous = byId(before, id);
    const next = byId(after, id);
    invariant(
      previous.type === next.type,
      `${id}: element type changed during uniform resize`,
    );
    invariant(
      previous.groupId === expectedGroupId && next.groupId === expectedGroupId,
      `${id}: groupId changed during uniform resize`,
    );
    invariant(
      previous.locked === next.locked,
      `${id}: element lock state changed during uniform resize`,
    );

    if (previous.points.length > 0 || next.points.length > 0) {
      invariant(
        previous.points.length === next.points.length
          && previous.points.length % 2 === 0,
        `${id}: point geometry shape changed during uniform resize`,
      );
      for (let index = 0; index < previous.points.length; index += 2) {
        assertNear(
          next.points[index]!,
          previous.points[index]! * scale + offset.x,
          `${id}: point ${index / 2} x did not share the group affine transform`,
        );
        assertNear(
          next.points[index + 1]!,
          previous.points[index + 1]! * scale + offset.y,
          `${id}: point ${index / 2} y did not share the group affine transform`,
        );
      }
    }

    if (previous.x !== null || next.x !== null) {
      invariant(previous.x !== null && next.x !== null, `${id}: x geometry disappeared`);
      assertNear(
        next.x,
        previous.x * scale + offset.x,
        `${id}: x did not share the group affine transform`,
      );
    }
    if (previous.y !== null || next.y !== null) {
      invariant(previous.y !== null && next.y !== null, `${id}: y geometry disappeared`);
      assertNear(
        next.y,
        previous.y * scale + offset.y,
        `${id}: y did not share the group affine transform`,
      );
    }
    for (const field of ["width", "height", "fontSize"] as const) {
      const previousValue = previous[field];
      const nextValue = next[field];
      if (previousValue === null && nextValue === null) continue;
      invariant(
        previousValue !== null && nextValue !== null,
        `${id}: ${field} geometry disappeared`,
      );
      assertNear(
        nextValue,
        previousValue * scale,
        `${id}: ${field} did not share the uniform scale`,
      );
    }
    if (previous.type === "draw") {
      invariant(
        sameOptionalNumber(
          previous.strokeWidth,
          next.strokeWidth,
          POSITION_TOLERANCE,
        ),
        `${id}: default object resize unexpectedly scaled authored stroke width`,
      );
    }
  }
  return { scale, offset };
}

function assertAtomicTranslation(
  before: PersistedSnapshot,
  after: PersistedSnapshot,
  ids: readonly string[],
  expectedGroupId: string,
): ScreenPoint {
  const anchorId =
    ids.find((id) => {
      const element = byId(before, id);
      return element.x !== null && element.y !== null;
    })
    ?? ids[0];
  invariant(anchorId, "atomic translation assertion has no fixture elements");
  const anchorBefore = positionVector(byId(before, anchorId));
  const anchorAfter = positionVector(byId(after, anchorId));
  const dx = anchorAfter[0]! - anchorBefore[0]!;
  const dy = anchorAfter[1]! - anchorBefore[1]!;
  invariant(
    Math.hypot(dx, dy) > 2,
    `group drag did not move: delta=${dx.toFixed(2)},${dy.toFixed(2)}`,
  );

  for (const id of ids) {
    const previous = byId(before, id);
    const next = byId(after, id);
    invariant(
      previous.groupId === expectedGroupId && next.groupId === expectedGroupId,
      `${id}: groupId changed during translation`,
    );
    const previousVector = positionVector(previous);
    const nextVector = positionVector(next);
    invariant(
      previousVector.length === nextVector.length,
      `${id}: coordinate shape changed during translation`,
    );
    for (let index = 0; index < previousVector.length; index += 2) {
      const memberDx = nextVector[index]! - previousVector[index]!;
      const memberDy = nextVector[index + 1]! - previousVector[index + 1]!;
      invariant(
        Math.abs(memberDx - dx) <= POSITION_TOLERANCE
        && Math.abs(memberDy - dy) <= POSITION_TOLERANCE,
        `${id}: member delta ${memberDx.toFixed(2)},${memberDy.toFixed(2)} `
          + `does not match group delta ${dx.toFixed(2)},${dy.toFixed(2)}`,
      );
    }
  }
  return { x: dx, y: dy };
}

async function waitForWholeGroupSelection(
  page: Page,
  expectedCount: number,
): Promise<void> {
  await page.locator('[data-studio-canvas-status-rail]')
    .getByText(`${expectedCount}개 선택`, { exact: true })
    .waitFor({ state: "visible" });
}

async function waitForNoWholeGroupSelection(
  page: Page,
  expectedCount: number,
): Promise<void> {
  await page.locator('[data-studio-canvas-status-rail]')
    .getByText(`${expectedCount}개 선택`, { exact: true })
    .waitFor({ state: "hidden" });
}

async function groupLayerState(page: Page): Promise<"all" | "partial" | "none"> {
  const group = page.locator("[data-studio-layer-group-selection]").first();
  await group.waitFor({ state: "attached" });
  const value = await group.getAttribute("data-studio-layer-group-selection");
  invariant(
    value === "all" || value === "partial" || value === "none",
    `unexpected group selection state ${String(value)}`,
  );
  return value;
}

async function waitForGroupLayerState(
  page: Page,
  state: "all" | "partial" | "none",
): Promise<void> {
  await page.locator(`[data-studio-layer-group-selection="${state}"]`).first().waitFor({
    state: "attached",
  });
}

async function findFixtureColorBounds(
  page: Page,
  stage: Locator,
  timeoutMs = 6_000,
): Promise<ColorBounds> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const stageBox = await stage.boundingBox();
    invariant(stageBox, "could not measure the Konva stage");
    const screenshot = await stage.screenshot({ animations: "disabled" });
    const local = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width;
      let top = canvas.height;
      let right = -1;
      let bottom = -1;
      let count = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const red = pixels[offset]!;
          const green = pixels[offset + 1]!;
          const blue = pixels[offset + 2]!;
          const alpha = pixels[offset + 3]!;
          if (red < 200 || green > 105 || blue < 175 || alpha < 180) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
          count += 1;
        }
      }
      return count > 80
        ? { left, top, right, bottom, count, width: canvas.width, height: canvas.height }
        : null;
    }, screenshot.toString("base64"));
    if (local) {
      const scaleX = stageBox.width / local.width;
      const scaleY = stageBox.height / local.height;
      const left = stageBox.x + local.left * scaleX;
      const top = stageBox.y + local.top * scaleY;
      const right = stageBox.x + local.right * scaleX;
      const bottom = stageBox.y + local.bottom * scaleY;
      return {
        left,
        top,
        right,
        bottom,
        center: { x: (left + right) / 2, y: (top + bottom) / 2 },
        pixelCount: local.count,
      };
    }
    await page.waitForTimeout(120);
  }
  throw new Error("the distinctive magenta image fixture is not visible on the Konva stage");
}

async function createFixturePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 144;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas is unavailable");
    context.fillStyle = "#f000ff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffe500";
    context.fillRect(16, 16, 28, 28);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 5;
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    return canvas.toDataURL("image/png");
  });
  const base64 = dataUrl.split(",")[1];
  invariant(base64, "fixture canvas did not produce a PNG data URL");
  return Buffer.from(base64, "base64");
}

async function activateSelectionTool(page: Page): Promise<void> {
  await page.keyboard.press("v");
  const button = await visible(page.getByRole("button", { name: "선택 (V)", exact: true }));
  // Click even when already active: this moves focus out of a just-closed inline text editor so
  // the following Meta+A is handled by Studio instead of a stale textbox selection boundary.
  await button.click();
  invariant(
    await button.getAttribute("aria-pressed") === "true",
    "selection tool did not become active",
  );
}

async function openLayerNavigator(page: Page): Promise<void> {
  const navigator = page.getByTestId("studio-inspector-navigator");
  await navigator.waitFor({ state: "visible" });
  // The visible layer-count badge participates in the accessible name (`레이어 3`).
  const tab = navigator.getByRole("tab", { name: /^레이어(?:\s+\d+)?$/u });
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
}

async function shiftClick(page: Page, point: ScreenPoint): Promise<void> {
  await assertCanvasPoint(page, point, "Shift-click target");
  const observedPointerDown = page.evaluate(() => new Promise<{
    shiftKey: boolean;
    targetTag: string | null;
  }>((resolve) => {
    document.addEventListener("pointerdown", (event) => {
      resolve({
        shiftKey: event.shiftKey,
        targetTag: event.target instanceof Element ? event.target.tagName : null,
      });
    }, { capture: true, once: true });
  }));
  const observedMouseDown = page.evaluate(() => new Promise<{
    shiftKey: boolean;
    targetTag: string | null;
  }>((resolve) => {
    document.addEventListener("mousedown", (event) => {
      resolve({
        shiftKey: event.shiftKey,
        targetTag: event.target instanceof Element ? event.target.tagName : null,
      });
    }, { capture: true, once: true });
  }));
  await page.keyboard.down("Shift");
  try {
    await page.mouse.click(point.x, point.y);
  } finally {
    await page.keyboard.up("Shift");
  }
  const observed = await observedPointerDown;
  const observedMouse = await observedMouseDown;
  invariant(
    observed.shiftKey && observedMouse.shiftKey,
    "browser lost the Shift modifier: "
      + `pointerdown=${observed.shiftKey}/${String(observed.targetTag)}, `
      + `mousedown=${observedMouse.shiftKey}/${String(observedMouse.targetTag)}`,
  );
}

async function konvaElementHitAt(
  page: Page,
  point: ScreenPoint,
): Promise<{ elementId: string | null; ancestry: string[] }> {
  return page.evaluate(({ x, y }) => {
    interface BrowserKonvaNode {
      attrs?: Record<string, unknown>;
      getClassName?: () => string;
      getParent?: () => BrowserKonvaNode | null;
      name?: () => string;
    }
    interface BrowserKonvaStage {
      container: () => HTMLElement;
      getIntersection: (point: ScreenPoint) => BrowserKonvaNode | null;
    }
    const runtime = (window as typeof window & {
      Konva?: { stages?: BrowserKonvaStage[] };
    }).Konva;
    const stage = runtime?.stages?.find((candidate) => {
      const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true
        && bounds !== undefined
        && bounds.width > 0
        && bounds.height > 0
        && x >= bounds.left
        && x <= bounds.right
        && y >= bounds.top
        && y <= bounds.bottom;
    });
    if (!stage) return { elementId: null, ancestry: ["missing-stage"] };
    const content = stage.container().querySelector<HTMLElement>(".konvajs-content");
    if (!content) return { elementId: null, ancestry: ["missing-content"] };
    const bounds = content.getBoundingClientRect();
    let node = stage.getIntersection({ x: x - bounds.left, y: y - bounds.top });
    let elementId: string | null = null;
    const ancestry: string[] = [];
    while (node) {
      const className = node.getClassName?.() ?? "Node";
      const name = node.name?.() ?? "";
      ancestry.push(name ? `${className}:${name}` : className);
      const candidateId = node.attrs?.studioElementId;
      if (typeof candidateId === "string" && candidateId.length > 0) {
        elementId = candidateId;
        break;
      }
      node = node.getParent?.() ?? null;
    }
    return { elementId, ancestry };
  }, point);
}

async function konvaDocumentPointsToScreen(
  page: Page,
  points: readonly ScreenPoint[],
): Promise<ScreenPoint[]> {
  return page.evaluate((documentPoints) => {
    interface BrowserKonvaTransform {
      point: (point: ScreenPoint) => ScreenPoint;
    }
    interface BrowserKonvaStage {
      container: () => HTMLElement;
      getAbsoluteTransform: () => BrowserKonvaTransform;
    }
    const runtime = (window as typeof window & {
      Konva?: { stages?: BrowserKonvaStage[] };
    }).Konva;
    const stage = runtime?.stages?.find((candidate) => {
      const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true
        && bounds !== undefined
        && bounds.width > 0
        && bounds.height > 0;
    });
    if (!stage) return [];
    const content = stage.container().querySelector<HTMLElement>(".konvajs-content");
    if (!content) return [];
    const bounds = content.getBoundingClientRect();
    const transform = stage.getAbsoluteTransform();
    return documentPoints.map((point) => {
      const local = transform.point(point);
      return { x: bounds.left + local.x, y: bounds.top + local.y };
    });
  }, points);
}

async function groupResizeHandleState(
  page: Page,
  preferredCorner = "bottom-right",
): Promise<GroupResizeHandleState> {
  return page.evaluate((corner) => {
    interface BrowserKonvaNode {
      name: () => string;
      isVisible: () => boolean;
      findOne?: (selector: string) => BrowserKonvaNode | undefined;
      getChildren?: () => BrowserKonvaNode[];
      getAbsolutePosition: (relativeTo?: BrowserKonvaNode) => ScreenPoint;
      nodes?: () => BrowserKonvaNode[];
    }
    interface BrowserKonvaStage extends BrowserKonvaNode {
      container: () => HTMLElement;
      findOne: (selector: string) => BrowserKonvaNode | undefined;
    }
    const runtime = (window as typeof window & {
      Konva?: { stages?: BrowserKonvaStage[] };
    }).Konva;
    const stage = runtime?.stages?.find((candidate) => {
      const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true
        && bounds !== undefined
        && bounds.width > 0
        && bounds.height > 0;
    });
    if (!stage) {
      return {
        transformerPresent: false,
        transformerVisible: false,
        attachedNodeCount: 0,
        cornerName: null,
        point: null,
      };
    }
    const transformer = stage.findOne(".studio-group-uniform-resize-transformer");
    if (!transformer) {
      return {
        transformerPresent: false,
        transformerVisible: false,
        attachedNodeCount: 0,
        cornerName: null,
        point: null,
      };
    }
    const attachedNodeCount = transformer.nodes?.().length ?? 0;
    const childMatch = transformer.getChildren?.().find((candidate) =>
      candidate.name().split(/\s+/u).includes(corner)
    );
    const anchor = transformer.findOne?.(`.${corner}`) ?? childMatch;
    const transformerVisible =
      transformer.isVisible()
      && attachedNodeCount > 0
      && anchor?.isVisible() === true;
    const content = stage.container().querySelector<HTMLElement>(".konvajs-content");
    if (!transformerVisible || !anchor || !content) {
      return {
        transformerPresent: true,
        transformerVisible: false,
        attachedNodeCount,
        cornerName: anchor?.name() ?? null,
        point: null,
      };
    }
    const documentPoint = anchor.getAbsolutePosition(stage);
    const bounds = content.getBoundingClientRect();
    return {
      transformerPresent: true,
      transformerVisible: true,
      attachedNodeCount,
      cornerName: anchor.name(),
      point: {
        // `getAbsolutePosition(stage)` already includes every transformed canvas child between
        // the anchor and Stage, so it is expressed in the Konva content's CSS-pixel space. Applying
        // Stage's transform again would double the current zoom/pan.
        x: bounds.left + documentPoint.x,
        y: bounds.top + documentPoint.y,
      },
    };
  }, preferredCorner);
}

async function waitForGroupResizeHandle(
  page: Page,
  visibleState: boolean,
  timeoutMs = 6_000,
): Promise<GroupResizeHandleState> {
  const startedAt = Date.now();
  let latest: GroupResizeHandleState | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await groupResizeHandleState(page);
    const settled =
      visibleState
        ? latest.transformerPresent
          && latest.transformerVisible
          && latest.attachedNodeCount === 1
          && latest.point !== null
        : latest.transformerPresent
          && !latest.transformerVisible
          && latest.attachedNodeCount === 0
          && latest.point === null;
    if (settled) return latest;
    await page.waitForTimeout(80);
  }
  throw new Error(
    `group resize handle did not become ${visibleState ? "visible" : "hidden"}; `
      + `latest=${JSON.stringify(latest)}`,
  );
}

async function konvaElementTransformStates(
  page: Page,
  elementId: string,
): Promise<KonvaElementTransformState[]> {
  return page.evaluate((id) => {
    interface BrowserKonvaNode {
      attrs?: Record<string, unknown>;
      getClassName: () => string;
      name: () => string;
      draggable: () => boolean;
      x: () => number;
      y: () => number;
      scaleX: () => number;
      scaleY: () => number;
    }
    interface BrowserKonvaStage {
      container: () => HTMLElement;
      find: (predicate: (node: BrowserKonvaNode) => boolean) => BrowserKonvaNode[];
    }
    const runtime = (window as typeof window & {
      Konva?: { stages?: BrowserKonvaStage[] };
    }).Konva;
    const stage = runtime?.stages?.find((candidate) => {
      const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
      const bounds = content?.getBoundingClientRect();
      return content?.isConnected === true
        && bounds !== undefined
        && bounds.width > 0
        && bounds.height > 0;
    });
    if (!stage) return [];
    return stage
      .find((node) => node.attrs?.studioElementId === id)
      .map((node) => ({
        className: node.getClassName(),
        name: node.name(),
        draggable: node.draggable(),
        x: node.x(),
        y: node.y(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      }));
  }, elementId);
}

async function waitForNeutralDrawPreviewTransform(
  page: Page,
  drawId: string,
  description: string,
  timeoutMs = 4_000,
): Promise<void> {
  const startedAt = Date.now();
  let latest: KonvaElementTransformState[] = [];
  while (Date.now() - startedAt < timeoutMs) {
    latest = await konvaElementTransformStates(page, drawId);
    if (
      latest.length > 0
      && latest.every(
        (node) =>
          Math.abs(node.x) <= POSITION_TOLERANCE
          && Math.abs(node.y) <= POSITION_TOLERANCE
          && Math.abs(node.scaleX - 1) <= POSITION_TOLERANCE
          && Math.abs(node.scaleY - 1) <= POSITION_TOLERANCE,
      )
    ) {
      return;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`${description}; draw node transforms=${JSON.stringify(latest)}`);
}

async function fixtureKonvaTransformStates(
  page: Page,
  elementIds: readonly string[],
): Promise<Record<string, KonvaElementTransformState[]>> {
  const entries = await Promise.all(
    elementIds.map(async (elementId) => [
      elementId,
      await konvaElementTransformStates(page, elementId),
    ] as const),
  );
  return Object.fromEntries(entries);
}

function sameFixtureKonvaTransformStates(
  left: Readonly<Record<string, readonly KonvaElementTransformState[]>>,
  right: Readonly<Record<string, readonly KonvaElementTransformState[]>>,
): boolean {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  if (JSON.stringify(leftIds) !== JSON.stringify(rightIds)) return false;
  return leftIds.every((elementId) => {
    const leftNodes = left[elementId] ?? [];
    const rightNodes = right[elementId] ?? [];
    return leftNodes.length === rightNodes.length
      && leftNodes.every((leftNode, index) => {
        const rightNode = rightNodes[index];
        return rightNode !== undefined
          && leftNode.className === rightNode.className
          && leftNode.name === rightNode.name
          && leftNode.draggable === rightNode.draggable
          && Math.abs(leftNode.x - rightNode.x) <= POSITION_TOLERANCE
          && Math.abs(leftNode.y - rightNode.y) <= POSITION_TOLERANCE
          && Math.abs(leftNode.scaleX - rightNode.scaleX) <= POSITION_TOLERANCE
          && Math.abs(leftNode.scaleY - rightNode.scaleY) <= POSITION_TOLERANCE;
      });
  });
}

async function waitForFixtureKonvaTransformState(
  page: Page,
  elementIds: readonly string[],
  expected: Readonly<Record<string, readonly KonvaElementTransformState[]>>,
  relation: "equal" | "different",
  description: string,
  timeoutMs = 4_000,
): Promise<void> {
  const startedAt = Date.now();
  let latest: Record<string, KonvaElementTransformState[]> = {};
  while (Date.now() - startedAt < timeoutMs) {
    latest = await fixtureKonvaTransformStates(page, elementIds);
    const equal = sameFixtureKonvaTransformStates(expected, latest);
    if ((relation === "equal" && equal) || (relation === "different" && !equal)) return;
    await page.waitForTimeout(60);
  }
  throw new Error(
    `${description}; expected=${JSON.stringify(expected)}, latest=${JSON.stringify(latest)}`,
  );
}

async function dragFromTo(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
  steps = 14,
): Promise<void> {
  await assertCanvasPoint(page, from, "drag start");
  await assertCanvasPoint(page, to, "drag end");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  await page.mouse.move(4, 4);
}

async function createMixedFixture(
  page: Page,
): Promise<{ drawPath: ScreenPoint[]; initial: PersistedSnapshot }> {
  await page.keyboard.press("b");
  await page.locator('[data-studio-draw-options="true"]').waitFor({ state: "visible" });
  const stage = page.locator(".konvajs-content").first();
  const stageBox = await stage.boundingBox();
  const viewport = page.viewportSize();
  invariant(stageBox && viewport, "could not measure the desktop stage");

  const left = Math.max(stageBox.x + 70, viewport.width * 0.34);
  const right = Math.min(stageBox.x + stageBox.width - 70, viewport.width * 0.69);
  const top = Math.max(stageBox.y + 90, viewport.height * 0.2);
  invariant(right - left >= 300, "visible canvas is too narrow for the group fixture");
  const drawPath = Array.from({ length: 9 }, (_, index) => ({
    x: left + 20 + index * 18,
    y: top + 42 + Math.sin((index / 8) * Math.PI) * 18,
  }));
  await assertCanvasPoint(page, drawPath[0]!, "draw fixture start");
  await assertCanvasPoint(page, drawPath.at(-1)!, "draw fixture end");
  await drawMousePath(page, drawPath);
  await waitForSnapshot(
    page,
    "draw fixture was not persisted",
    (snapshot) =>
      snapshot.elements.length === 1
      && snapshot.elements[0]?.type === "draw"
      && snapshot.elements[0].points.length >= 4,
  );

  const addText = await visible(
    page.getByRole("button", { name: "텍스트 추가", exact: true }),
  );
  await addText.click();
  const textEditor = page.locator('textarea[aria-label="캔버스 글자 편집"]');
  await textEditor.waitFor({ state: "visible", timeout: 8_000 });
  await page.keyboard.press("Escape");
  await textEditor.waitFor({ state: "hidden" });
  await waitForSnapshot(
    page,
    "text fixture was not persisted",
    (snapshot) =>
      snapshot.elements.length === 2
      && snapshot.elements.some((element) => element.type === "draw")
      && snapshot.elements.some((element) => element.type === "text"),
  );

  const png = await createFixturePng(page);
  const imageInput = page.locator('input[aria-label="이미지 추가"]').first();
  await imageInput.setInputFiles({
    name: "group-fixture.png",
    mimeType: "image/png",
    buffer: png,
  });
  const initial = await waitForSnapshot(
    page,
    "image fixture was not persisted",
    (snapshot) => {
      const types = snapshot.elements.map((element) => element.type).sort();
      return snapshot.elements.length === 3
        && JSON.stringify(types) === JSON.stringify(["draw", "image", "text"]);
    },
  );
  return { drawPath, initial };
}

async function runDesktopGroupAudit(
  browser: Browser,
  studioUrl: string,
): Promise<DesktopAuditResult> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "desktop-groups", studioUrl);
  const screenshots: string[] = [];

  try {
    await prepareStudioPage(page, studioUrl);
    const { initial } = await createMixedFixture(page);
    const fixtureIds = initial.elements.map((element) => element.id);
    const fixtureTypes = initial.elements.map((element) => element.type).sort();
    invariant(fixtureIds.length === 3, "mixed fixture did not contain exactly three elements");

    await activateSelectionTool(page);
    await page.keyboard.press("Meta+A");
    await waitForWholeGroupSelection(page, 3);
    await page.getByRole("button", { name: "선택 요소 그룹화", exact: true }).click();

    const grouped = await waitForSnapshot(
      page,
      "mixed fixture was not persisted as one group",
      (snapshot) => {
        const groupIds = snapshot.elements.map((element) => element.groupId);
        return snapshot.elements.length === 3
          && snapshot.groups.length === 1
          && typeof groupIds[0] === "string"
          && groupIds.every((groupId) => groupId === groupIds[0]);
      },
    );
    const groupId = grouped.elements[0]?.groupId;
    invariant(groupId, "grouped fixture has no groupId");
    const groupName = grouped.groups.find((group) => group.id === groupId)?.name ?? null;

    await openLayerNavigator(page);
    await waitForGroupLayerState(page, "all");
    const stage = page.locator(".konvajs-content").first();
    // Keep the locator stable while the attribute changes between all/none/partial.
    const groupLayer = page.locator("[data-studio-layer-group-selection]").first();
    const groupLayerRow = groupLayer.locator(':scope > [role="treeitem"]');
    invariant(
      await groupLayerRow.getAttribute("aria-selected") === "true",
      "the completely selected group row is not exposed as aria-selected",
    );
    const groupLayerLabel = await groupLayerRow.getAttribute("aria-label");
    invariant(
      groupLayerLabel?.includes("그룹") === true
      && groupLayerLabel.includes("3개 레이어"),
      `the group row has an incomplete accessible label: ${String(groupLayerLabel)}`,
    );
    const groupLayerShortcuts = await groupLayerRow.getAttribute("aria-keyshortcuts");
    invariant(
      groupLayerShortcuts?.includes("Enter") === true
      && groupLayerShortcuts.includes("Space"),
      `the group row does not expose keyboard selection shortcuts: ${String(groupLayerShortcuts)}`,
    );
    const groupedScreenshot = join(SCRATCH, "studio-group-desktop-created.png");
    await stage.screenshot({ path: groupedScreenshot, animations: "disabled" });
    screenshots.push(groupedScreenshot);

    // A normal member click must select the complete group again after a full deselect.
    await page.keyboard.press("Escape");
    await waitForGroupLayerState(page, "none");
    let imageBounds = await findFixtureColorBounds(page, stage);
    await page.mouse.click(imageBounds.center.x, imageBounds.center.y);
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "all");
    // React DOM status and the Konva node listener are committed by separate renderers. Give the
    // canvas bridge one animation frame to install the selection-aware handler before toggling it.
    await page.waitForTimeout(40);
    const canvasClickSelectedWholeGroup = true;

    // Shift-click toggles a top-level group as one PPT/Figma selection unit. It must never
    // leave one child selected merely because the pointer landed on that child. Reuse the
    // deliberately distant draw fixture so the additive modifier reaches Konva's native event
    // without image loading or alpha-hit timing entering the assertion.
    const drawElement = initial.elements.find((element) => element.type === "draw");
    invariant(drawElement, "the mixed fixture has no draw member");
    const drawDocumentPoints = Array.from(
      { length: Math.floor(drawElement.points.length / 2) },
      (_, index) => ({
        x: drawElement.points[index * 2]!,
        y: drawElement.points[index * 2 + 1]!,
      }),
    );
    const drawScreenPoints = await konvaDocumentPointsToScreen(page, drawDocumentPoints);
    invariant(
      drawScreenPoints.length === drawDocumentPoints.length,
      "could not project the draw fixture into the current Studio viewport",
    );
    const drawSelectionPoint =
      drawScreenPoints[Math.floor(drawScreenPoints.length / 2)]!;
    const drawHit = await konvaElementHitAt(page, drawSelectionPoint);
    invariant(
      drawHit.elementId === drawElement.id,
      `Shift-click did not hit the draw fixture: ${JSON.stringify(drawHit)}`,
    );
    await shiftClick(page, drawSelectionPoint);
    await waitForNoWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "none");
    const shiftClickRemovedWholeGroup = true;
    // The selection overlay and per-node drag contract are reconciled by the Konva renderer after
    // the DOM status rail commits. Wait one frame so the second Shift click exercises the new
    // unselected node contract rather than an element being replaced mid-contact.
    await page.waitForTimeout(40);
    const unselectedDrawScreenPoints =
      await konvaDocumentPointsToScreen(page, drawDocumentPoints);
    invariant(
      unselectedDrawScreenPoints.length === drawDocumentPoints.length,
      "could not reproject the draw fixture after removing the group selection",
    );
    const unselectedDrawSelectionPoint =
      unselectedDrawScreenPoints[Math.floor(unselectedDrawScreenPoints.length / 2)]!;
    const restoredDrawHit = await konvaElementHitAt(page, unselectedDrawSelectionPoint);
    invariant(
      restoredDrawHit.elementId === drawElement.id,
      `second Shift-click lost the draw fixture: ${JSON.stringify(restoredDrawHit)}`,
    );
    await shiftClick(page, unselectedDrawSelectionPoint);
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "all");
    const shiftClickRestoredWholeGroup = true;

    // The Layer Navigator group row is a direct, accessible whole-group selection target.
    // This follows canvas interaction so Escape still belongs to the canvas before the row
    // deliberately takes keyboard focus.
    await page.keyboard.press("Escape");
    await waitForGroupLayerState(page, "none");
    await groupLayerRow.click();
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "all");
    invariant(
      await groupLayerRow.getAttribute("aria-selected") === "true",
      "clicking the Layer Navigator group row did not select the complete group",
    );
    const layerNavigatorRowSelectedWholeGroup = true;

    const selectedScreenshot = join(SCRATCH, "studio-group-desktop-selected.png");
    await stage.screenshot({ path: selectedScreenshot, animations: "disabled" });
    screenshots.push(selectedScreenshot);

    // Group drag must translate draw points and coordinate elements by the same document delta.
    await dragFromTo(
      page,
      imageBounds.center,
      { x: imageBounds.center.x + 58, y: imageBounds.center.y + 34 },
    );
    const moved = await waitForSnapshot(
      page,
      "group drag did not reach autosave",
      (snapshot) =>
        snapshot.elements.length === 3
        && fixtureIds.every((id) => byId(snapshot, id).groupId === groupId)
        && !samePositions(grouped, snapshot, fixtureIds),
    );
    const firstDragDelta = assertAtomicTranslation(grouped, moved, fixtureIds, groupId);
    await waitForNeutralDrawPreviewTransform(
      page,
      drawElement.id,
      "successful group drag left an imperative draw preview transform behind",
    );

    // Escape during a live group drag is a cancellation, not a selection-clear followed by a
    // delayed mouseup commit. Assert both layers of the contract: Konva's imperative preview must
    // return to the exact pre-drag transform while the pointer is still held, and releasing that
    // pointer must not publish a new document snapshot. The following Undo then proves no hidden
    // history entry was inserted by the cancelled gesture.
    imageBounds = await findFixtureColorBounds(page, stage);
    const beforeEscapeDragTransforms =
      await fixtureKonvaTransformStates(page, fixtureIds);
    invariant(
      fixtureIds.every(
        (id) => (beforeEscapeDragTransforms[id]?.length ?? 0) > 0,
      ),
      `could not capture every group member before the Escape drag: `
        + JSON.stringify(beforeEscapeDragTransforms),
    );
    const escapeDragTarget = {
      x: imageBounds.center.x + 52,
      y: imageBounds.center.y + 30,
    };
    await assertCanvasPoint(page, imageBounds.center, "Escape drag start");
    await assertCanvasPoint(page, escapeDragTarget, "Escape drag target");
    await page.mouse.move(imageBounds.center.x, imageBounds.center.y);
    await page.mouse.down();
    await page.mouse.move(escapeDragTarget.x, escapeDragTarget.y, { steps: 14 });
    await waitForFixtureKonvaTransformState(
      page,
      fixtureIds,
      beforeEscapeDragTransforms,
      "different",
      "group drag never produced a live preview before Escape",
    );
    await page.keyboard.press("Escape");
    await waitForFixtureKonvaTransformState(
      page,
      fixtureIds,
      beforeEscapeDragTransforms,
      "equal",
      "Escape did not restore the complete group preview while the pointer was held",
    );
    const escapeCancelledDragPreviewRestored = true;
    await page.mouse.up();
    await page.mouse.move(4, 4);
    await page.waitForTimeout(650);
    const afterEscapeDrag = await readLatestSnapshot(page);
    invariant(afterEscapeDrag, "autosave disappeared after the Escape-cancelled group drag");
    const escapeCancelledDragPersistedUnchanged =
      samePositions(moved, afterEscapeDrag, fixtureIds);
    invariant(
      escapeCancelledDragPersistedUnchanged,
      "Escape-cancelled group drag changed persisted member coordinates after mouseup",
    );
    await waitForWholeGroupSelection(page, 3);

    // One Undo must restore every member while preserving the group relationship.
    const undo = await visible(page.getByRole("button", { name: "실행취소", exact: true }));
    invariant(!await undo.isDisabled(), "Undo is disabled after a group drag");
    await undo.click();
    const undone = await waitForSnapshot(
      page,
      "one Undo did not restore the complete group",
      (snapshot) =>
        fixtureIds.every((id) => byId(snapshot, id).groupId === groupId)
        && samePositions(grouped, snapshot, fixtureIds),
    );
    const undoRestoredAllMembers = samePositions(grouped, undone, fixtureIds);
    const escapeCancelledDragUndoStackUnchanged = undoRestoredAllMembers;
    await waitForNeutralDrawPreviewTransform(
      page,
      drawElement.id,
      "group drag Undo restored the model but not the draw node transform",
    );

    // A dedicated corner Transformer must resize the mixed draw + text + PNG group as one
    // positive uniform affine unit. The assertion reads the persisted model, not just pixels:
    // every draw point and every coordinate/size field must share one scale and one offset.
    const resizeHandle = await waitForGroupResizeHandle(page, true);
    invariant(
      resizeHandle.point
        && resizeHandle.cornerName?.split(/\s+/u).includes("bottom-right") === true,
      `the visible group Transformer has no bottom-right corner: ${JSON.stringify(resizeHandle)}`,
    );
    const resizeHit = await konvaElementHitAt(page, resizeHandle.point);
    invariant(
      resizeHit.ancestry.some((entry) => entry.includes("bottom-right"))
        && resizeHit.ancestry.some((entry) =>
          entry.includes("studio-group-uniform-resize-transformer")
        ),
      `the group resize corner is not pointer-addressable: `
        + `${JSON.stringify({ resizeHandle, resizeHit })}`,
    );
    const stageBoxBeforeResize = await stage.boundingBox();
    invariant(stageBoxBeforeResize, "could not measure the stage for group resize");
    const resizeTarget = {
      x: Math.min(
        resizeHandle.point.x + 72,
        stageBoxBeforeResize.x + stageBoxBeforeResize.width - 14,
      ),
      y: Math.min(
        resizeHandle.point.y + 72,
        stageBoxBeforeResize.y + stageBoxBeforeResize.height - 14,
      ),
    };
    invariant(
      resizeTarget.x - resizeHandle.point.x >= 36
        && resizeTarget.y - resizeHandle.point.y >= 36,
      `the visible canvas has insufficient room for a material corner resize: `
        + `${JSON.stringify({ from: resizeHandle.point, to: resizeTarget, stageBoxBeforeResize })}`,
    );
    await dragFromTo(page, resizeHandle.point, resizeTarget, 18);
    const resized = await waitForSnapshot(
      page,
      "corner Transformer resize did not reach autosave",
      (snapshot) =>
        fixtureIds.every((id) => byId(snapshot, id).groupId === groupId)
        && !sameGeometry(undone, snapshot, fixtureIds),
    );
    const uniformResize = assertUniformResize(undone, resized, fixtureIds, groupId);
    const uniformResizeTransformedAllMembers = true;
    await waitForNeutralDrawPreviewTransform(
      page,
      drawElement.id,
      "group corner resize left an imperative draw transform behind",
    );
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupResizeHandle(page, true);
    const resizedScreenshot = join(SCRATCH, "studio-group-desktop-resized.png");
    await stage.screenshot({ path: resizedScreenshot, animations: "disabled" });
    screenshots.push(resizedScreenshot);

    invariant(!await undo.isDisabled(), "Undo is disabled after a group corner resize");
    await undo.click();
    const resizeUndone = await waitForSnapshot(
      page,
      "one Undo did not restore all group resize geometry",
      (snapshot) =>
        fixtureIds.every((id) => byId(snapshot, id).groupId === groupId)
        && sameGeometry(undone, snapshot, fixtureIds),
    );
    const resizeUndoRestoredAllMembers =
      sameGeometry(undone, resizeUndone, fixtureIds);
    await waitForNeutralDrawPreviewTransform(
      page,
      drawElement.id,
      "group resize Undo restored the model but not the draw node transform",
    );
    const drawPreviewTransformNeutral = true;
    await waitForGroupResizeHandle(page, true);

    // Complete-group lock blocks the identical drag; unlock restores atomic movement.
    imageBounds = await findFixtureColorBounds(page, stage);
    await waitForWholeGroupSelection(page, 3);
    await page.getByRole("button", { name: "선택 잠금", exact: true }).click();
    const locked = await waitForSnapshot(
      page,
      "group lock was not persisted",
      (snapshot) => snapshot.groups.some((group) => group.id === groupId && group.locked),
    );
    const hiddenResizeHandle = await waitForGroupResizeHandle(page, false);
    const lockedGroupResizeHandleHidden =
      !hiddenResizeHandle.transformerVisible
      && hiddenResizeHandle.attachedNodeCount === 0
      && hiddenResizeHandle.point === null;
    invariant(
      lockedGroupResizeHandleHidden,
      `a locked group still exposes a resize handle: ${JSON.stringify(hiddenResizeHandle)}`,
    );
    const lockedScreenshot = join(SCRATCH, "studio-group-desktop-locked.png");
    await stage.screenshot({ path: lockedScreenshot, animations: "disabled" });
    screenshots.push(lockedScreenshot);
    const groupLockButton = groupLayerRow.locator('button[aria-pressed="true"]');
    await groupLockButton.waitFor({ state: "visible" });
    invariant(
      (await groupLockButton.getAttribute("aria-label"))?.endsWith("그룹 잠금 해제") === true,
      "the locked Layer Navigator group does not expose an accessible unlock action",
    );
    await dragFromTo(
      page,
      imageBounds.center,
      { x: imageBounds.center.x + 46, y: imageBounds.center.y + 28 },
    );
    await page.waitForTimeout(500);
    const afterLockedDrag = await readLatestSnapshot(page);
    invariant(afterLockedDrag, "autosave disappeared after locked drag");
    const lockedDragUnchanged = samePositions(locked, afterLockedDrag, fixtureIds);
    invariant(lockedDragUnchanged, "a locked group moved from a canvas drag");

    await page.getByRole("button", { name: "선택 잠금 해제", exact: true }).click();
    const unlocked = await waitForSnapshot(
      page,
      "group unlock was not persisted",
      (snapshot) => snapshot.groups.some((group) => group.id === groupId && !group.locked),
    );
    const groupUnlockButton = groupLayerRow.locator('button[aria-pressed="false"]');
    await groupUnlockButton.waitFor({ state: "visible" });
    invariant(
      (await groupUnlockButton.getAttribute("aria-label"))?.endsWith("그룹 잠금") === true,
      "the unlocked Layer Navigator group does not expose an accessible lock action",
    );
    const layerNavigatorGroupLockAccessible = true;
    await waitForGroupResizeHandle(page, true);
    imageBounds = await findFixtureColorBounds(page, stage);
    await dragFromTo(
      page,
      imageBounds.center,
      { x: imageBounds.center.x + 44, y: imageBounds.center.y - 30 },
    );
    const movedAfterUnlock = await waitForSnapshot(
      page,
      "unlocked group did not move",
      (snapshot) =>
        fixtureIds.every((id) => byId(snapshot, id).groupId === groupId)
        && !samePositions(unlocked, snapshot, fixtureIds),
    );
    const unlockedDragDelta =
      assertAtomicTranslation(unlocked, movedAfterUnlock, fixtureIds, groupId);
    await (await visible(page.getByRole("button", { name: "실행취소", exact: true }))).click();
    await waitForSnapshot(
      page,
      "Undo did not restore the unlocked group drag",
      (snapshot) => samePositions(unlocked, snapshot, fixtureIds),
    );

    // Double-click enters the group; Escape returns to the complete group selection.
    imageBounds = await findFixtureColorBounds(page, stage);
    await page.mouse.dblclick(imageBounds.center.x, imageBounds.center.y, { delay: 70 });
    await waitForGroupLayerState(page, "partial");
    const doubleClickEnteredGroup =
      await groupLayerState(page) === "partial"
      && !await page.locator('[data-studio-canvas-status-rail]')
        .getByText("3개 선택", { exact: true })
        .isVisible()
        .catch(() => false);
    invariant(doubleClickEnteredGroup, "double-click did not enter the selected group");
    await page.keyboard.press("Escape");
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "all");
    const escapeRestoredWholeGroup = true;

    const enteredScreenshot = join(SCRATCH, "studio-group-desktop-enter-exit.png");
    await stage.screenshot({ path: enteredScreenshot, animations: "disabled" });
    screenshots.push(enteredScreenshot);

    // A marquee touching only the distant draw member must expand to the whole group.
    await page.keyboard.press("Escape");
    await waitForGroupLayerState(page, "none");
    const marqueeDrawScreenPoints =
      await konvaDocumentPointsToScreen(page, drawDocumentPoints);
    invariant(
      marqueeDrawScreenPoints.length === drawDocumentPoints.length,
      "could not project the draw fixture for marquee selection",
    );
    const marqueeStart = {
      x: Math.min(...marqueeDrawScreenPoints.map((point) => point.x)) - 18,
      y: Math.min(...marqueeDrawScreenPoints.map((point) => point.y)) - 18,
    };
    const marqueeEnd = {
      x: Math.max(...marqueeDrawScreenPoints.map((point) => point.x)) + 18,
      y: Math.max(...marqueeDrawScreenPoints.map((point) => point.y)) + 18,
    };
    await dragFromTo(page, marqueeStart, marqueeEnd, 10);
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "all");
    const marqueeSelectedWholeGroup = true;

    const marqueeScreenshot = join(SCRATCH, "studio-group-desktop-marquee.png");
    await stage.screenshot({ path: marqueeScreenshot, animations: "disabled" });
    screenshots.push(marqueeScreenshot);

    // Context-clicking one member must keep the same whole-group selection unit.
    await page.keyboard.press("Escape");
    await waitForGroupLayerState(page, "none");
    imageBounds = await findFixtureColorBounds(page, stage);
    await page.mouse.click(imageBounds.center.x, imageBounds.center.y, { button: "right" });
    await page.locator('[data-studio-canvas-context-menu="true"]').waitFor({
      state: "visible",
    });
    await waitForWholeGroupSelection(page, 3);
    await waitForGroupLayerState(page, "all");
    const rightClickSelectedWholeGroup = true;
    await page.mouse.click(8, 8);

    const finalSnapshot = await readLatestSnapshot(page);
    invariant(finalSnapshot, "final grouped autosave is missing");
    invariant(
      fixtureIds.every((id) => byId(finalSnapshot, id).groupId === groupId),
      "a browser selection scenario broke the persisted group relationship",
    );

    reportBrowserErrors(errors);
    const errorCount = errors.messages.length + errors.failedResponses.length;
    invariant(errorCount === 0, `desktop group audit recorded ${errorCount} browser errors`);
    const storageState = await context.storageState();
    return {
      evidence: {
        fixtureIds,
        fixtureTypes,
        groupId,
        groupName,
        firstDragDelta,
        unlockedDragDelta,
        uniformResizeScale: uniformResize.scale,
        uniformResizeOffset: uniformResize.offset,
        uniformResizeTransformedAllMembers,
        resizeUndoRestoredAllMembers,
        lockedGroupResizeHandleHidden,
        drawPreviewTransformNeutral,
        escapeCancelledDragPreviewRestored,
        escapeCancelledDragPersistedUnchanged,
        escapeCancelledDragUndoStackUnchanged,
        lockedDragUnchanged,
        undoRestoredAllMembers,
        canvasClickSelectedWholeGroup,
        shiftClickRemovedWholeGroup,
        shiftClickRestoredWholeGroup,
        layerNavigatorRowSelectedWholeGroup,
        layerNavigatorGroupLockAccessible,
        doubleClickEnteredGroup,
        escapeRestoredWholeGroup,
        marqueeSelectedWholeGroup,
        rightClickSelectedWholeGroup,
        screenshots,
        errorCount,
      },
      storageState,
    };
  } finally {
    await context.close();
  }
}

async function runMobileGroupAudit(
  browser: Browser,
  studioUrl: string,
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>,
): Promise<MobileEvidence> {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({
    storageState,
    viewport,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page, "mobile-groups", studioUrl);
  const screenshot = join(SCRATCH, "studio-group-mobile-double-tap.png");

  try {
    await prepareSeededMobilePage(page, studioUrl);
    await page.keyboard.press("v");
    const stage = page.locator(".konvajs-content").first();
    let imageBounds = await findFixtureColorBounds(page, stage, 9_000);

    // Keep the first tap outside Konva's double-tap window, then perform the real two-tap enter.
    await page.touchscreen.tap(imageBounds.center.x, imageBounds.center.y);
    await waitForWholeGroupSelection(page, 3);
    const tapSelectedWholeGroup = true;
    const mobileResizeHandle = await waitForGroupResizeHandle(page, true);
    invariant(
      mobileResizeHandle.point
        && mobileResizeHandle.point.x >= 0
        && mobileResizeHandle.point.x <= viewport.width
        && mobileResizeHandle.point.y >= 0
        && mobileResizeHandle.point.y <= viewport.height,
      `the coarse-pointer group resize corner is clipped: ${JSON.stringify(mobileResizeHandle)}`,
    );
    const groupResizeHandleVisible = true;
    await page.waitForTimeout(520);
    imageBounds = await findFixtureColorBounds(page, stage);
    await page.touchscreen.tap(imageBounds.center.x, imageBounds.center.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(imageBounds.center.x, imageBounds.center.y);

    await page.locator('[data-studio-canvas-status-rail]')
      .getByText("3개 선택", { exact: true })
      .waitFor({ state: "hidden" });
    const doubleTapEnteredGroup = true;
    await page.keyboard.press("Escape");
    await waitForWholeGroupSelection(page, 3);
    const escapeRestoredWholeGroup = true;
    await waitForGroupResizeHandle(page, true);
    const escapeRestoredResizeHandle = true;

    await page.screenshot({ path: screenshot, animations: "disabled" });
    reportBrowserErrors(errors);
    const errorCount = errors.messages.length + errors.failedResponses.length;
    invariant(errorCount === 0, `mobile group audit recorded ${errorCount} browser errors`);
    return {
      viewport,
      tapSelectedWholeGroup,
      groupResizeHandleVisible,
      doubleTapEnteredGroup,
      escapeRestoredWholeGroup,
      escapeRestoredResizeHandle,
      screenshot,
      errorCount,
    };
  } finally {
    await context.close();
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a preview port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok || response.status < 500) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite preview did not become ready");
}

function cleanScratch(): void {
  mkdirSync(SCRATCH, { recursive: true });
  for (const file of readdirSync(SCRATCH)) {
    if (!file.startsWith("studio-group-")) continue;
    if (
      !file.endsWith(".png")
      && !file.endsWith(".log")
      && !file.endsWith(".json")
    ) {
      continue;
    }
    try {
      unlinkSync(join(SCRATCH, file));
    } catch {
      // A previous artifact may be open; the current run still overwrites stable names.
    }
  }
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  const waitForExit = (timeoutMs: number) => Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await waitForExit(1_500);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForExit(1_500);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function main(): Promise<void> {
  cleanScratch();
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/, "")}/`
    : `http://127.0.0.1:${port}/`;
  const studioUrl = `${origin}studio`;
  const server: ChildProcess | null = externalOrigin
    ? null
    : spawn(
        process.execPath,
        [
          join(process.cwd(), "node_modules", "vite", "bin", "vite.js"),
          "preview",
          "--port",
          String(port),
          "--strictPort",
          "--host",
          "127.0.0.1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
  server?.stdout?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  server?.stderr?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));

  let browser: Browser | null = null;
  try {
    await waitForServer(origin);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const desktop = await runDesktopGroupAudit(browser, studioUrl);
    const mobile = await runMobileGroupAudit(browser, studioUrl, desktop.storageState);
    const result = {
      scratch: SCRATCH,
      desktop: desktop.evidence,
      mobile,
    };
    writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    log("ALL DESKTOP AND MOBILE GROUP BROWSER GATES OK");
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    browser = null;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await stopChildProcess(server).catch(() => undefined);
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    log(`FATAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  },
);
