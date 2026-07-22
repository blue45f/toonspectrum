/**
 * Bounded, view-only reference-board contract for detached Studio companions.
 *
 * This module deliberately carries only a flattened WebP preview and aggregate counts. It never
 * transports editable reference items, asset identifiers, filenames, source URLs, transforms, or
 * panel state. All transport validators read exact own data descriptors so hostile accessors are
 * rejected without being invoked.
 */

export const STUDIO_COMPANION_REFERENCE_MAX_ITEMS = 32;
export const STUDIO_COMPANION_REFERENCE_MAX_EDGE = 1_280;
export const STUDIO_COMPANION_REFERENCE_MAX_PIXELS = 1_228_800;
export const STUDIO_COMPANION_REFERENCE_MAX_BYTES = 2 * 1024 * 1024;
export const STUDIO_COMPANION_REFERENCE_MIN_CAPTURE_INTERVAL_MS = 500;
export const STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS = [500, 1_000, 2_000] as const;

export type StudioCompanionReferenceProjection = {
  generation: number;
  revision: number;
  referenceRevision: number;
  itemCount: number;
  resolvedItemCount: number;
  canPickColor: boolean;
};

export type StudioCompanionReferencePreviewFrame = {
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
  width: number;
  height: number;
  blob: Blob;
};

export type StudioCompanionReferencePoint = {
  x: number;
  y: number;
};

export type StudioCompanionReferenceControl =
  | { kind: "reference-preview-demand"; active: boolean }
  | {
      kind: "reference-pick-color";
      point: StudioCompanionReferencePoint;
      referenceRevision: number;
      sequence: number;
    };

export type StudioCompanionReferenceCaptureCursor = {
  generation: number;
  revision: number;
  referenceRevision: number;
};

export type StudioCompanionReferenceCaptureRecord = StudioCompanionReferenceCaptureCursor & {
  at: number;
};

export type StudioCompanionReferenceCaptureFailure = StudioCompanionReferenceCaptureCursor & {
  count: number;
  at: number;
};

export type StudioCompanionReferenceCapturePlan =
  | { kind: "capture" }
  | { kind: "defer"; delayMs: number }
  | {
      kind: "skip";
      reason: "active-stroke" | "clean" | "in-flight" | "invalid" | "no-demand";
    };

export type StudioCompanionReferenceCapturePlanInput = {
  demand: boolean;
  current: StudioCompanionReferenceCaptureCursor;
  lastCaptured: StudioCompanionReferenceCaptureRecord | null;
  failure: StudioCompanionReferenceCaptureFailure | null;
  now: number;
  activeStroke: boolean;
  inFlight: boolean;
};

export type StudioCompanionReferenceFrameAcceptance = {
  generation: number;
  revision: number;
  referenceRevision: number;
  lastAcceptedSequence: number;
};

export type StudioCompanionReferencePickAcceptance = {
  referenceRevision: number;
  lastAcceptedSequence: number;
};

export type StudioCompanionReferenceObjectUrlHandle = Readonly<{
  url: string;
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
  width: number;
  height: number;
}>;

export type StudioCompanionReferenceObjectUrlApi = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

type ExactOwnData = Readonly<Record<string, unknown>>;

function exactOwnData(value: unknown, expectedKeys: readonly string[]): ExactOwnData | null {
  if (!value || typeof value !== "object") return null;

  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
    ) return null;

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function safePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseReferenceCursor(value: unknown): StudioCompanionReferenceCaptureCursor | null {
  const exact = exactOwnData(value, ["generation", "revision", "referenceRevision"]);
  if (
    exact === null
    || !safePositiveInteger(exact.generation)
    || !safePositiveInteger(exact.revision)
    || !safePositiveInteger(exact.referenceRevision)
  ) return null;
  return Object.freeze({
    generation: exact.generation,
    revision: exact.revision,
    referenceRevision: exact.referenceRevision,
  });
}

function isReferenceCursor(value: unknown): value is StudioCompanionReferenceCaptureCursor {
  return parseReferenceCursor(value) !== null;
}

function isSameCursor(
  left: StudioCompanionReferenceCaptureCursor,
  right: StudioCompanionReferenceCaptureCursor
): boolean {
  return left.generation === right.generation
    && left.revision === right.revision
    && left.referenceRevision === right.referenceRevision;
}

function intrinsicBlobMetadata(value: unknown): { size: number; type: string } | null {
  try {
    if (typeof Blob !== "function" || !(value instanceof Blob)) return null;
    const sizeGetter = Object.getOwnPropertyDescriptor(Blob.prototype, "size")?.get;
    const typeGetter = Object.getOwnPropertyDescriptor(Blob.prototype, "type")?.get;
    if (!sizeGetter || !typeGetter) return null;
    const size = Reflect.apply(sizeGetter, value, []) as unknown;
    const type = Reflect.apply(typeGetter, value, []) as unknown;
    return typeof size === "number" && typeof type === "string" ? { size, type } : null;
  } catch {
    return null;
  }
}

/** Color picking is an explicit primary-granted capability and always requires raster content. */
export function isStudioCompanionReferenceProjection(
  value: unknown
): value is StudioCompanionReferenceProjection {
  const exact = exactOwnData(value, [
    "generation",
    "revision",
    "referenceRevision",
    "itemCount",
    "resolvedItemCount",
    "canPickColor",
  ]);
  if (
    !exact
    || !safePositiveInteger(exact.generation)
    || !safePositiveInteger(exact.revision)
    || !safePositiveInteger(exact.referenceRevision)
    || !safeNonNegativeInteger(exact.itemCount)
    || exact.itemCount > STUDIO_COMPANION_REFERENCE_MAX_ITEMS
    || !safeNonNegativeInteger(exact.resolvedItemCount)
    || exact.resolvedItemCount > exact.itemCount
    || typeof exact.canPickColor !== "boolean"
  ) return false;

  return !exact.canPickColor || exact.resolvedItemCount > 0;
}

export function isStudioCompanionReferencePreviewFrame(
  value: unknown
): value is StudioCompanionReferencePreviewFrame {
  return parseStudioCompanionReferencePreviewFrame(value) !== null;
}

function parseStudioCompanionReferencePreviewFrame(
  value: unknown
): StudioCompanionReferencePreviewFrame | null {
  const exact = exactOwnData(value, [
    "generation",
    "revision",
    "referenceRevision",
    "sequence",
    "width",
    "height",
    "blob",
  ]);
  if (
    !exact
    || !safePositiveInteger(exact.generation)
    || !safePositiveInteger(exact.revision)
    || !safePositiveInteger(exact.referenceRevision)
    || !safePositiveInteger(exact.sequence)
    || !safePositiveInteger(exact.width)
    || !safePositiveInteger(exact.height)
    || Math.max(exact.width, exact.height) > STUDIO_COMPANION_REFERENCE_MAX_EDGE
    || exact.width * exact.height > STUDIO_COMPANION_REFERENCE_MAX_PIXELS
  ) return null;

  const blob = intrinsicBlobMetadata(exact.blob);
  if (
    blob === null
    || blob.type !== "image/webp"
    || blob.size <= 0
    || blob.size > STUDIO_COMPANION_REFERENCE_MAX_BYTES
  ) return null;
  return Object.freeze({
    generation: exact.generation,
    revision: exact.revision,
    referenceRevision: exact.referenceRevision,
    sequence: exact.sequence,
    width: exact.width,
    height: exact.height,
    blob: exact.blob as Blob,
  });
}

function parseNormalizedReferencePoint(value: unknown): StudioCompanionReferencePoint | null {
  const exact = exactOwnData(value, ["x", "y"]);
  if (
    exact === null
    || typeof exact.x !== "number"
    || !Number.isFinite(exact.x)
    || exact.x < 0
    || exact.x > 1
    || typeof exact.y !== "number"
    || !Number.isFinite(exact.y)
    || exact.y < 0
    || exact.y > 1
  ) return null;
  return Object.freeze({ x: exact.x, y: exact.y });
}

export function isStudioCompanionReferenceControl(
  value: unknown
): value is StudioCompanionReferenceControl {
  const base = exactOwnData(value, ["kind", "active"]);
  if (base?.kind === "reference-preview-demand") return typeof base.active === "boolean";

  const pick = exactOwnData(value, ["kind", "point", "referenceRevision", "sequence"]);
  return pick?.kind === "reference-pick-color"
    && parseNormalizedReferencePoint(pick.point) !== null
    && safePositiveInteger(pick.referenceRevision)
    && safePositiveInteger(pick.sequence);
}

export function canAcceptStudioCompanionReferencePickColor(
  control: unknown,
  expected: StudioCompanionReferencePickAcceptance
): control is Extract<StudioCompanionReferenceControl, { kind: "reference-pick-color" }> {
  const pick = exactOwnData(control, ["kind", "point", "referenceRevision", "sequence"]);
  const point = pick?.kind === "reference-pick-color"
    ? parseNormalizedReferencePoint(pick.point)
    : null;
  const acceptance = exactOwnData(expected, ["referenceRevision", "lastAcceptedSequence"]);
  return point !== null
    && safePositiveInteger(pick?.referenceRevision)
    && safePositiveInteger(pick?.sequence)
    && acceptance !== null
    && safePositiveInteger(acceptance.referenceRevision)
    && safeNonNegativeInteger(acceptance.lastAcceptedSequence)
    && pick.referenceRevision === acceptance.referenceRevision
    && pick.sequence > acceptance.lastAcceptedSequence;
}

export function canAcceptStudioCompanionReferencePreviewFrame(
  frame: unknown,
  expected: StudioCompanionReferenceFrameAcceptance
): frame is StudioCompanionReferencePreviewFrame {
  const parsedFrame = parseStudioCompanionReferencePreviewFrame(frame);
  if (!parsedFrame) return false;
  const exactExpected = exactOwnData(expected, [
    "generation",
    "revision",
    "referenceRevision",
    "lastAcceptedSequence",
  ]);
  return exactExpected !== null
    && safePositiveInteger(exactExpected.generation)
    && safePositiveInteger(exactExpected.revision)
    && safePositiveInteger(exactExpected.referenceRevision)
    && safeNonNegativeInteger(exactExpected.lastAcceptedSequence)
    && parsedFrame.generation === exactExpected.generation
    && parsedFrame.revision === exactExpected.revision
    && parsedFrame.referenceRevision === exactExpected.referenceRevision
    && parsedFrame.sequence > exactExpected.lastAcceptedSequence;
}

export function studioCompanionReferenceFailureBackoffMs(failureCount: number): number {
  if (!safePositiveInteger(failureCount)) return 0;
  return STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS[
    Math.min(failureCount, STUDIO_COMPANION_REFERENCE_FAILURE_BACKOFF_MS.length) - 1
  ];
}

function captureRecord(value: unknown): StudioCompanionReferenceCaptureRecord | null {
  const exact = exactOwnData(value, ["generation", "revision", "referenceRevision", "at"]);
  if (!exact || !isReferenceCursor({
    generation: exact.generation,
    revision: exact.revision,
    referenceRevision: exact.referenceRevision,
  }) || !finiteNonNegative(exact.at)) return null;
  return {
    generation: exact.generation as number,
    revision: exact.revision as number,
    referenceRevision: exact.referenceRevision as number,
    at: exact.at,
  };
}

function captureFailure(value: unknown): StudioCompanionReferenceCaptureFailure | null {
  const exact = exactOwnData(value, [
    "generation",
    "revision",
    "referenceRevision",
    "count",
    "at",
  ]);
  if (!exact || !isReferenceCursor({
    generation: exact.generation,
    revision: exact.revision,
    referenceRevision: exact.referenceRevision,
  }) || !safePositiveInteger(exact.count) || !finiteNonNegative(exact.at)) return null;
  return {
    generation: exact.generation as number,
    revision: exact.revision as number,
    referenceRevision: exact.referenceRevision as number,
    count: exact.count,
    at: exact.at,
  };
}

/**
 * Plans an at-most-2fps capture. Failed attempts back off by 500/1000/2000ms and stay capped at
 * 2000ms; a new generation or reference revision gets a fresh retry budget.
 */
export function planStudioCompanionReferenceCapture(
  input: StudioCompanionReferenceCapturePlanInput
): StudioCompanionReferenceCapturePlan {
  const exact = exactOwnData(input, [
    "demand",
    "current",
    "lastCaptured",
    "failure",
    "now",
    "activeStroke",
    "inFlight",
  ]);
  const current = exact ? parseReferenceCursor(exact.current) : null;
  if (
    !exact
    || typeof exact.demand !== "boolean"
    || !current
    || !finiteNonNegative(exact.now)
    || typeof exact.activeStroke !== "boolean"
    || typeof exact.inFlight !== "boolean"
  ) return { kind: "skip", reason: "invalid" };

  const lastCaptured = exact.lastCaptured === null ? null : captureRecord(exact.lastCaptured);
  const failure = exact.failure === null ? null : captureFailure(exact.failure);
  if (
    (exact.lastCaptured !== null && !lastCaptured)
    || (exact.failure !== null && !failure)
    || (lastCaptured !== null && (
      lastCaptured.generation > current.generation
      || (lastCaptured.generation === current.generation && (
        lastCaptured.revision > current.revision
        || lastCaptured.referenceRevision > current.referenceRevision
      ))
      || lastCaptured.at > exact.now
    ))
    || (failure !== null && (
      failure.generation > current.generation
      || (failure.generation === current.generation && (
        failure.revision > current.revision
        || failure.referenceRevision > current.referenceRevision
      ))
      || failure.at > exact.now
    ))
  ) return { kind: "skip", reason: "invalid" };

  if (!exact.demand) return { kind: "skip", reason: "no-demand" };
  if (exact.activeStroke) return { kind: "skip", reason: "active-stroke" };
  if (exact.inFlight) return { kind: "skip", reason: "in-flight" };
  if (lastCaptured && isSameCursor(current, lastCaptured)) {
    return { kind: "skip", reason: "clean" };
  }

  const cadenceRemaining = lastCaptured
    ? STUDIO_COMPANION_REFERENCE_MIN_CAPTURE_INTERVAL_MS - (exact.now - lastCaptured.at)
    : 0;
  const failureRemaining = failure && isSameCursor(current, failure)
    ? studioCompanionReferenceFailureBackoffMs(failure.count) - (exact.now - failure.at)
    : 0;
  const delayMs = Math.ceil(Math.max(0, cadenceRemaining, failureRemaining));
  return delayMs > 0 ? { kind: "defer", delayMs } : { kind: "capture" };
}

function cursorFromFrame(
  frame: StudioCompanionReferencePreviewFrame
): StudioCompanionReferenceObjectUrlHandle {
  return Object.freeze({
    url: "",
    generation: frame.generation,
    revision: frame.revision,
    referenceRevision: frame.referenceRevision,
    sequence: frame.sequence,
    width: frame.width,
    height: frame.height,
  });
}

function sameFrameCursor(
  left: StudioCompanionReferenceObjectUrlHandle,
  right: StudioCompanionReferenceObjectUrlHandle
): boolean {
  return left.generation === right.generation
    && left.revision === right.revision
    && left.referenceRevision === right.referenceRevision
    && left.sequence === right.sequence
    && left.width === right.width
    && left.height === right.height;
}

function isNewerFrameCursor(
  candidate: StudioCompanionReferenceObjectUrlHandle,
  baseline: StudioCompanionReferenceObjectUrlHandle
): boolean {
  if (candidate.generation !== baseline.generation) return candidate.generation > baseline.generation;
  return candidate.sequence > baseline.sequence
    && candidate.revision >= baseline.revision
    && candidate.referenceRevision >= baseline.referenceRevision;
}

/**
 * Owns at most one committed and one staged Blob URL. `stage` allocates a candidate, `commit`
 * atomically promotes it, and `reject` releases it while preserving the currently displayed URL.
 */
export class StudioCompanionReferenceObjectUrlOwner {
  private currentValue: StudioCompanionReferenceObjectUrlHandle | null = null;
  private pendingValue: StudioCompanionReferenceObjectUrlHandle | null = null;

  constructor(private readonly api: StudioCompanionReferenceObjectUrlApi = URL) {}

  current(): StudioCompanionReferenceObjectUrlHandle | null {
    return this.currentValue;
  }

  pending(): StudioCompanionReferenceObjectUrlHandle | null {
    return this.pendingValue;
  }

  ownedCount(): number {
    return Number(this.currentValue !== null) + Number(this.pendingValue !== null);
  }

  stage(frame: unknown): StudioCompanionReferenceObjectUrlHandle | null {
    const parsedFrame = parseStudioCompanionReferencePreviewFrame(frame);
    if (!parsedFrame) return null;
    const cursor = cursorFromFrame(parsedFrame);
    if (this.currentValue && !isNewerFrameCursor(cursor, this.currentValue)) return null;
    const previousPending = this.pendingValue;
    if (previousPending) {
      if (sameFrameCursor(cursor, previousPending)) return previousPending;
      if (!isNewerFrameCursor(cursor, previousPending)) return null;
      // With a committed URL, release first so allocation can never transiently own three URLs.
      // Without one, retain the sole usable candidate until replacement allocation succeeds.
      if (this.currentValue) this.releasePending();
    }

    let url: string;
    try {
      url = this.api.createObjectURL(parsedFrame.blob);
    } catch {
      return null;
    }
    if (
      typeof url !== "string"
      || url.length === 0
      || url.length > 2_048
      || !url.startsWith("blob:")
      || url === this.currentValue?.url
      || url === previousPending?.url
    ) {
      const retainedPendingAlias = !this.currentValue && url === previousPending?.url;
      if (
        typeof url === "string"
        && url
        && url !== this.currentValue?.url
        && !retainedPendingAlias
      ) this.safeRevoke(url);
      return null;
    }

    this.pendingValue = Object.freeze({ ...cursor, url });
    if (
      !this.currentValue
      && previousPending
      && previousPending.url !== this.pendingValue.url
    ) {
      this.safeRevoke(previousPending.url);
    }
    return this.pendingValue;
  }

  commit(
    handle: StudioCompanionReferenceObjectUrlHandle,
    naturalWidth: number,
    naturalHeight: number
  ): string | null {
    if (handle !== this.pendingValue) return null;
    if (
      !safePositiveInteger(naturalWidth)
      || !safePositiveInteger(naturalHeight)
      || naturalWidth !== handle.width
      || naturalHeight !== handle.height
    ) {
      this.releasePending();
      return null;
    }
    const previous = this.currentValue;
    this.pendingValue = null;
    this.currentValue = handle;
    if (previous && previous.url !== handle.url) this.safeRevoke(previous.url);
    return handle.url;
  }

  reject(handle: StudioCompanionReferenceObjectUrlHandle): boolean {
    if (handle !== this.pendingValue) return false;
    this.releasePending();
    return true;
  }

  clearStale(minimum: StudioCompanionReferenceCaptureCursor): number {
    const parsedMinimum = parseReferenceCursor(minimum);
    if (!parsedMinimum) return 0;
    let cleared = 0;
    const stale = (value: StudioCompanionReferenceObjectUrlHandle) => (
      value.generation < parsedMinimum.generation
      || (value.generation === parsedMinimum.generation && (
        value.revision < parsedMinimum.revision
        || value.referenceRevision < parsedMinimum.referenceRevision
      ))
    );
    if (this.pendingValue && stale(this.pendingValue)) {
      this.releasePending();
      cleared += 1;
    }
    if (this.currentValue && stale(this.currentValue)) {
      const current = this.currentValue;
      this.currentValue = null;
      this.safeRevoke(current.url);
      cleared += 1;
    }
    return cleared;
  }

  clear(): void {
    const pending = this.pendingValue;
    const current = this.currentValue;
    this.pendingValue = null;
    this.currentValue = null;
    if (pending) this.safeRevoke(pending.url);
    if (current && current.url !== pending?.url) this.safeRevoke(current.url);
  }

  private releasePending(): void {
    const pending = this.pendingValue;
    this.pendingValue = null;
    if (pending) this.safeRevoke(pending.url);
  }

  private safeRevoke(url: string): void {
    try {
      this.api.revokeObjectURL(url);
    } catch {
      // Ownership is cleared before revocation, so a browser-side failure cannot retain stale state.
    }
  }
}
