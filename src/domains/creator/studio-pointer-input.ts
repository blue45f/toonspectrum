/**
 * Browser PointerEvent samples are intentionally consumed through this small, deterministic
 * boundary before they reach the Studio drawing model.  In particular, predicted samples are
 * preview-only: advancing the authoritative session with one would make an undo snapshot contain
 * pixels the pen never actually visited.
 */

export interface StudioPointerEventLike {
  pointerId?: unknown;
  pointerType?: unknown;
  isPrimary?: unknown;
  button?: unknown;
  /** Bitmask: 1 = left. Present on PointerEvent/MouseEvent during drag. */
  buttons?: unknown;
  clientX?: unknown;
  clientY?: unknown;
  pressure?: unknown;
  tangentialPressure?: unknown;
  tiltX?: unknown;
  tiltY?: unknown;
  altitudeAngle?: unknown;
  azimuthAngle?: unknown;
  twist?: unknown;
  width?: unknown;
  height?: unknown;
  timeStamp?: unknown;
  getCoalescedEvents?: unknown;
  getPredictedEvents?: unknown;
}

export interface StudioStrokePointerSession {
  readonly pointerId: number;
  readonly pointerType: "pen" | "touch" | "mouse" | "unknown";
  /**
   * Durable ink follows the processed Pointer Events stream. Its coalesced list restores hardware
   * samples without the extra jitter/duplicate topology of a parallel raw-update subscription.
   */
  readonly moveTransport: "pointermove";
  /** Exact signature of the last stored hardware sample, used only for adjacent deduplication. */
  readonly lastAuthoritativeSignature: string;
}

export interface StudioStrokePointerBatch<T extends StudioPointerEventLike> {
  /** Hardware-backed samples safe to store in the document, in browser delivery order. */
  readonly authoritative: readonly T[];
  /** Forward estimates safe only for the transient preview. */
  readonly predicted: readonly T[];
  readonly session: StudioStrokePointerSession;
}

export interface StudioPointerCaptureTarget {
  setPointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture?: (pointerId: number) => void;
}

export interface StudioStrokeMoveTransportClaim {
  readonly accepted: boolean;
  readonly session: StudioStrokePointerSession;
}

export type StudioPointerCaptureLossOutcome = "foreign" | "retain" | "finish";

const LEGACY_POINTER_ID = 1;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pointerIdOf(event: StudioPointerEventLike, fallback = LEGACY_POINTER_ID): number {
  if (event.pointerId === undefined || event.pointerId === null) return fallback;
  const value = finiteNumber(event.pointerId, Number.NaN);
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
}

function pointerTypeOf(event: StudioPointerEventLike): StudioStrokePointerSession["pointerType"] {
  if (typeof event.pointerType !== "string") return "unknown";
  const value = event.pointerType.toLowerCase();
  return value === "pen" || value === "touch" || value === "mouse" ? value : "unknown";
}

function pointerSampleSignature(event: StudioPointerEventLike, pointerId: number): string {
  // Do not deduplicate by timestamp alone. Safari and some tablet drivers legitimately emit a
  // run of distinct coordinates with timestamp=0 (or the same reduced-precision timestamp).
  return JSON.stringify([
    pointerId,
    typeof event.pointerType === "string" ? event.pointerType.toLowerCase() : "",
    finiteNumber(event.timeStamp, 0),
    finiteNumber(event.clientX, 0),
    finiteNumber(event.clientY, 0),
    finiteNumber(event.pressure, 0),
    finiteNumber(event.tangentialPressure, 0),
    finiteNumber(event.tiltX, 0),
    finiteNumber(event.tiltY, 0),
    finiteNumber(event.altitudeAngle, 0),
    finiteNumber(event.azimuthAngle, 0),
    finiteNumber(event.twist, 0),
    finiteNumber(event.width, 0),
    finiteNumber(event.height, 0),
  ]);
}

function safeRelatedEvents<T extends StudioPointerEventLike>(
  event: T,
  methodName: "getCoalescedEvents" | "getPredictedEvents"
): readonly T[] {
  const method = event[methodName];
  if (typeof method !== "function") return [];
  try {
    const result = (method as (this: T) => unknown).call(event);
    return Array.isArray(result) ? (result as readonly T[]) : [];
  } catch {
    // Safari versions, embedded webviews and test doubles may expose a method that still throws.
    // The dispatched event remains a complete standards-compatible fallback.
    return [];
  }
}

/**
 * True when the left primary contact is down.
 * Mouse: button 0 on pointerdown; buttons bitmask 1 during drag.
 * Pen/touch: button 0 on down; some drivers omit buttons mid-stroke.
 */
export function isStudioLeftContactDown(event: StudioPointerEventLike): boolean {
  const button = finiteNumber(event.button, 0);
  // Reject middle (1) and right (2) explicitly. -1 is used on some move events.
  if (button === 1 || button === 2) return false;
  if (typeof event.buttons === "number" && Number.isFinite(event.buttons)) {
    // buttons === 0 means released (mouse left the drag without up in some edge cases).
    if (event.buttons === 0) return false;
    return (event.buttons & 1) === 1;
  }
  // pointerdown without buttons field: require primary button index 0.
  return button === 0 || button === -1;
}

/** Starts one primary, left-contact drawing session. Secondary touch and barrel/right clicks lose. */
export function beginStudioStrokePointerSession(
  event: StudioPointerEventLike
): StudioStrokePointerSession | null {
  if (event.isPrimary === false) return null;
  // Mouse/pen/touch must start on left contact only (context menu / barrel stay free).
  if (finiteNumber(event.button, 0) !== 0) return null;
  if (typeof event.buttons === "number" && event.buttons !== 0 && (event.buttons & 1) === 0) {
    return null;
  }
  const pointerId = pointerIdOf(event);
  if (!Number.isFinite(pointerId)) return null;
  return {
    pointerId,
    pointerType: pointerTypeOf(event),
    moveTransport: "pointermove",
    lastAuthoritativeSignature: pointerSampleSignature(event, pointerId),
  };
}

/** True only when this event belongs to the pen/finger/mouse that opened the stroke. */
export function isStudioStrokePointerEvent(
  session: StudioStrokePointerSession | null | undefined,
  event: StudioPointerEventLike
): boolean {
  return Boolean(session && pointerIdOf(event, session.pointerId) === session.pointerId);
}

/**
 * Mouse can release outside the canvas without a reliable pointerup if capture fails.
 * When buttons reports 0 mid-stroke for mouse/unknown, the stroke must end.
 * Pen/touch often omit a reliable buttons mask — never force-end those on buttons alone.
 */
export function shouldEndStudioStrokeForReleasedContact(
  session: StudioStrokePointerSession | null | undefined,
  event: StudioPointerEventLike
): boolean {
  if (!session || !isStudioStrokePointerEvent(session, event)) return false;
  if (session.pointerType !== "mouse" && session.pointerType !== "unknown") return false;
  if (typeof event.buttons !== "number" || !Number.isFinite(event.buttons)) return false;
  return event.buttons === 0;
}

/**
 * Losing DOM pointer capture is transport degradation, not a cancellation signal. The global
 * pointerup/cancel safety listeners still own the gesture. A mouse loss that already reports
 * buttons=0 can be finalized from the last authoritative sample; every other matching loss keeps
 * the session alive until a real end signal arrives.
 */
export function resolveStudioPointerCaptureLoss(
  session: StudioStrokePointerSession | null | undefined,
  event: StudioPointerEventLike
): StudioPointerCaptureLossOutcome {
  if (!session || !isStudioStrokePointerEvent(session, event)) return "foreign";
  return shouldEndStudioStrokeForReleasedContact(session, event) ? "finish" : "retain";
}

/**
 * A capture-phase `window` blur listener also observes focus leaving a descendant control. That is
 * an ordinary focus transfer (for example, toolbar button -> canvas), not a browser-window abort.
 */
export function isStudioTopLevelWindowBlur(
  eventTarget: unknown,
  windowTarget: unknown
): boolean {
  return eventTarget === windowTarget;
}

/** Keep already-rendered mouse/pen ink when the browser transport itself is interrupted. */
export function shouldPreserveStudioStrokeOnTransportAbort(
  session: StudioStrokePointerSession | null | undefined
): boolean {
  return Boolean(session && session.pointerType !== "touch");
}

/**
 * Browsers and embedded webviews may cancel a mouse or pen stream after showing valid ink. Keep
 * that last authoritative prefix instead of deleting it. Touch cancellation remains destructive
 * because it normally means the gesture was promoted to scrolling, pinch zoom, or palm rejection.
 */
export function shouldCommitStudioStrokeOnPointerCancel(
  session: StudioStrokePointerSession | null | undefined,
  event: StudioPointerEventLike
): boolean {
  if (!session || !isStudioStrokePointerEvent(session, event)) return false;
  return shouldPreserveStudioStrokeOnTransportAbort(session);
}

/** A second finger transitions a finger stroke into navigation; pen + touch remains palm-safe. */
export function shouldCancelStudioFingerStrokeForAdditionalContact(
  session: StudioStrokePointerSession | null | undefined,
  event: StudioPointerEventLike
): boolean {
  if (!session || session.pointerType !== "touch" || pointerTypeOf(event) !== "touch") return false;
  const pointerId = pointerIdOf(event, session.pointerId);
  return Number.isFinite(pointerId) && pointerId !== session.pointerId;
}

/**
 * Keeps durable ink on processed pointermove. `pointerrawupdate` can arrive at a different cadence
 * from the processed/coalesced stream and must never poison a session or suppress its next move.
 * This mirrors Magma's public input path and leaves raw updates available for future preview-only
 * telemetry without allowing two native transports to own the same pixels.
 */
export function claimStudioStrokeMoveTransport(
  session: StudioStrokePointerSession,
  event: StudioPointerEventLike,
  eventType: "pointermove" | "pointerrawupdate"
): StudioStrokeMoveTransportClaim {
  if (!isStudioStrokePointerEvent(session, event)) {
    return { accepted: false, session };
  }
  return {
    accepted: eventType === "pointermove",
    session,
  };
}

/**
 * Restores either coalesced hardware samples or the dispatched-event fallback, and keeps predicted
 * samples on a separate preview-only channel. The processed parent is never treated as an extra
 * hardware point when a coalesced list exists.
 *
 * Browser delivery order is preserved rather than timestamp-sorted. Reduced timer precision can
 * produce equal timestamps, while reordering those points would visibly kink the stroke.
 */
export function collectStudioStrokePointerBatch<T extends StudioPointerEventLike>(
  session: StudioStrokePointerSession,
  event: T,
  options: {
    includePredicted?: boolean;
    /** Normal pointerup owns exactly its dispatched endpoint, never stale move coalescing. */
    authoritativeSource?: "coalesced-or-parent" | "parent-only";
  } = {}
): StudioStrokePointerBatch<T> {
  if (!isStudioStrokePointerEvent(session, event)) {
    return { authoritative: [], predicted: [], session };
  }

  const authoritative: T[] = [];
  let previousSignature = session.lastAuthoritativeSignature;
  const coalesced = options.authoritativeSource === "parent-only"
    ? []
    : safeRelatedEvents(event, "getCoalescedEvents");
  // A trusted parent pointer event is the processed aggregate of its coalesced list, not an extra
  // hardware sample. Consume one representation only; empty/throwing APIs fall back to parent.
  const candidates = coalesced.length > 0 ? coalesced : [event];
  for (const candidate of candidates) {
    if (!isStudioStrokePointerEvent(session, candidate)) continue;
    const signature = pointerSampleSignature(candidate, session.pointerId);
    if (signature === previousSignature) continue;
    authoritative.push(candidate);
    previousSignature = signature;
  }

  const nextSession: StudioStrokePointerSession = {
    ...session,
    lastAuthoritativeSignature: previousSignature,
  };

  const predicted: T[] = [];
  if (options.includePredicted) {
    let previousPredictedSignature = previousSignature;
    for (const candidate of safeRelatedEvents(event, "getPredictedEvents")) {
      if (!isStudioStrokePointerEvent(session, candidate)) continue;
      const signature = pointerSampleSignature(candidate, session.pointerId);
      if (signature === previousPredictedSignature) continue;
      predicted.push(candidate);
      previousPredictedSignature = signature;
    }
  }

  return { authoritative, predicted, session: nextSession };
}

/** Pointer capture is a progressive enhancement; unsupported/detached DOM nodes fail closed. */
export function tryCaptureStudioStrokePointer(
  target: StudioPointerCaptureTarget | null | undefined,
  pointerId: number
): boolean {
  if (typeof target?.setPointerCapture !== "function") return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

/** Releases only a capture still owned by the target and tolerates browser detach races. */
export function tryReleaseStudioStrokePointer(
  target: StudioPointerCaptureTarget | null | undefined,
  pointerId: number
): boolean {
  if (typeof target?.releasePointerCapture !== "function") return false;
  try {
    if (typeof target.hasPointerCapture === "function" && !target.hasPointerCapture(pointerId)) {
      return false;
    }
    target.releasePointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}
