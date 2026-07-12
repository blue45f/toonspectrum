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
  clientX?: unknown;
  clientY?: unknown;
  pressure?: unknown;
  tiltX?: unknown;
  tiltY?: unknown;
  twist?: unknown;
  timeStamp?: unknown;
  getCoalescedEvents?: unknown;
  getPredictedEvents?: unknown;
}

export interface StudioStrokePointerSession {
  readonly pointerId: number;
  readonly pointerType: "pen" | "touch" | "mouse" | "unknown";
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
    finiteNumber(event.tiltX, 0),
    finiteNumber(event.tiltY, 0),
    finiteNumber(event.twist, 0),
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

/** Starts one primary, left-contact drawing session. Secondary touch and barrel/right clicks lose. */
export function beginStudioStrokePointerSession(
  event: StudioPointerEventLike
): StudioStrokePointerSession | null {
  if (event.isPrimary === false) return null;
  if (finiteNumber(event.button, 0) !== 0) return null;
  const pointerId = pointerIdOf(event);
  if (!Number.isFinite(pointerId)) return null;
  return {
    pointerId,
    pointerType: pointerTypeOf(event),
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
 * Restores coalesced hardware samples, appends the dispatched event when it is not already the
 * same final sample, and keeps predicted samples on a separate preview-only channel.
 *
 * Browser delivery order is preserved rather than timestamp-sorted. Reduced timer precision can
 * produce equal timestamps, while reordering those points would visibly kink the stroke.
 */
export function collectStudioStrokePointerBatch<T extends StudioPointerEventLike>(
  session: StudioStrokePointerSession,
  event: T,
  options: { includePredicted?: boolean } = {}
): StudioStrokePointerBatch<T> {
  if (!isStudioStrokePointerEvent(session, event)) {
    return { authoritative: [], predicted: [], session };
  }

  const authoritative: T[] = [];
  let previousSignature = session.lastAuthoritativeSignature;
  const coalesced = safeRelatedEvents(event, "getCoalescedEvents");
  // Always include the dispatched event. Some engines include it in getCoalescedEvents(), others
  // return only the samples preceding it; adjacent signature deduplication handles both contracts.
  for (const candidate of [...coalesced, event]) {
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
