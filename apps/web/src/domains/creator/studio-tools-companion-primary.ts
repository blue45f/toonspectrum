/**
 * Studio multi-display companion — primary-side runtime extracted from studio-tools-companion.ts.
 *
 * Window opening/reuse, BroadcastChannel factory, message parsing, and the primary runtime
 * that owns companion binding state. Protocol types, message builders, and guards stay in
 * studio-tools-companion.ts; this module consumes them through its public surface.
 */

import type { StudioCompanionOpenMode } from "./studio-companion-browser-workspace";
import { studioCompanionPopupGuidance } from "./studio-companion-popup-guidance";
import {
  STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS,
  isStudioCompanionReferenceControl,
  isStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceProjection,
  planStudioCompanionReferenceCapture,
  type StudioCompanionReferenceCaptureCursor,
  type StudioCompanionReferenceCaptureFailure,
  type StudioCompanionReferenceCaptureRecord,
  type StudioCompanionReferenceControl,
  type StudioCompanionReferencePoint,
  type StudioCompanionReferencePreviewFrame,
  type StudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";
import {
  captureStudioCompanionNavigatorFrame,
  createStudioCompanionReviewProjectionFromSource,
  isStudioCompanionNavigatorFrame,
  isStudioCompanionReviewProjection,
  planStudioCompanionNavigatorCapture,
  type StudioCompanionNavigatorFrame,
  type StudioCompanionReviewControl,
  type StudioCompanionReviewProjection,
  type StudioCompanionReviewProjectionSourceInput,
} from "./studio-companion-review-projection";
import { studioCanvasPathname } from "./studio-workspace-route";
import {
  STUDIO_COMPANION_MAX_MESSAGE_AGE_MS,
  STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS,
  STUDIO_COMPANION_SESSION_QUERY,
  STUDIO_COMPANION_SURFACES,
  STUDIO_COMPANION_SURFACE_IDS,
  STUDIO_COMPANION_VIEW_QUERY,
  STUDIO_COMPANION_WINDOW_FEATURES_BY_SURFACE,
  STUDIO_TOOLS_COMPANION_CHANNEL,
  STUDIO_TOOLS_COMPANION_WINDOW_NAME,
  StudioCompanionCommandGuard,
  canAcceptStudioCompanionReferencePick,
  commitStudioCompanionReferencePick,
  createStudioCompanionSessionId,
  isStudioCompanionCommandAllowed,
  isStudioCompanionControlAllowed,
  isStudioCompanionMessage,
  isStudioCompanionMessageFresh,
  isStudioCompanionReferenceColorResult,
  isStudioCompanionSessionId,
  parseStudioCompanionSurface,
  requireStudioCompanionSessionId,
  studioCompanionPrimaryScope,
  studioCompanionSurfaceForHello,
} from "./studio-tools-companion";
import type {
  StudioCompanionBindingSlot,
  StudioCompanionBindingSnapshot,
  StudioCompanionCommandMessage,
  StudioCompanionCommandName,
  StudioCompanionControlMessage,
  StudioCompanionDensity,
  StudioCompanionGoodbyeMessage,
  StudioCompanionHelloInput,
  StudioCompanionI18n,
  StudioCompanionMessage,
  StudioCompanionReferenceColorResult,
  StudioCompanionReferenceColorResultMessage,
  StudioCompanionReferencePreviewFrameMessage,
  StudioCompanionReferenceStateMessage,
  StudioCompanionSurface,
  StudioCompanionToolId,
} from "./studio-tools-companion";

export const STUDIO_TOOLS_COMPANION_PATH = "/studio/tools-companion";

export function studioCompanionDefaultWindowFeatures(surface: StudioCompanionSurface): string {
  return STUDIO_COMPANION_WINDOW_FEATURES_BY_SURFACE[surface];
}

function localizeCompanionText(
  t: StudioCompanionI18n | undefined,
  fallback: string,
  key: string,
): string {
  if (!t) return fallback;
  const value = t(key, fallback);
  return value === key ? fallback : value;
}
const STUDIO_COMPANION_CAPTURE_MAX_FAILURES_PER_REVISION = 3;
const STUDIO_COMPANION_CAPTURE_RETRY_BASE_MS = 500;
const STUDIO_COMPANION_REFERENCE_MAX_CAPTURE_FAILURES =
  STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS.length + 1;

export const createStudioCompanionInstanceId = createStudioCompanionSessionId;

export function parseStudioCompanionSessionId(search: string): string | null {
  try {
    const values = new URLSearchParams(search).getAll(STUDIO_COMPANION_SESSION_QUERY);
    if (values.length !== 1) return null;
    return isStudioCompanionSessionId(values[0]) ? values[0] : null;
  } catch {
    return null;
  }
}

export function studioCompanionChannelName(sessionId: string): string {
  return `${STUDIO_TOOLS_COMPANION_CHANNEL}.${requireStudioCompanionSessionId(sessionId)}`;
}

export function studioCompanionWindowName(
  sessionId: string,
  surface: StudioCompanionSurface = "workspace"
): string {
  const suffix = surface === "workspace" ? "" : `-${surface}`;
  return `${STUDIO_TOOLS_COMPANION_WINDOW_NAME}-${requireStudioCompanionSessionId(sessionId)}${suffix}`;
}

function studioCompanionScopedParams(
  sessionId: string,
  primarySearch: string,
  routeWorkId?: string | null,
): URLSearchParams {
  const params = new URLSearchParams({
    [STUDIO_COMPANION_SESSION_QUERY]: requireStudioCompanionSessionId(sessionId),
  });
  const scope = studioCompanionPrimaryScope(primarySearch, routeWorkId);
  if (!scope) throw new TypeError("Invalid Studio tools companion document scope");
  if (scope.id) params.set("id", scope.id);
  if (scope.remix) params.set("remix", scope.remix);
  return params;
}

export function buildStudioCompanionHello(
  input: StudioCompanionHelloInput,
  now = Date.now()
): Extract<StudioCompanionMessage, { type: "hello" }> {
  return input.role === "primary"
    ? {
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: input.primaryInstanceId,
        targetCompanionInstanceId: input.targetCompanionInstanceId,
        at: now,
      }
    : input.surface && input.surface !== "workspace"
      ? {
          v: 1,
          type: "hello",
          role: "companion",
          companionInstanceId: input.companionInstanceId,
          targetPrimaryInstanceId: input.targetPrimaryInstanceId,
          view: input.surface,
          at: now,
        }
      : {
          v: 1,
          type: "hello",
          role: "companion",
          companionInstanceId: input.companionInstanceId,
          targetPrimaryInstanceId: input.targetPrimaryInstanceId,
          at: now,
        };
}

export function buildStudioCompanionPrimaryState(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  tool: StudioCompanionToolId;
  density: StudioCompanionDensity;
  canvasOnly: boolean;
  title: string;
  now?: number;
}): StudioCompanionMessage {
  return {
    v: 1,
    type: "primary-state",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    tool: input.tool,
    density: input.density,
    canvasOnly: input.canvasOnly,
    title: input.title.replace(/[\0\r\n]+/gu, " ").slice(0, 120),
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionReviewState(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  generation: number;
  projection: StudioCompanionReviewProjection;
  now?: number;
}): Extract<StudioCompanionMessage, { type: "primary-review-state" }> {
  return {
    v: 1,
    type: "primary-review-state",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.generation,
    projection: input.projection,
    at: input.now ?? Date.now(),
  };
}

const STUDIO_COMPANION_NAVIGATOR_GENERIC_TITLE = "스튜디오";

/**
 * A dedicated Navigator needs only capture fencing and a normalized viewport. Keep every
 * document-identifying or review-oriented field on non-sensitive validator-compatible constants.
 */
function createStudioCompanionNavigatorProjection(
  projection: StudioCompanionReviewProjection
): StudioCompanionReviewProjection {
  return {
    revision: projection.revision,
    documentRevision: projection.documentRevision,
    pageLabel: "캔버스",
    selectionLabel: null,
    canUndo: false,
    canRedo: false,
    captureAllowed: projection.captureAllowed,
    viewport: { ...projection.viewport },
    layers: [],
    history: [],
    comments: [],
    brush: {
      id: "navigator",
      label: "Navigator",
      size: 1,
      opacity: 1,
      color: "#000000",
      choices: [{ id: "navigator", label: "Navigator" }],
    },
    truncated: { layers: 0, history: 0, comments: 0 },
  };
}

export function buildStudioCompanionNavigatorFrame(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  frame: StudioCompanionNavigatorFrame;
  now?: number;
}): Extract<StudioCompanionMessage, { type: "navigator-frame" }> {
  return {
    v: 1,
    type: "navigator-frame",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.frame.generation,
    revision: input.frame.revision,
    sequence: input.frame.sequence,
    width: input.frame.width,
    height: input.frame.height,
    blob: input.frame.blob,
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionReferenceState(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  generation: number;
  projection: StudioCompanionReferenceProjection;
  now?: number;
}): StudioCompanionReferenceStateMessage {
  return {
    v: 1,
    type: "primary-reference-state",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.generation,
    projection: input.projection,
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionReferencePreviewFrame(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  frame: StudioCompanionReferencePreviewFrame;
  now?: number;
}): StudioCompanionReferencePreviewFrameMessage {
  return {
    v: 1,
    type: "reference-preview-frame",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.frame.generation,
    revision: input.frame.revision,
    referenceRevision: input.frame.referenceRevision,
    sequence: input.frame.sequence,
    width: input.frame.width,
    height: input.frame.height,
    blob: input.frame.blob,
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionReferenceColorResult(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  result: StudioCompanionReferenceColorResult;
  now?: number;
}): StudioCompanionReferenceColorResultMessage {
  return {
    v: 1,
    type: "reference-color-result",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.result.generation,
    revision: input.result.revision,
    referenceRevision: input.result.referenceRevision,
    sequence: input.result.sequence,
    color: input.result.color,
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionPong(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  nonce: string;
}, now = Date.now()): Extract<StudioCompanionMessage, { type: "pong" }> {
  return { v: 1, type: "pong", ...input, at: now };
}

export function buildStudioCompanionPrimaryGoodbye(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  surface: StudioCompanionSurface;
}, now = Date.now()): Extract<StudioCompanionMessage, { type: "primary-goodbye" }> {
  return { v: 1, type: "primary-goodbye", ...input, at: now };
}

export class StudioCompanionPrimaryBinding {
  private readonly slotsBySurface = new Map<StudioCompanionSurface, StudioCompanionBindingSlot>();
  private readonly surfaceByInstanceId = new Map<string, StudioCompanionSurface>();
  private readonly generationBySurface = new Map<StudioCompanionSurface, number>();

  acceptHello(message: StudioCompanionMessage, primaryInstanceId: string, now = Date.now()): boolean {
    if (message.type !== "hello" || message.role !== "companion") return false;
    if (!isStudioCompanionMessageFresh(message, now)) return false;
    if (
      message.targetPrimaryInstanceId !== null
      && message.targetPrimaryInstanceId !== primaryInstanceId
    ) return false;

    const surface = studioCompanionSurfaceForHello(message);
    const occupiedSurface = this.surfaceByInstanceId.get(message.companionInstanceId);
    if (occupiedSurface && occupiedSurface !== surface) return false;

    const current = this.slotsBySurface.get(surface);
    if (current?.companionInstanceId === message.companionInstanceId) {
      current.lastActivityAt = now;
      return true;
    }
    if (
      current
      && now - current.lastActivityAt < STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS
    ) return false;

    if (current) {
      current.commandGuard.reset();
      this.surfaceByInstanceId.delete(current.companionInstanceId);
    }
    const generation = (this.generationBySurface.get(surface) ?? 0) + 1;
    this.generationBySurface.set(surface, generation);
    const commandGuard = new StudioCompanionCommandGuard();
    commandGuard.bindCompanion(message.companionInstanceId);
    this.slotsBySurface.set(surface, {
      surface,
      companionInstanceId: message.companionInstanceId,
      generation,
      lastActivityAt: now,
      commandGuard,
      referencePickRevision: 0,
      referencePickSequence: 0,
    });
    this.surfaceByInstanceId.set(message.companionInstanceId, surface);
    return true;
  }

  acceptPing(message: StudioCompanionMessage, primaryInstanceId: string, now = Date.now()): boolean {
    if (message.type !== "ping" || !isStudioCompanionMessageFresh(message, now)) return false;
    const slot = this.slotForInstance(message.companionInstanceId);
    const accepted = Boolean(
      slot
      && message.targetPrimaryInstanceId === primaryInstanceId
    );
    if (accepted && slot) slot.lastActivityAt = now;
    return accepted;
  }

  acceptGoodbye(
    message: StudioCompanionMessage,
    primaryInstanceId: string,
    now = Date.now()
  ): message is StudioCompanionGoodbyeMessage {
    if (message.type !== "companion-goodbye") return false;
    if (!isStudioCompanionMessageFresh(message, now)) return false;
    if (message.targetPrimaryInstanceId !== primaryInstanceId) return false;
    const slot = this.slotsBySurface.get(message.surface);
    if (!slot || slot.companionInstanceId !== message.companionInstanceId) return false;
    if (this.surfaceByInstanceId.get(message.companionInstanceId) !== message.surface) return false;
    this.release(message.surface);
    return true;
  }

  acceptCommand(
    message: StudioCompanionMessage,
    primaryInstanceId: string,
    now = Date.now()
  ): message is StudioCompanionCommandMessage {
    if (message.type !== "companion-command") return false;
    const slot = this.slotForInstance(message.companionInstanceId);
    if (!slot || !isStudioCompanionCommandAllowed(slot.surface, message.command)) return false;
    const accepted = slot.commandGuard.accept(message, {
      primaryInstanceId,
      companionInstanceId: slot.companionInstanceId,
      now,
    });
    if (accepted) slot.lastActivityAt = now;
    return accepted;
  }

  acceptControl(
    message: StudioCompanionMessage,
    primaryInstanceId: string,
    now = Date.now()
  ): message is StudioCompanionControlMessage {
    if (message.type !== "companion-control") return false;
    const slot = this.slotForInstance(message.companionInstanceId);
    if (
      !slot
      || message.generation !== slot.generation
      || !isStudioCompanionControlAllowed(slot.surface, message.control)
      || !canAcceptStudioCompanionReferencePick(slot, message.control)
    ) return false;
    const accepted = slot.commandGuard.accept(message, {
      primaryInstanceId,
      companionInstanceId: slot.companionInstanceId,
      now,
    });
    if (accepted) {
      commitStudioCompanionReferencePick(slot, message.control);
      slot.lastActivityAt = now;
    }
    return accepted;
  }

  companionInstanceId(surface: StudioCompanionSurface = "workspace"): string | null {
    return this.slotsBySurface.get(surface)?.companionInstanceId ?? null;
  }

  generation(surface: StudioCompanionSurface = "workspace"): number {
    return this.slotsBySurface.get(surface)?.generation ?? 0;
  }

  surfaceForInstance(companionInstanceId: string): StudioCompanionSurface | null {
    return this.surfaceByInstanceId.get(companionInstanceId) ?? null;
  }

  bindingForSurface(surface: StudioCompanionSurface): StudioCompanionBindingSnapshot | null {
    const slot = this.slotsBySurface.get(surface);
    return slot ? this.snapshotSlot(slot) : null;
  }

  activeBindings(): readonly StudioCompanionBindingSnapshot[] {
    return STUDIO_COMPANION_SURFACES.flatMap((surface) => {
      const slot = this.slotsBySurface.get(surface);
      return slot ? [this.snapshotSlot(slot)] : [];
    });
  }

  nextExpiryAt(): number | null {
    let next: number | null = null;
    for (const slot of this.slotsBySurface.values()) {
      const expiry = slot.lastActivityAt + STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS;
      if (next === null || expiry < next) next = expiry;
    }
    return next;
  }

  expireStale(now = Date.now()): readonly StudioCompanionBindingSnapshot[] {
    const expired: StudioCompanionBindingSnapshot[] = [];
    for (const surface of STUDIO_COMPANION_SURFACES) {
      const slot = this.slotsBySurface.get(surface);
      if (
        !slot
        || now - slot.lastActivityAt < STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS
      ) continue;
      expired.push(this.snapshotSlot(slot));
      this.release(surface);
    }
    return expired;
  }

  /** Compatibility helper for earlier single-companion callers. */
  expireIfStale(now = Date.now()): boolean {
    return this.expireStale(now).length > 0;
  }

  release(surface: StudioCompanionSurface = "workspace"): void {
    const slot = this.slotsBySurface.get(surface);
    if (!slot) return;
    slot.commandGuard.reset();
    this.surfaceByInstanceId.delete(slot.companionInstanceId);
    this.slotsBySurface.delete(surface);
  }

  releaseAll(): void {
    for (const surface of STUDIO_COMPANION_SURFACES) this.release(surface);
  }

  private slotForInstance(companionInstanceId: string): StudioCompanionBindingSlot | null {
    const surface = this.surfaceByInstanceId.get(companionInstanceId);
    return surface ? this.slotsBySurface.get(surface) ?? null : null;
  }

  private snapshotSlot(slot: StudioCompanionBindingSlot): StudioCompanionBindingSnapshot {
    return {
      surface: slot.surface,
      companionInstanceId: slot.companionInstanceId,
      generation: slot.generation,
      lastActivityAt: slot.lastActivityAt,
    };
  }
}

export function studioCompanionUrl(
  sessionId: string,
  origin: string = typeof location !== "undefined" ? location.origin : "",
  primarySearch: string = typeof location !== "undefined" ? location.search : "",
  surface: StudioCompanionSurface = "workspace",
  routeWorkId?: string | null,
): string {
  const base = studioCompanionOriginBase(origin);
  const params = studioCompanionScopedParams(sessionId, primarySearch, routeWorkId);
  if (surface !== "workspace") params.set(STUDIO_COMPANION_VIEW_QUERY, surface);
  return `${base}${STUDIO_TOOLS_COMPANION_PATH}?${params.toString()}`;
}

export function studioCompanionPrimaryUrl(
  sessionId: string,
  origin: string = typeof location !== "undefined" ? location.origin : "",
  companionSearch: string = typeof location !== "undefined" ? location.search : ""
): string {
  const base = studioCompanionOriginBase(origin);
  const scope = studioCompanionPrimaryScope(companionSearch);
  if (!scope) return `${base}/studio`;
  const params = new URLSearchParams({
    [STUDIO_COMPANION_SESSION_QUERY]: requireStudioCompanionSessionId(sessionId),
  });
  if (scope.remix) params.set("remix", scope.remix);
  return `${base}${studioCanvasPathname(scope.id ?? null)}?${params.toString()}`;
}

function studioCompanionOriginBase(origin: string): string {
  if (!origin) return "";
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function studioCompanionRouteSurface(url: URL): StudioCompanionSurface | null {
  const querySurface = parseStudioCompanionSurface(url.search);
  if (querySurface === null) return null;

  const segments = url.pathname.split("/");
  if (segments.at(-1) === "") segments.pop();
  if (
    segments.length === 3
    && segments[0] === ""
    && segments[1] === "studio"
    && segments[2] === "tools-companion"
  ) {
    return querySurface;
  }
  if (
    segments.length !== 4
    || segments[0] !== ""
    || segments[1] !== "studio"
    || segments[2] !== "companion"
    || !STUDIO_COMPANION_SURFACE_IDS.has(segments[3])
  ) {
    return null;
  }

  const pathSurface = segments[3] as StudioCompanionSurface;
  const queryViews = url.searchParams.getAll(STUDIO_COMPANION_VIEW_QUERY);
  return queryViews.length === 0 || querySurface === pathSurface
    ? pathSurface
    : null;
}

function isMatchingStudioToolsCompanionWindow(
  candidate: Window,
  expectedUrl: string,
  sessionId: string
): boolean {
  try {
    // WindowProxy.location can throw after the user navigates the popup cross-origin.
    // Treat that handle as recoverable through the session-specific named window instead
    // of focusing a page that is no longer the tools companion.
    const currentUrl = new URL(candidate.location.href);
    const expected = new URL(expectedUrl, currentUrl.origin);
    const currentScope = studioCompanionPrimaryScope(currentUrl.search);
    const expectedScope = studioCompanionPrimaryScope(expected.search);
    const currentSurface = studioCompanionRouteSurface(currentUrl);
    const expectedSurface = studioCompanionRouteSurface(expected);
    return currentUrl.origin === expected.origin
      && parseStudioCompanionSessionId(currentUrl.search) === sessionId
      && currentScope !== null
      && expectedScope !== null
      && currentSurface !== null
      && currentSurface === expectedSurface
      && currentScope.id === expectedScope.id
      && currentScope.remix === expectedScope.remix;
  } catch {
    return false;
  }
}

export function isStudioToolsCompanionWindowReusable(
  sessionId: string,
  candidate: Window | null,
  surface: StudioCompanionSurface = "workspace",
  routeWorkId?: string | null,
): candidate is Window {
  if (!candidate || !isStudioCompanionSessionId(sessionId)) return false;
  try {
    return !candidate.closed
      && isMatchingStudioToolsCompanionWindow(
        candidate,
        studioCompanionUrl(sessionId, undefined, undefined, surface, routeWorkId),
        sessionId
      );
  } catch {
    return false;
  }
}

function severStudioCompanionOpener(candidate: Window): void {
  try {
    candidate.opener = null;
  } catch {
    // A recovered or already navigated popup can deny cross-origin property writes.
  }
}

/**
 * Open (or focus) the tools companion popup. Returns the window handle when available.
 * Reuses a live matching handle without navigating it again. A live handle that was
 * navigated elsewhere is recovered through the session-specific window name.
 * Blocked popups return null.
 */
export function openStudioCompanionSurfaceWindow(
  sessionId: string,
  surface: StudioCompanionSurface,
  existingWindow: Window | null = null,
  openWindow: (url: string, name: string, features: string) => Window | null = (url, name, features) =>
    typeof window !== "undefined" ? window.open(url, name, features) : null,
  routeWorkId?: string | null,
  openMode: StudioCompanionOpenMode = "window",
): Window | null {
  if (!isStudioCompanionSessionId(sessionId)) return null;
  let expectedUrl: string;
  try {
    expectedUrl = studioCompanionUrl(sessionId, undefined, undefined, surface, routeWorkId);
    if (openMode === "tab") expectedUrl += "&display=tab";
  } catch {
    return null;
  }
  if (isStudioToolsCompanionWindowReusable(sessionId, existingWindow, surface, routeWorkId)) {
    severStudioCompanionOpener(existingWindow);
    try {
      existingWindow.focus?.();
    } catch {
      // The existing tools window is still valid even when focus is denied.
    }
    return existingWindow;
  }
  try {
    const win = openWindow(
      expectedUrl,
      studioCompanionWindowName(sessionId, surface),
      openMode === "tab" ? "" : studioCompanionDefaultWindowFeatures(surface)
    );
    if (!win) return null;
    severStudioCompanionOpener(win);
    try {
      win.focus?.();
    } catch {
      // A created popup remains usable even when the browser denies focus().
    }
    return win;
  } catch {
    return null;
  }
}

export function openStudioToolsCompanionWindow(
  sessionId: string,
  existingWindow: Window | null = null,
  openWindow?: (url: string, name: string, features: string) => Window | null,
  routeWorkId?: string | null,
): Window | null {
  return openStudioCompanionSurfaceWindow(
    sessionId,
    "workspace",
    existingWindow,
    openWindow,
    routeWorkId,
  );
}

type StudioCompanionWindowRef = { current: Window | null };
type StudioCompanionAnnounce = (message: string) => void;

/** Keeps reuse/recovery policy in the lazy protocol chunk once the runtime is ready. */
export function openReadyStudioToolsCompanionForMenu(input: {
  sessionId: string;
  surface?: StudioCompanionSurface;
  windowRef: StudioCompanionWindowRef;
  binding: StudioCompanionPrimaryBinding;
  announce: StudioCompanionAnnounce;
  workId?: string | null;
  t?: StudioCompanionI18n;
}): void {
  const surface = input.surface ?? "workspace";
  const cachedWindow = input.windowRef.current;
  const reusedExistingWindow = isStudioToolsCompanionWindowReusable(
    input.sessionId,
    cachedWindow,
    surface,
    input.workId,
  );
  if (!reusedExistingWindow) {
    input.binding.release(surface);
    input.windowRef.current = null;
  }
  const companionWindow = openStudioCompanionSurfaceWindow(
    input.sessionId,
    surface,
    reusedExistingWindow ? cachedWindow : null,
    undefined,
    input.workId,
  );
  if (!companionWindow) {
    // 인앱 브라우저에는 팝업 허용 설정이 없다 — 환경에 맞는 실행 가능한 안내로 바꾼다.
    const guidance = studioCompanionPopupGuidance();
    input.announce(localizeCompanionText(input.t, guidance.text, guidance.key));
    return;
  }
  input.windowRef.current = companionWindow;
  input.announce(
    reusedExistingWindow
      ? localizeCompanionText(
        input.t,
        "도구 창을 앞으로 가져오도록 요청했어요 · 보이지 않으면 작업 표시줄에서 선택하세요",
        "studio.toolsCompanion.open.focusForward",
      )
      : cachedWindow
        ? localizeCompanionText(
          input.t,
          "도구 창을 복구해 다시 연결합니다 · 다른 모니터로 옮겨 쓰세요",
          "studio.toolsCompanion.open.restoreAndConnect",
        )
        : localizeCompanionText(
          input.t,
          "도구 창을 열었습니다 · 다른 모니터로 옮겨 쓰세요",
          "studio.toolsCompanion.open.openedOnReservation",
        )
  );
}

/** Completes a synchronously reserved popup after the lazy protocol/runtime has loaded. */
export function completeReservedStudioToolsCompanionWindow(input: {
  sessionId: string;
  surface?: StudioCompanionSurface;
  reservation: Window;
  windowRef: StudioCompanionWindowRef;
  announce: StudioCompanionAnnounce;
  workId?: string | null;
  t?: StudioCompanionI18n;
}): void {
  if (input.windowRef.current !== input.reservation) {
    try {
      input.reservation.close();
    } catch {
      // The user may have closed the reservation before the runtime finished loading.
    }
    return;
  }
  try {
    const surface = input.surface ?? "workspace";
    severStudioCompanionOpener(input.reservation);
    input.reservation.name = studioCompanionWindowName(input.sessionId, surface);
    input.reservation.location.replace(studioCompanionUrl(
      input.sessionId,
      undefined,
      undefined,
      surface,
      input.workId,
    ));
  } catch {
    input.windowRef.current = null;
    try {
      input.reservation.close();
    } catch {
      // Ignore a reservation already closed by the browser.
    }
    input.announce(localizeCompanionText(
      input.t,
      "도구 창을 열지 못했습니다. 다시 시도해 주세요.",
      "studio.toolsCompanion.open.openFailed"
    ));
    return;
  }
  try {
    input.reservation.focus();
  } catch {
    // A valid popup remains usable when focus() is denied.
  }
  input.announce(localizeCompanionText(
    input.t,
    "도구 창을 열었습니다 · 다른 모니터로 옮겨 쓰세요",
    "studio.toolsCompanion.open.openedOnReservation"
  ));
}

export type StudioCompanionChannel = {
  postMessage: (data: unknown) => void;
  close: () => void;
  onmessage: ((ev: MessageEvent) => void) | null;
};

export type StudioCompanionChannelFactory = (sessionId: string) => StudioCompanionChannel | null;

export function createStudioCompanionChannel(
  sessionId: string,
  factory?: (name: string) => StudioCompanionChannel
): StudioCompanionChannel | null {
  if (!isStudioCompanionSessionId(sessionId)) return null;
  const create = factory ?? (
    typeof BroadcastChannel === "function"
      ? (name: string) => new BroadcastChannel(name) as unknown as StudioCompanionChannel
      : null
  );
  if (!create) return null;
  try {
    return create(studioCompanionChannelName(sessionId));
  } catch {
    return null;
  }
}

export function parseStudioCompanionMessage(data: unknown): StudioCompanionMessage | null {
  return isStudioCompanionMessage(data) ? data : null;
}

export type StudioCompanionPrimarySnapshot = {
  tool: StudioCompanionToolId;
  density: StudioCompanionDensity;
  canvasOnly: boolean;
  title: string;
};

export type StudioCompanionPrimaryRuntime = {
  sessionId: string;
  binding: StudioCompanionPrimaryBinding;
  publish: () => void;
  schedulePublish: () => void;
  generation: (surface?: StudioCompanionSurface) => number;
  dispose: () => void;
};

export type StudioCompanionNavigatorCaptureRequest = {
  generation: number;
  revision: number;
  sequence: number;
  signal: AbortSignal;
};

export type StudioCompanionReferenceCaptureRequest = StudioCompanionReferenceCaptureCursor & {
  sequence: number;
  signal: AbortSignal;
};

export type StudioCompanionReferenceRequester = Readonly<{
  companionInstanceId: string;
  generation: number;
}>;

export type StudioCompanionReferenceColorSampleRequest = Readonly<{
  requester: StudioCompanionReferenceRequester;
  current: StudioCompanionReferenceCaptureCursor;
  point: StudioCompanionReferencePoint;
  sequence: number;
  signal: AbortSignal;
}>;

export type StudioCompanionPrimarySourceRuntimeInput = Omit<
  Parameters<typeof startStudioCompanionPrimaryRuntime>[0],
  "getReviewProjection" | "captureNavigatorFrame"
> & {
  getReviewProjectionInput?: () => StudioCompanionReviewProjectionSourceInput;
  isNavigatorCaptureBlocked?: () => boolean;
  captureNavigatorCanvas?: (maximumLongestEdge: number) => HTMLCanvasElement | null;
};

type StudioCompanionReferenceCaptureState = {
  companionInstanceId: string;
  generation: number;
  epoch: number;
  inFlight: boolean;
  controller: AbortController | null;
  timer: ReturnType<typeof globalThis.setTimeout> | null;
  current: StudioCompanionReferenceCaptureCursor | null;
  lastCaptured: StudioCompanionReferenceCaptureRecord | null;
  failure: StudioCompanionReferenceCaptureFailure | null;
};

type StudioCompanionReferenceColorState = {
  epoch: number;
  controller: AbortController;
  current: StudioCompanionReferenceCaptureCursor;
};

/**
 * Adapts editor-owned source callbacks inside the optional companion chunk. The default Studio
 * route therefore pays only for narrow callbacks until a companion is actually requested.
 */
export function startStudioCompanionPrimaryRuntimeFromSources(
  input: StudioCompanionPrimarySourceRuntimeInput
): StudioCompanionPrimaryRuntime | null {
  const {
    getReviewProjectionInput,
    isNavigatorCaptureBlocked,
    captureNavigatorCanvas,
    ...runtimeInput
  } = input;
  return startStudioCompanionPrimaryRuntime({
    ...runtimeInput,
    ...(getReviewProjectionInput
      ? {
          getReviewProjection: () => createStudioCompanionReviewProjectionFromSource(
            getReviewProjectionInput()
          ),
        }
      : {}),
    ...(isNavigatorCaptureBlocked && captureNavigatorCanvas
      ? {
          captureNavigatorFrame: (request) => captureStudioCompanionNavigatorFrame({
            request,
            isCaptureBlocked: isNavigatorCaptureBlocked,
            captureCanvas: captureNavigatorCanvas,
          }),
        }
      : {}),
  });
}

/**
 * Starts the primary-side protocol only after the optional companion chunk has loaded.
 * Keeping handshake, targeting, lease, and replay checks here prevents the default Studio
 * route from paying for the multi-window transport before the user requests it.
 */
export function startStudioCompanionPrimaryRuntime(input: {
  search: string;
  getSnapshot: () => StudioCompanionPrimarySnapshot;
  getReviewProjection?: () => StudioCompanionReviewProjection;
  getReferenceProjection?: (
    generation: number
  ) => StudioCompanionReferenceProjection | null;
  captureNavigatorFrame?: (
    request: StudioCompanionNavigatorCaptureRequest
  ) => Promise<StudioCompanionNavigatorFrame | null>;
  captureReferenceFrame?: (
    request: StudioCompanionReferenceCaptureRequest
  ) => Promise<StudioCompanionReferencePreviewFrame | null>;
  sampleReferenceColor?: (
    request: StudioCompanionReferenceColorSampleRequest
  ) => Promise<string | null>;
  onCommand: (command: StudioCompanionCommandName) => void;
  onControl?: (control: StudioCompanionReviewControl) => void;
  onReferenceControl?: (control: StudioCompanionReferenceControl) => void;
  onReferenceDemandChange?: (active: boolean) => void;
  channelFactory?: StudioCompanionChannelFactory;
}): StudioCompanionPrimaryRuntime | null {
  const sessionId = parseStudioCompanionSessionId(input.search) ?? createStudioCompanionSessionId();
  const primaryInstanceId = createStudioCompanionInstanceId();
  if (!sessionId || !primaryInstanceId) return null;

  const binding = new StudioCompanionPrimaryBinding();
  const channel = input.channelFactory
    ? input.channelFactory(sessionId)
    : createStudioCompanionChannel(sessionId);
  if (!channel) return null;
  const referenceChannel: StudioCompanionChannel = channel;

  let disposed = false;
  let primaryGoodbyeSent = false;
  let captureEpoch = 0;
  let captureInFlight = false;
  let captureSequence = 0;
  let captureController: AbortController | null = null;
  let captureTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let publishTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let leaseTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let lastCapturedGeneration = 0;
  let lastCapturedRevision = -1;
  let lastCaptureAt = -STUDIO_COMPANION_MAX_MESSAGE_AGE_MS;
  let captureFailureOwnerKey = "";
  let captureFailureRevision = -1;
  let captureFailureCount = 0;
  let captureRetryNotBefore = 0;
  let captureOwner: StudioCompanionBindingSnapshot | null = null;
  const navigatorDemandByInstanceId = new Map<string, boolean>();
  const pendingDemandRefreshInstanceIds = new Set<string>();
  const referenceDemandInstanceIds = new Set<string>();
  const referenceCaptureStates = new Map<string, StudioCompanionReferenceCaptureState>();
  const referenceFrameSequenceByInstanceId = new Map<string, number>();
  const referenceColorStates = new Map<string, StudioCompanionReferenceColorState>();
  let referenceAsyncEpoch = 0;
  let referenceDemandAggregateActive = false;

  const clearCaptureTimer = () => {
    if (captureTimer === null) return;
    globalThis.clearTimeout(captureTimer);
    captureTimer = null;
  };

  const resetCaptureGeneration = () => {
    captureEpoch += 1;
    captureInFlight = false;
    captureController?.abort();
    captureController = null;
    clearCaptureTimer();
    lastCapturedGeneration = 0;
    lastCapturedRevision = -1;
    lastCaptureAt = Date.now() - 500;
    captureFailureOwnerKey = "";
    captureFailureRevision = -1;
    captureFailureCount = 0;
    captureRetryNotBefore = 0;
  };

  const referenceCursorFromProjection = (
    projection: StudioCompanionReferenceProjection
  ): StudioCompanionReferenceCaptureCursor => Object.freeze({
    generation: projection.generation,
    revision: projection.revision,
    referenceRevision: projection.referenceRevision,
  });

  const sameReferenceCursor = (
    left: StudioCompanionReferenceCaptureCursor | null,
    right: StudioCompanionReferenceCaptureCursor
  ): boolean => Boolean(
    left
    && left.generation === right.generation
    && left.revision === right.revision
    && left.referenceRevision === right.referenceRevision
  );

  const referenceRecordIsAhead = (
    record: StudioCompanionReferenceCaptureRecord,
    current: StudioCompanionReferenceCaptureCursor
  ): boolean => record.generation > current.generation
    || (
      record.generation === current.generation
      && (
        record.revision > current.revision
        || record.referenceRevision > current.referenceRevision
      )
    );

  const referencePeerForInstance = (
    companionInstanceId: string
  ): StudioCompanionBindingSnapshot | null => {
    const surface = binding.surfaceForInstance(companionInstanceId);
    if (surface !== "workspace" && surface !== "reference") return null;
    const peer = binding.bindingForSurface(surface);
    return peer?.companionInstanceId === companionInstanceId ? peer : null;
  };

  const readReferenceProjection = (
    peer: StudioCompanionBindingSnapshot
  ): StudioCompanionReferenceProjection | null => {
    if (!input.getReferenceProjection) return null;
    try {
      const candidate = input.getReferenceProjection(peer.generation);
      return candidate
        && isStudioCompanionReferenceProjection(candidate)
        && candidate.generation === peer.generation
        ? candidate
        : null;
    } catch {
      return null;
    }
  };

  const referenceCaptureIsBlocked = (): boolean => {
    if (!input.getReviewProjection) return false;
    try {
      const projection = input.getReviewProjection();
      return !isStudioCompanionReviewProjection(projection) || !projection.captureAllowed;
    } catch {
      return true;
    }
  };

  const releaseReferenceCaptureState = (companionInstanceId: string): void => {
    const state = referenceCaptureStates.get(companionInstanceId);
    if (!state) return;
    referenceCaptureStates.delete(companionInstanceId);
    state.epoch = ++referenceAsyncEpoch;
    if (state.timer !== null) globalThis.clearTimeout(state.timer);
    state.timer = null;
    state.controller?.abort();
    state.controller = null;
    state.inFlight = false;
  };

  const releaseReferenceColorState = (companionInstanceId: string): void => {
    const state = referenceColorStates.get(companionInstanceId);
    if (!state) return;
    referenceColorStates.delete(companionInstanceId);
    state.controller.abort();
  };

  const releaseReferenceTransport = (
    companionInstanceId: string,
    releaseSequence: boolean
  ): void => {
    referenceDemandInstanceIds.delete(companionInstanceId);
    const nextDemandActive = referenceDemandInstanceIds.size > 0;
    if (nextDemandActive !== referenceDemandAggregateActive) {
      referenceDemandAggregateActive = nextDemandActive;
      try {
        input.onReferenceDemandChange?.(nextDemandActive);
      } catch {
        // Resource-release observers cannot compromise transport cleanup.
      }
    }
    releaseReferenceCaptureState(companionInstanceId);
    releaseReferenceColorState(companionInstanceId);
    if (releaseSequence) referenceFrameSequenceByInstanceId.delete(companionInstanceId);
  };

  const releaseAllReferenceTransports = (): void => {
    const companionInstanceIds = new Set([
      ...referenceDemandInstanceIds,
      ...referenceCaptureStates.keys(),
      ...referenceColorStates.keys(),
      ...referenceFrameSequenceByInstanceId.keys(),
    ]);
    for (const companionInstanceId of companionInstanceIds) {
      releaseReferenceTransport(companionInstanceId, true);
    }
  };

  const ensureReferenceCaptureState = (
    peer: StudioCompanionBindingSnapshot
  ): StudioCompanionReferenceCaptureState => {
    const existing = referenceCaptureStates.get(peer.companionInstanceId);
    if (existing?.generation === peer.generation) return existing;
    releaseReferenceCaptureState(peer.companionInstanceId);
    const state: StudioCompanionReferenceCaptureState = {
      companionInstanceId: peer.companionInstanceId,
      generation: peer.generation,
      epoch: ++referenceAsyncEpoch,
      inFlight: false,
      controller: null,
      timer: null,
      current: null,
      lastCaptured: null,
      failure: null,
    };
    referenceCaptureStates.set(peer.companionInstanceId, state);
    return state;
  };

  const synchronizeReferenceCaptureCursor = (
    state: StudioCompanionReferenceCaptureState,
    current: StudioCompanionReferenceCaptureCursor
  ): void => {
    if (sameReferenceCursor(state.current, current)) return;
    state.epoch = ++referenceAsyncEpoch;
    releaseReferenceColorState(state.companionInstanceId);
    if (state.timer !== null) globalThis.clearTimeout(state.timer);
    state.timer = null;
    state.controller?.abort();
    state.controller = null;
    state.inFlight = false;
    state.current = current;
    state.failure = null;
    if (state.lastCaptured && referenceRecordIsAhead(state.lastCaptured, current)) {
      state.lastCaptured = null;
    }
  };

  function scheduleReferenceCapture(
    state: StudioCompanionReferenceCaptureState,
    delayMs: number
  ): void {
    if (state.timer !== null || disposed) return;
    const scheduledEpoch = state.epoch;
    state.timer = globalThis.setTimeout(() => {
      state.timer = null;
      if (
        disposed
        || state.epoch !== scheduledEpoch
        || referenceCaptureStates.get(state.companionInstanceId) !== state
        || !referenceDemandInstanceIds.has(state.companionInstanceId)
      ) return;
      const peer = referencePeerForInstance(state.companionInstanceId);
      if (!peer || peer.generation !== state.generation) {
        releaseReferenceTransport(state.companionInstanceId, true);
        return;
      }
      requestReferenceCapture(peer);
    }, Math.max(0, delayMs));
  }

  function requestReferenceCapture(
    peer: StudioCompanionBindingSnapshot,
    suppliedProjection?: StudioCompanionReferenceProjection
  ): void {
    if (
      disposed
      || !input.captureReferenceFrame
      || !referenceDemandInstanceIds.has(peer.companionInstanceId)
      || (peer.surface !== "workspace" && peer.surface !== "reference")
    ) return;
    const projection = suppliedProjection ?? readReferenceProjection(peer);
    if (!projection || projection.generation !== peer.generation) {
      releaseReferenceCaptureState(peer.companionInstanceId);
      return;
    }
    if (projection.itemCount === 0 || projection.resolvedItemCount === 0) {
      // Bootstrap, invalidated, empty and fully unresolved boards intentionally have no frame.
      // The coordinator publishes again when a source-backed revision becomes ready.
      releaseReferenceCaptureState(peer.companionInstanceId);
      return;
    }
    const current = referenceCursorFromProjection(projection);
    const state = ensureReferenceCaptureState(peer);
    synchronizeReferenceCaptureCursor(state, current);
    const failure = state.failure;
    if (
      failure
      && sameReferenceCursor(failure, current)
      && failure.count >= STUDIO_COMPANION_REFERENCE_MAX_CAPTURE_FAILURES
    ) return;

    const now = Date.now();
    const plan = planStudioCompanionReferenceCapture({
      demand: true,
      current,
      lastCaptured: state.lastCaptured,
      failure: state.failure,
      now,
      activeStroke: referenceCaptureIsBlocked(),
      inFlight: state.inFlight,
    });
    if (plan.kind === "defer") {
      scheduleReferenceCapture(state, plan.delayMs);
      return;
    }
    if (plan.kind !== "capture") return;

    if (state.timer !== null) globalThis.clearTimeout(state.timer);
    state.timer = null;
    state.inFlight = true;
    const sequence = (referenceFrameSequenceByInstanceId.get(peer.companionInstanceId) ?? 0) + 1;
    referenceFrameSequenceByInstanceId.set(peer.companionInstanceId, sequence);
    const scheduledEpoch = state.epoch;
    const controller = new AbortController();
    state.controller = controller;
    const request: StudioCompanionReferenceCaptureRequest = Object.freeze({
      ...current,
      sequence,
      signal: controller.signal,
    });
    let captureSucceeded = false;
    let captureTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    const timeout = new Promise<null>((resolve) => {
      captureTimeout = globalThis.setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 5_000);
    });
    const captured = Promise.resolve().then(() => input.captureReferenceFrame?.(request) ?? null);
    void Promise.race([captured, timeout]).then((frame) => {
      if (
        !frame
        || disposed
        || controller.signal.aborted
        || state.epoch !== scheduledEpoch
        || referenceCaptureStates.get(peer.companionInstanceId) !== state
        || !referenceDemandInstanceIds.has(peer.companionInstanceId)
        || !isStudioCompanionReferencePreviewFrame(frame)
        || frame.generation !== current.generation
        || frame.revision !== current.revision
        || frame.referenceRevision !== current.referenceRevision
        || frame.sequence !== sequence
      ) return;
      const activePeer = referencePeerForInstance(peer.companionInstanceId);
      if (!activePeer || activePeer.generation !== peer.generation) return;
      const latest = readReferenceProjection(activePeer);
      if (!latest || !sameReferenceCursor(referenceCursorFromProjection(latest), current)) return;
      try {
        referenceChannel.postMessage(buildStudioCompanionReferencePreviewFrame({
          primaryInstanceId,
          targetCompanionInstanceId: peer.companionInstanceId,
          frame,
        }));
        captureSucceeded = true;
        state.lastCaptured = Object.freeze({ ...current, at: Date.now() });
        state.failure = null;
      } catch {
        // A detached peer may disappear between the final route check and transfer.
      }
    }).catch(() => {
      // Reference capture is optional and failure is handled by bounded retry below.
    }).finally(() => {
      if (captureTimeout !== null) globalThis.clearTimeout(captureTimeout);
      if (
        state.epoch !== scheduledEpoch
        || referenceCaptureStates.get(peer.companionInstanceId) !== state
      ) return;
      if (state.controller === controller) state.controller = null;
      state.inFlight = false;
      if (disposed || !referenceDemandInstanceIds.has(peer.companionInstanceId)) return;
      const activePeer = referencePeerForInstance(peer.companionInstanceId);
      if (!activePeer || activePeer.generation !== peer.generation) {
        releaseReferenceTransport(peer.companionInstanceId, true);
        return;
      }
      const latest = readReferenceProjection(activePeer);
      if (!latest) return;
      const latestCursor = referenceCursorFromProjection(latest);
      if (!sameReferenceCursor(latestCursor, current)) {
        synchronizeReferenceCaptureCursor(state, latestCursor);
        requestReferenceCapture(activePeer, latest);
        return;
      }
      if (captureSucceeded) return;
      const previousFailure = state.failure;
      const count = previousFailure && sameReferenceCursor(previousFailure, current)
        ? previousFailure.count + 1
        : 1;
      state.failure = Object.freeze({ ...current, count, at: Date.now() });
      if (count < STUDIO_COMPANION_REFERENCE_MAX_CAPTURE_FAILURES) {
        requestReferenceCapture(activePeer, latest);
      }
    });
  }

  function requestReferenceColor(
    peer: StudioCompanionBindingSnapshot,
    control: Extract<StudioCompanionReferenceControl, { kind: "reference-pick-color" }>
  ): void {
    if (
      disposed
      || !input.sampleReferenceColor
      || !referenceDemandInstanceIds.has(peer.companionInstanceId)
    ) return;
    const projection = readReferenceProjection(peer);
    if (
      !projection
      || !projection.canPickColor
      || projection.referenceRevision !== control.referenceRevision
    ) return;
    releaseReferenceColorState(peer.companionInstanceId);
    const controller = new AbortController();
    const current = referenceCursorFromProjection(projection);
    const state: StudioCompanionReferenceColorState = {
      epoch: ++referenceAsyncEpoch,
      controller,
      current,
    };
    referenceColorStates.set(peer.companionInstanceId, state);
    const request: StudioCompanionReferenceColorSampleRequest = Object.freeze({
      requester: Object.freeze({
        companionInstanceId: peer.companionInstanceId,
        generation: peer.generation,
      }),
      current,
      point: Object.freeze({ x: control.point.x, y: control.point.y }),
      sequence: control.sequence,
      signal: controller.signal,
    });
    let sampleTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    const timeout = new Promise<null>((resolve) => {
      sampleTimeout = globalThis.setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 5_000);
    });
    const sampled = Promise.resolve().then(() => input.sampleReferenceColor?.(request) ?? null);
    void Promise.race([sampled, timeout]).then((color) => {
      const result: StudioCompanionReferenceColorResult = {
        ...current,
        sequence: control.sequence,
        color: color ?? "",
      };
      if (
        disposed
        || controller.signal.aborted
        || referenceColorStates.get(peer.companionInstanceId) !== state
        || !referenceDemandInstanceIds.has(peer.companionInstanceId)
        || !isStudioCompanionReferenceColorResult(result)
      ) return;
      const activePeer = referencePeerForInstance(peer.companionInstanceId);
      if (!activePeer || activePeer.generation !== peer.generation) return;
      const latest = readReferenceProjection(activePeer);
      if (
        !latest
        || !latest.canPickColor
        || !sameReferenceCursor(referenceCursorFromProjection(latest), current)
      ) return;
      try {
        referenceChannel.postMessage(buildStudioCompanionReferenceColorResult({
          primaryInstanceId,
          targetCompanionInstanceId: peer.companionInstanceId,
          result,
        }));
      } catch {
        // A detached peer may close while the asynchronous sample resolves.
      }
    }).catch(() => {
      // Color sampling is best-effort and never mutates the Reference document.
    }).finally(() => {
      if (sampleTimeout !== null) globalThis.clearTimeout(sampleTimeout);
      if (referenceColorStates.get(peer.companionInstanceId) === state) {
        referenceColorStates.delete(peer.companionInstanceId);
      }
    });
  }

  const sameCaptureOwner = (
    left: StudioCompanionBindingSnapshot | null,
    right: StudioCompanionBindingSnapshot | null
  ) => left?.surface === right?.surface
    && left?.companionInstanceId === right?.companionInstanceId
    && left?.generation === right?.generation;

  const selectCaptureOwner = (): StudioCompanionBindingSnapshot | null => {
    const dedicated = binding.bindingForSurface("navigator");
    if (
      dedicated
      && navigatorDemandByInstanceId.get(dedicated.companionInstanceId) === true
    ) return dedicated;
    const workspace = binding.bindingForSurface("workspace");
    return workspace
      && navigatorDemandByInstanceId.get(workspace.companionInstanceId) === true
      ? workspace
      : null;
  };

  const demandedFrameRecipients = (): readonly StudioCompanionBindingSnapshot[] => (
    binding.activeBindings().filter((peer) => (
      (peer.surface === "workspace" || peer.surface === "navigator")
      && navigatorDemandByInstanceId.get(peer.companionInstanceId) === true
    ))
  );

  const hasPendingDemandRefresh = (): boolean => {
    const activeIds = new Set(demandedFrameRecipients().map((peer) => peer.companionInstanceId));
    for (const companionInstanceId of pendingDemandRefreshInstanceIds) {
      if (!activeIds.has(companionInstanceId)) {
        pendingDemandRefreshInstanceIds.delete(companionInstanceId);
      }
    }
    return pendingDemandRefreshInstanceIds.size > 0;
  };

  const reconcileCaptureOwner = (): boolean => {
    const nextOwner = selectCaptureOwner();
    if (sameCaptureOwner(captureOwner, nextOwner)) return false;
    captureOwner = nextOwner;
    pendingDemandRefreshInstanceIds.clear();
    resetCaptureGeneration();
    return true;
  };

  const clearLeaseTimer = () => {
    if (leaseTimer === null) return;
    globalThis.clearTimeout(leaseTimer);
    leaseTimer = null;
  };

  const expireBindingsAndReconcile = (now = Date.now()): boolean => {
    const expired = binding.expireStale(now);
    if (expired.length === 0) return false;
    for (const peer of expired) {
      navigatorDemandByInstanceId.delete(peer.companionInstanceId);
      pendingDemandRefreshInstanceIds.delete(peer.companionInstanceId);
      releaseReferenceTransport(peer.companionInstanceId, true);
    }
    return reconcileCaptureOwner();
  };

  const scheduleLeaseSweep = () => {
    clearLeaseTimer();
    if (disposed) return;
    const nextExpiryAt = binding.nextExpiryAt();
    if (nextExpiryAt === null) return;
    leaseTimer = globalThis.setTimeout(() => {
      leaseTimer = null;
      const ownerChanged = expireBindingsAndReconcile();
      scheduleLeaseSweep();
      if (!ownerChanged || !captureOwner) return;
      const latest = input.getReviewProjection?.();
      if (latest && isStudioCompanionReviewProjection(latest)) {
        requestNavigatorCapture(latest);
      }
    }, Math.max(1, nextExpiryAt - Date.now()));
  };

  const scheduleNavigatorCapture = (delayMs: number) => {
    if (captureTimer !== null) return;
    const scheduledEpoch = captureEpoch;
    captureTimer = globalThis.setTimeout(() => {
      captureTimer = null;
      if (disposed || captureEpoch !== scheduledEpoch) return;
      const latest = input.getReviewProjection?.();
      if (latest && isStudioCompanionReviewProjection(latest)) {
        requestNavigatorCapture(latest);
      }
    }, Math.max(0, delayMs));
  };

  const requestNavigatorCapture = (projection: StudioCompanionReviewProjection) => {
    const capture = input.captureNavigatorFrame;
    expireBindingsAndReconcile();
    scheduleLeaseSweep();
    reconcileCaptureOwner();
    const owner = captureOwner;
    if (
      disposed
      || !capture
      || !owner
      || owner.generation <= 0
    ) return;
    const now = Date.now();
    const ownerKey = `${owner.surface}:${owner.companionInstanceId}:${owner.generation}`;
    if (
      captureFailureOwnerKey !== ownerKey
      || captureFailureRevision !== projection.documentRevision
    ) {
      clearCaptureTimer();
      captureFailureOwnerKey = ownerKey;
      captureFailureRevision = projection.documentRevision;
      captureFailureCount = 0;
      captureRetryNotBefore = 0;
    }
    if (captureFailureCount >= STUDIO_COMPANION_CAPTURE_MAX_FAILURES_PER_REVISION) return;
    if (captureRetryNotBefore > now) {
      scheduleNavigatorCapture(captureRetryNotBefore - now);
      return;
    }
    const demandRefreshPending = hasPendingDemandRefresh();
    const plan = planStudioCompanionNavigatorCapture({
      generation: owner.generation,
      lastCapturedGeneration,
      revision: projection.documentRevision,
      lastCapturedRevision: demandRefreshPending ? -1 : lastCapturedRevision,
      lastCaptureAt,
      now,
      activeStroke: !projection.captureAllowed,
      inFlight: captureInFlight,
    });
    if (plan.kind === "defer") {
      scheduleNavigatorCapture(plan.delayMs);
      return;
    }
    if (plan.kind !== "capture") return;

    clearCaptureTimer();
    captureInFlight = true;
    lastCaptureAt = now;
    captureSequence += 1;
    const scheduledEpoch = captureEpoch;
    const scheduledOwner = owner;
    const scheduledGeneration = owner.generation;
    const scheduledRevision = projection.documentRevision;
    const scheduledSequence = captureSequence;
    const scheduledDemandRefreshIds = new Set(pendingDemandRefreshInstanceIds);
    const controller = new AbortController();
    captureController = controller;
    let captureSucceeded = false;
    let captureTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    const timeout = new Promise<null>((resolve) => {
      captureTimeout = globalThis.setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 5_000);
    });
    const captured = Promise.resolve().then(() => capture({
      generation: scheduledGeneration,
      revision: scheduledRevision,
      sequence: scheduledSequence,
      signal: controller.signal,
    }));
    void Promise.race([captured, timeout]).then((frame) => {
      if (
        !frame
        || disposed
        || captureEpoch !== scheduledEpoch
        || !sameCaptureOwner(captureOwner, scheduledOwner)
        || frame.generation !== scheduledGeneration
        || frame.revision !== scheduledRevision
        || frame.sequence !== scheduledSequence
        || !isStudioCompanionNavigatorFrame(frame)
      ) return;
      captureSucceeded = true;
      lastCapturedGeneration = scheduledGeneration;
      lastCapturedRevision = Math.max(lastCapturedRevision, scheduledRevision);
      for (const peer of demandedFrameRecipients()) {
        try {
          channel.postMessage(buildStudioCompanionNavigatorFrame({
            primaryInstanceId,
            targetCompanionInstanceId: peer.companionInstanceId,
            frame: {
              ...frame,
              generation: peer.generation,
            },
          }));
        } catch {
          // A detached surface may close while another demanded surface remains active.
        }
      }
      for (const companionInstanceId of scheduledDemandRefreshIds) {
        pendingDemandRefreshInstanceIds.delete(companionInstanceId);
      }
    }).catch(() => {
      // Capture is optional. The bounded textual review projection remains available.
    }).finally(() => {
      if (captureTimeout !== null) globalThis.clearTimeout(captureTimeout);
      if (captureEpoch !== scheduledEpoch) return;
      if (captureController === controller) captureController = null;
      captureInFlight = false;
      const latest = input.getReviewProjection?.();
      const remainsCurrent = Boolean(
        !disposed
        && sameCaptureOwner(captureOwner, scheduledOwner)
        && latest
        && isStudioCompanionReviewProjection(latest)
        && latest.documentRevision === scheduledRevision
      );
      if (remainsCurrent && !captureSucceeded) {
        captureFailureOwnerKey = ownerKey;
        captureFailureRevision = scheduledRevision;
        captureFailureCount += 1;
        captureRetryNotBefore = Date.now() + (
          STUDIO_COMPANION_CAPTURE_RETRY_BASE_MS * (2 ** (captureFailureCount - 1))
        );
      } else if (remainsCurrent) {
        captureFailureCount = 0;
        captureRetryNotBefore = 0;
      }
      if (
        latest
        && isStudioCompanionReviewProjection(latest)
        && (
          latest.documentRevision > lastCapturedRevision
          || hasPendingDemandRefresh()
        )
      ) {
        requestNavigatorCapture(latest);
      }
    });
  };

  const publish = () => {
    if (disposed || primaryGoodbyeSent) return;
    expireBindingsAndReconcile();
    scheduleLeaseSweep();
    const peers = binding.activeBindings();
    if (peers.length === 0) return;
    let snapshot: StudioCompanionPrimarySnapshot;
    let projection: StudioCompanionReviewProjection | null = null;
    try {
      snapshot = input.getSnapshot();
      const candidate = input.getReviewProjection?.();
      if (candidate && isStudioCompanionReviewProjection(candidate)) projection = candidate;
    } catch {
      return;
    }
    for (const peer of peers) {
      try {
        channel.postMessage(buildStudioCompanionPrimaryState({
          primaryInstanceId,
          targetCompanionInstanceId: peer.companionInstanceId,
          tool: snapshot.tool,
          density: snapshot.density,
          canvasOnly: snapshot.canvasOnly,
          title: peer.surface === "navigator" || peer.surface === "reference"
            ? STUDIO_COMPANION_NAVIGATOR_GENERIC_TITLE
            : snapshot.title || "스튜디오",
        }));
        if (peer.surface === "workspace" || peer.surface === "reference") {
          const referenceProjection = readReferenceProjection(peer);
          if (referenceProjection) {
            const colorState = referenceColorStates.get(peer.companionInstanceId);
            if (
              colorState
              && !sameReferenceCursor(
                colorState.current,
                referenceCursorFromProjection(referenceProjection)
              )
            ) releaseReferenceColorState(peer.companionInstanceId);
            channel.postMessage(buildStudioCompanionReferenceState({
              primaryInstanceId,
              targetCompanionInstanceId: peer.companionInstanceId,
              generation: peer.generation,
              projection: referenceProjection,
            }));
            requestReferenceCapture(peer, referenceProjection);
          } else {
            releaseReferenceCaptureState(peer.companionInstanceId);
            releaseReferenceColorState(peer.companionInstanceId);
          }
        }
        if (!projection || peer.surface === "reference") continue;
        channel.postMessage(buildStudioCompanionReviewState({
          primaryInstanceId,
          targetCompanionInstanceId: peer.companionInstanceId,
          generation: peer.generation,
          projection: peer.surface === "navigator"
            ? createStudioCompanionNavigatorProjection(projection)
            : projection,
        }));
      } catch {
        // One detached surface may close while the remaining surfaces stay connected.
      }
    }
    if (projection) requestNavigatorCapture(projection);
  };

  const schedulePublish = () => {
    if (
      disposed
      || primaryGoodbyeSent
      || binding.activeBindings().length === 0
      || publishTimer !== null
    ) return;
    publishTimer = globalThis.setTimeout(() => {
      publishTimer = null;
      publish();
    }, 100);
  };

  const sendPrimaryGoodbye = () => {
    if (primaryGoodbyeSent) return;
    primaryGoodbyeSent = true;
    resetCaptureGeneration();
    releaseAllReferenceTransports();
    clearLeaseTimer();
    if (publishTimer !== null) {
      globalThis.clearTimeout(publishTimer);
      publishTimer = null;
    }
    for (const peer of binding.activeBindings()) {
      try {
        channel.postMessage(buildStudioCompanionPrimaryGoodbye({
          primaryInstanceId,
          targetCompanionInstanceId: peer.companionInstanceId,
          surface: peer.surface,
        }));
      } catch {
        // Continue notifying the other independently bound role windows.
      }
    }
  };
  const primaryPageTarget = typeof window === "undefined" ? null : window;
  const onPrimaryPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) return;
    sendPrimaryGoodbye();
  };
  primaryPageTarget?.addEventListener("pagehide", onPrimaryPageHide);

  channel.onmessage = (event: MessageEvent) => {
    if (primaryGoodbyeSent) return;
    const message = parseStudioCompanionMessage(event.data);
    if (!message) return;
    if (message.type === "companion-goodbye") {
      const departing = binding.bindingForSurface(message.surface);
      if (!binding.acceptGoodbye(message, primaryInstanceId)) return;
      if (departing) {
        navigatorDemandByInstanceId.delete(departing.companionInstanceId);
        pendingDemandRefreshInstanceIds.delete(departing.companionInstanceId);
        releaseReferenceTransport(departing.companionInstanceId, true);
      }
      const ownerChanged = reconcileCaptureOwner();
      scheduleLeaseSweep();
      if (ownerChanged && captureOwner) {
        const latest = input.getReviewProjection?.();
        if (latest && isStudioCompanionReviewProjection(latest)) {
          requestNavigatorCapture(latest);
        }
      }
      return;
    }
    if (message.type === "hello" && message.role === "companion") {
      const surface = studioCompanionSurfaceForHello(message);
      const previous = binding.bindingForSurface(surface);
      if (!binding.acceptHello(message, primaryInstanceId)) return;
      const accepted = binding.bindingForSurface(surface);
      if (!accepted) return;
      if (previous?.companionInstanceId !== accepted.companionInstanceId) {
        if (previous) {
          navigatorDemandByInstanceId.delete(previous.companionInstanceId);
          pendingDemandRefreshInstanceIds.delete(previous.companionInstanceId);
          releaseReferenceTransport(previous.companionInstanceId, true);
        }
        reconcileCaptureOwner();
      }
      scheduleLeaseSweep();
      const shouldReply = previous?.companionInstanceId !== message.companionInstanceId
        || message.targetPrimaryInstanceId === null;
      if (!shouldReply) return;
      try {
        channel.postMessage(buildStudioCompanionHello({
          role: "primary",
          primaryInstanceId,
          targetCompanionInstanceId: accepted.companionInstanceId,
        }));
        publish();
      } catch {
        // The popup may have closed while completing the handshake.
      }
      return;
    }
    if (message.type === "ping" && binding.acceptPing(message, primaryInstanceId)) {
      scheduleLeaseSweep();
      try {
        channel.postMessage(buildStudioCompanionPong({
          primaryInstanceId,
          targetCompanionInstanceId: message.companionInstanceId,
          nonce: message.nonce,
        }));
      } catch {
        // Ignore a close racing the heartbeat response.
      }
      return;
    }
    if (message.type === "companion-control") {
      if (!binding.acceptControl(message, primaryInstanceId)) return;
      scheduleLeaseSweep();
      if (message.control.kind === "navigator-demand") {
        const previousDemand = navigatorDemandByInstanceId.get(message.companionInstanceId) === true;
        if (message.control.active) {
          navigatorDemandByInstanceId.set(message.companionInstanceId, true);
        } else {
          navigatorDemandByInstanceId.delete(message.companionInstanceId);
          pendingDemandRefreshInstanceIds.delete(message.companionInstanceId);
        }
        if (previousDemand === message.control.active) return;
        const ownerChanged = reconcileCaptureOwner();
        if (
          message.control.active
          && !ownerChanged
          && captureOwner
          && captureOwner.companionInstanceId !== message.companionInstanceId
        ) {
          pendingDemandRefreshInstanceIds.add(message.companionInstanceId);
        }
        if ((ownerChanged || message.control.active) && captureOwner) {
          const latest = input.getReviewProjection?.();
          if (latest && isStudioCompanionReviewProjection(latest)) {
            requestNavigatorCapture(latest);
          }
        }
        return;
      }
      if (message.control.kind === "navigate") {
        const latest = input.getReviewProjection?.();
        if (
          navigatorDemandByInstanceId.get(message.companionInstanceId) !== true
          || !latest
          || !isStudioCompanionReviewProjection(latest)
          || !latest.captureAllowed
        ) return;
      }
      if (isStudioCompanionReferenceControl(message.control)) {
        input.onReferenceControl?.(message.control);
        const peer = referencePeerForInstance(message.companionInstanceId);
        if (!peer || peer.generation !== message.generation) return;
        if (message.control.kind === "reference-preview-demand") {
          if (message.control.active) {
            referenceDemandInstanceIds.add(message.companionInstanceId);
            if (!referenceDemandAggregateActive) {
              referenceDemandAggregateActive = true;
              try {
                input.onReferenceDemandChange?.(true);
              } catch {
                // Demand observers are optional; the protocol remains authoritative.
              }
            }
            publish();
          } else {
            releaseReferenceTransport(message.companionInstanceId, false);
          }
          return;
        }
        requestReferenceColor(peer, message.control);
        return;
      }
      input.onControl?.(message.control);
      publish();
      return;
    }
    if (message.type === "companion-presentation-safe") {
      // Presentation safety is an ephemeral companion-to-companion LWW register. The primary
      // never binds, forwards, or interprets it as a document/tool command.
      return;
    }
    if (!binding.acceptCommand(message, primaryInstanceId)) return;
    scheduleLeaseSweep();
    input.onCommand(message.command);
    publish();
  };

  try {
    channel.postMessage(buildStudioCompanionHello({
      role: "primary",
      primaryInstanceId,
      targetCompanionInstanceId: null,
    }));
  } catch {
    // The channel remains useful when the companion announces itself later.
  }

  return {
    sessionId,
    binding,
    publish,
    schedulePublish,
    generation: (surface = "workspace") => binding.generation(surface),
    dispose: () => {
      if (disposed) return;
      primaryPageTarget?.removeEventListener("pagehide", onPrimaryPageHide);
      sendPrimaryGoodbye();
      disposed = true;
      captureEpoch += 1;
      clearCaptureTimer();
      captureController?.abort();
      captureController = null;
      captureInFlight = false;
      clearLeaseTimer();
      if (publishTimer !== null) {
        globalThis.clearTimeout(publishTimer);
        publishTimer = null;
      }
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Ignore a channel already closed by the browser.
      }
      navigatorDemandByInstanceId.clear();
      pendingDemandRefreshInstanceIds.clear();
      captureOwner = null;
      binding.releaseAll();
    },
  };
}