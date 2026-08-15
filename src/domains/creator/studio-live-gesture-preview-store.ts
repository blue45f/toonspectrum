import {
  STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE,
  STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS,
  STUDIO_LIVE_GESTURE_PREVIEW_LIMITS,
  copyStudioLiveGesturePreviewPayload,
  parseStudioLiveGesturePreviewPayload,
  type StudioLiveGesturePreviewBase,
  type StudioLiveGesturePreviewOperation,
  type StudioLiveGesturePreviewPayload,
  type StudioLiveGesturePreviewRendererSnapshot,
  type StudioLiveGesturePreviewRetouch,
  type StudioLiveGesturePreviewSamples,
  type StudioLiveGesturePreviewShape,
} from "./studio-live-gesture-preview";

export const STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS = 3_000;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_PEERS = 64;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_ACTIVE_GESTURES = 64;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_GESTURES_PER_PEER = 2;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_TOMBSTONES = 128;

const STUDIO_LIVE_GESTURE_PREVIEW_PRUNE_INTERVAL_MS = 1_000;

type StudioLiveGesturePreviewActivePhase = "begin" | "append" | "replace";

export interface StudioLiveGesturePreviewSnapshotEntry {
  readonly key: string;
  readonly senderSessionId: string;
  readonly gestureId: string;
  readonly pageId: string;
  readonly seq: number;
  readonly lastPhase: StudioLiveGesturePreviewActivePhase;
  readonly operation: StudioLiveGesturePreviewOperation;
  readonly base?: StudioLiveGesturePreviewBase;
  readonly renderer?: StudioLiveGesturePreviewRendererSnapshot;
  readonly samples?: StudioLiveGesturePreviewSamples;
  readonly shape?: StudioLiveGesturePreviewShape;
  readonly retouch?: StudioLiveGesturePreviewRetouch;
  readonly sampleCount: number;
  readonly updatedAt: number;
}

export type StudioLiveGesturePreviewSnapshot = readonly StudioLiveGesturePreviewSnapshotEntry[];

export type StudioLiveGesturePreviewRejectReason =
  | "invalid-payload"
  | "invalid-sender"
  | "inactive-page"
  | "missing-begin"
  | "sequence"
  | "identity"
  | "unexpected-phase"
  | "unaligned-suffix"
  | "channel-schema"
  | "retouch-schema"
  | "sample-cap"
  | "peer-cap"
  | "gesture-cap"
  | "peer-gesture-cap";

export type StudioLiveGesturePreviewApplyResult =
  | { readonly status: "applied" }
  | { readonly status: "duplicate" }
  | {
      readonly status: "rejected";
      readonly reason: StudioLiveGesturePreviewRejectReason;
    };

export interface StudioLiveGesturePreviewStoreLimits {
  readonly maxPeers: number;
  readonly maxActiveGestures: number;
  readonly maxGesturesPerPeer: number;
  readonly maxSamplesPerGesture: number;
  readonly maxTotalSamples: number;
  readonly maxTombstones: number;
}

export interface StudioLiveGesturePreviewStoreScheduler {
  now(): number;
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface StudioLiveGesturePreviewStoreOptions {
  /** Undefined accepts every page until the owner establishes a visible-page boundary. */
  readonly pageId?: string | null;
  readonly limits?: Partial<StudioLiveGesturePreviewStoreLimits>;
  readonly scheduler?: StudioLiveGesturePreviewStoreScheduler;
}

interface ActiveGesture {
  readonly snapshot: StudioLiveGesturePreviewSnapshotEntry;
  readonly lastPayloadFingerprint: string;
  readonly sampleChannelSchema: string | null;
}

interface GestureTombstone {
  readonly senderSessionId: string;
  readonly pageId: string;
  readonly seq: number;
  readonly payloadFingerprint: string;
  readonly updatedAt: number;
}

const EMPTY_GESTURE_PREVIEW_SNAPSHOT: StudioLiveGesturePreviewSnapshot = Object.freeze([]);

const DEFAULT_GESTURE_PREVIEW_LIMITS: StudioLiveGesturePreviewStoreLimits = Object.freeze({
  maxPeers: STUDIO_LIVE_GESTURE_PREVIEW_MAX_PEERS,
  maxActiveGestures: STUDIO_LIVE_GESTURE_PREVIEW_MAX_ACTIVE_GESTURES,
  maxGesturesPerPeer: STUDIO_LIVE_GESTURE_PREVIEW_MAX_GESTURES_PER_PEER,
  maxSamplesPerGesture: STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE,
  // A single malicious room cannot allocate the per-gesture maximum for every active peer.
  maxTotalSamples: STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE,
  maxTombstones: STUDIO_LIVE_GESTURE_PREVIEW_MAX_TOMBSTONES,
});

const DEFAULT_GESTURE_PREVIEW_SCHEDULER: StudioLiveGesturePreviewStoreScheduler = {
  now: () => Date.now(),
  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  clearInterval: (handle) => {
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
  },
};

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.trunc(value ?? fallback)));
}

function resolveLimits(
  overrides: Partial<StudioLiveGesturePreviewStoreLimits> | undefined,
): StudioLiveGesturePreviewStoreLimits {
  const maxActiveGestures = boundedPositiveInteger(
    overrides?.maxActiveGestures,
    DEFAULT_GESTURE_PREVIEW_LIMITS.maxActiveGestures,
    STUDIO_LIVE_GESTURE_PREVIEW_MAX_ACTIVE_GESTURES,
  );
  const maxSamplesPerGesture = boundedPositiveInteger(
    overrides?.maxSamplesPerGesture,
    DEFAULT_GESTURE_PREVIEW_LIMITS.maxSamplesPerGesture,
    STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE,
  );
  return Object.freeze({
    maxPeers: boundedPositiveInteger(
      overrides?.maxPeers,
      DEFAULT_GESTURE_PREVIEW_LIMITS.maxPeers,
      STUDIO_LIVE_GESTURE_PREVIEW_MAX_PEERS,
    ),
    maxActiveGestures,
    maxGesturesPerPeer: boundedPositiveInteger(
      overrides?.maxGesturesPerPeer,
      DEFAULT_GESTURE_PREVIEW_LIMITS.maxGesturesPerPeer,
      STUDIO_LIVE_GESTURE_PREVIEW_MAX_GESTURES_PER_PEER,
    ),
    maxSamplesPerGesture,
    maxTotalSamples: boundedPositiveInteger(
      overrides?.maxTotalSamples,
      DEFAULT_GESTURE_PREVIEW_LIMITS.maxTotalSamples,
      STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE * maxActiveGestures,
    ),
    maxTombstones: boundedPositiveInteger(
      overrides?.maxTombstones,
      DEFAULT_GESTURE_PREVIEW_LIMITS.maxTombstones,
      STUDIO_LIVE_GESTURE_PREVIEW_MAX_TOMBSTONES,
    ),
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJsonValue(child)]),
  );
}

function payloadFingerprint(payload: StudioLiveGesturePreviewPayload): string {
  return JSON.stringify(canonicalJsonValue(payload));
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 0x1f || (point >= 0x7f && point <= 0x9f)) return true;
  }
  return false;
}

export function studioLiveGesturePreviewKey(
  senderSessionId: string,
  gestureId: string,
): string {
  return `${senderSessionId.length}:${senderSessionId}${gestureId}`;
}

function sampleCount(samples: StudioLiveGesturePreviewSamples | undefined): number {
  return samples ? samples.points.length / 2 : 0;
}

function retouchSampleCount(retouch: StudioLiveGesturePreviewRetouch | undefined): number {
  return retouch ? retouch.points.length / 2 : 0;
}

function sampleChannelSchema(samples: StudioLiveGesturePreviewSamples): string {
  return STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS
    .filter((key) => samples[key] !== undefined)
    .join("|");
}

function appendSamples(
  current: StudioLiveGesturePreviewSamples | undefined,
  suffix: StudioLiveGesturePreviewSamples,
): StudioLiveGesturePreviewSamples {
  const next: Record<string, unknown> = {
    startIndex: 0,
    points: [...(current?.points ?? []), ...suffix.points],
  };
  for (const key of STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS) {
    const channel = suffix[key];
    if (channel === undefined) continue;
    next[key] = [...((current?.[key] as readonly number[] | undefined) ?? []), ...channel];
  }
  return deepFreeze(next as unknown as StudioLiveGesturePreviewSamples);
}

function sampleTimeSuffixIsMonotonic(
  current: StudioLiveGesturePreviewSamples | undefined,
  suffix: StudioLiveGesturePreviewSamples,
): boolean {
  const prior = current?.sampleTimeOffsets;
  const next = suffix.sampleTimeOffsets;
  if (!prior || prior.length === 0 || !next || next.length === 0) return true;
  return next[0]! >= prior[prior.length - 1]!;
}

function sameRetouchSchema(
  current: StudioLiveGesturePreviewRetouch,
  suffix: StudioLiveGesturePreviewRetouch,
): boolean {
  return current.tool === suffix.tool
    && current.radiusNorm === suffix.radiusNorm
    && current.strength === suffix.strength;
}

function appendRetouch(
  current: StudioLiveGesturePreviewRetouch | undefined,
  suffix: StudioLiveGesturePreviewRetouch,
): StudioLiveGesturePreviewRetouch {
  return deepFreeze({
    ...suffix,
    startIndex: 0,
    points: [...(current?.points ?? []), ...suffix.points],
  });
}

/**
 * Transport-neutral bounded reducer for ephemeral remote gesture previews.
 *
 * The store owns no React or room subscription. A future adapter may feed parsed transport events
 * into `apply`, reconcile presence/page boundaries, and use `subscribe/getSnapshot` as an external
 * store. Any sequence or suffix ambiguity removes the affected gesture instead of approximating it.
 */
export class StudioLiveGesturePreviewStore {
  private readonly active = new Map<string, ActiveGesture>();
  private readonly tombstones = new Map<string, GestureTombstone>();
  private readonly listeners = new Set<() => void>();
  private readonly limits: StudioLiveGesturePreviewStoreLimits;
  private readonly scheduler: StudioLiveGesturePreviewStoreScheduler;
  private snapshot: StudioLiveGesturePreviewSnapshot = EMPTY_GESTURE_PREVIEW_SNAPSHOT;
  private pruneTimer: unknown = null;
  private activePageId: string | null | undefined;

  constructor(options: StudioLiveGesturePreviewStoreOptions = {}) {
    this.activePageId = options.pageId;
    this.limits = resolveLimits(options.limits);
    this.scheduler = options.scheduler ?? DEFAULT_GESTURE_PREVIEW_SCHEDULER;
  }

  readonly getSnapshot = (): StudioLiveGesturePreviewSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      if (this.pruneExpired(this.scheduler.now())) this.publishSnapshot();
      this.pruneTimer = this.scheduler.setInterval(
        () => {
          if (this.pruneExpired(this.scheduler.now())) this.publishSnapshot();
        },
        STUDIO_LIVE_GESTURE_PREVIEW_PRUNE_INTERVAL_MS,
      );
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.pruneTimer !== null) {
        this.scheduler.clearInterval(this.pruneTimer);
        this.pruneTimer = null;
      }
    };
  };

  ingest(senderSessionId: string, value: unknown): StudioLiveGesturePreviewApplyResult {
    const payload = parseStudioLiveGesturePreviewPayload(value);
    if (!payload) return { status: "rejected", reason: "invalid-payload" };
    return this.apply(senderSessionId, payload);
  }

  apply(
    senderSessionId: string,
    input: StudioLiveGesturePreviewPayload,
  ): StudioLiveGesturePreviewApplyResult {
    if (
      senderSessionId.length === 0
      || senderSessionId.length > STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength
      || senderSessionId !== senderSessionId.trim()
      || containsControlCharacter(senderSessionId)
    ) {
      return { status: "rejected", reason: "invalid-sender" };
    }
    const now = this.scheduler.now();
    let visibleChanged = this.pruneExpired(now);
    const payload = deepFreeze(copyStudioLiveGesturePreviewPayload(input));
    const fingerprint = payloadFingerprint(payload);
    const key = studioLiveGesturePreviewKey(senderSessionId, payload.gestureId);
    const finish = (
      result: StudioLiveGesturePreviewApplyResult,
      changed = false,
    ): StudioLiveGesturePreviewApplyResult => {
      if (visibleChanged || changed) this.publishSnapshot();
      visibleChanged = false;
      return result;
    };
    const reject = (
      reason: StudioLiveGesturePreviewRejectReason,
    ): StudioLiveGesturePreviewApplyResult => {
      const changed = this.active.delete(key);
      this.addTombstone(key, {
        senderSessionId,
        pageId: payload.pageId,
        seq: payload.seq,
        payloadFingerprint: fingerprint,
        updatedAt: now,
      });
      return finish({ status: "rejected", reason }, changed);
    };

    const current = this.active.get(key);
    const tombstone = this.tombstones.get(key);
    if (current) {
      if (payload.seq === current.snapshot.seq) {
        return fingerprint === current.lastPayloadFingerprint
          ? finish({ status: "duplicate" })
          : reject("sequence");
      }
      if (payload.seq !== current.snapshot.seq + 1) return reject("sequence");
      if (
        payload.gestureId !== current.snapshot.gestureId
        || payload.pageId !== current.snapshot.pageId
        || payload.operation !== current.snapshot.operation
      ) return reject("identity");
      if (payload.phase === "begin") return reject("unexpected-phase");
    } else {
      if (tombstone) {
        if (
          payload.seq === tombstone.seq
          && fingerprint === tombstone.payloadFingerprint
        ) return finish({ status: "duplicate" });
        return finish({ status: "rejected", reason: "sequence" });
      }
      if (payload.phase !== "begin") return reject("missing-begin");
      if (payload.seq !== 1) return reject("sequence");
    }

    if (
      this.activePageId !== undefined
      && (this.activePageId === null || payload.pageId !== this.activePageId)
    ) return reject("inactive-page");

    if (payload.phase === "begin") {
      const senderAlreadyActive = [...this.active.values()].some(
        (gesture) => gesture.snapshot.senderSessionId === senderSessionId,
      );
      if (!senderAlreadyActive && this.activeSenderCount() >= this.limits.maxPeers) {
        return reject("peer-cap");
      }
      if (this.active.size >= this.limits.maxActiveGestures) return reject("gesture-cap");
      if (this.activeGestureCountForSender(senderSessionId) >= this.limits.maxGesturesPerPeer) {
        return reject("peer-gesture-cap");
      }
      if (payload.samples && payload.samples.startIndex !== 0) {
        return reject("unaligned-suffix");
      }
      if (payload.retouch && payload.retouch.startIndex !== 0) {
        return reject("unaligned-suffix");
      }
      const count = sampleCount(payload.samples) + retouchSampleCount(payload.retouch);
      if (!this.samplesFit(0, count)) return reject("sample-cap");
      const snapshot = deepFreeze({
        key,
        senderSessionId,
        gestureId: payload.gestureId,
        pageId: payload.pageId,
        seq: payload.seq,
        lastPhase: "begin" as const,
        operation: payload.operation,
        ...(payload.base ? { base: payload.base } : {}),
        ...(payload.renderer ? { renderer: payload.renderer } : {}),
        ...(payload.samples ? { samples: payload.samples } : {}),
        ...(payload.shape ? { shape: payload.shape } : {}),
        ...(payload.retouch ? { retouch: payload.retouch } : {}),
        sampleCount: count,
        updatedAt: now,
      });
      this.active.set(key, {
        snapshot,
        lastPayloadFingerprint: fingerprint,
        sampleChannelSchema: payload.samples ? sampleChannelSchema(payload.samples) : null,
      });
      return finish({ status: "applied" }, true);
    }

    if (!current) return reject("missing-begin");

    if (payload.phase === "append") {
      if (payload.samples) {
        if (current.snapshot.shape || current.snapshot.retouch) return reject("identity");
        if (payload.samples.startIndex !== current.snapshot.sampleCount) {
          return reject("unaligned-suffix");
        }
        const schema = sampleChannelSchema(payload.samples);
        if (
          current.sampleChannelSchema !== null
          && schema !== current.sampleChannelSchema
        ) return reject("channel-schema");
        if (!sampleTimeSuffixIsMonotonic(current.snapshot.samples, payload.samples)) {
          return reject("unaligned-suffix");
        }
        const nextCount = current.snapshot.sampleCount + sampleCount(payload.samples);
        if (!this.samplesFit(current.snapshot.sampleCount, nextCount)) {
          return reject("sample-cap");
        }
        const samples = appendSamples(current.snapshot.samples, payload.samples);
        const snapshot = deepFreeze({
          ...current.snapshot,
          seq: payload.seq,
          lastPhase: "append" as const,
          samples,
          sampleCount: nextCount,
          updatedAt: now,
        });
        this.active.set(key, {
          snapshot,
          lastPayloadFingerprint: fingerprint,
          sampleChannelSchema: current.sampleChannelSchema ?? schema,
        });
        return finish({ status: "applied" }, true);
      }

      if (payload.retouch) {
        if (current.snapshot.shape || current.snapshot.samples) return reject("identity");
        if (payload.retouch.startIndex !== current.snapshot.sampleCount) {
          return reject("unaligned-suffix");
        }
        if (
          current.snapshot.retouch
          && !sameRetouchSchema(current.snapshot.retouch, payload.retouch)
        ) return reject("retouch-schema");
        const nextCount = current.snapshot.sampleCount + retouchSampleCount(payload.retouch);
        if (!this.samplesFit(current.snapshot.sampleCount, nextCount)) {
          return reject("sample-cap");
        }
        const retouch = appendRetouch(current.snapshot.retouch, payload.retouch);
        const snapshot = deepFreeze({
          ...current.snapshot,
          seq: payload.seq,
          lastPhase: "append" as const,
          retouch,
          sampleCount: nextCount,
          updatedAt: now,
        });
        this.active.set(key, {
          snapshot,
          lastPayloadFingerprint: fingerprint,
          sampleChannelSchema: null,
        });
        return finish({ status: "applied" }, true);
      }

      return reject("unexpected-phase");
    }

    if (payload.phase === "replace") {
      if (!payload.shape || !current.snapshot.shape) return reject("unexpected-phase");
      if (payload.shape.kind !== current.snapshot.shape.kind) return reject("identity");
      const snapshot = deepFreeze({
        ...current.snapshot,
        seq: payload.seq,
        lastPhase: "replace" as const,
        shape: payload.shape,
        updatedAt: now,
      });
      this.active.set(key, {
        snapshot,
        lastPayloadFingerprint: fingerprint,
        sampleChannelSchema: null,
      });
      return finish({ status: "applied" }, true);
    }

    this.active.delete(key);
    this.addTombstone(key, {
      senderSessionId,
      pageId: payload.pageId,
      seq: payload.seq,
      payloadFingerprint: fingerprint,
      updatedAt: now,
    });
    return finish({ status: "applied" }, true);
  }

  /** Drops previews and tombstones for peers no longer present in the room. */
  retainPresentSenders(senderSessionIds: Iterable<string>): number {
    const retained = new Set(senderSessionIds);
    let removed = 0;
    for (const [key, gesture] of this.active) {
      if (retained.has(gesture.snapshot.senderSessionId)) continue;
      this.active.delete(key);
      removed += 1;
    }
    for (const [key, tombstone] of this.tombstones) {
      if (!retained.has(tombstone.senderSessionId)) this.tombstones.delete(key);
    }
    if (removed > 0) this.publishSnapshot();
    return removed;
  }

  /** Clears stale-page previews atomically when the viewport follows another page. */
  setActivePage(pageId: string | null): number {
    if (this.activePageId === pageId) return 0;
    this.activePageId = pageId;
    let removed = 0;
    for (const [key, gesture] of this.active) {
      if (pageId !== null && gesture.snapshot.pageId === pageId) continue;
      this.active.delete(key);
      removed += 1;
    }
    for (const [key, tombstone] of this.tombstones) {
      if (pageId !== null && tombstone.pageId === pageId) continue;
      this.tombstones.delete(key);
    }
    if (removed > 0) this.publishSnapshot();
    return removed;
  }

  /** A non-ready transport cannot keep destructive or paint previews on screen. */
  clearForTransportLoss(): number {
    const removed = this.active.size;
    this.active.clear();
    this.tombstones.clear();
    if (removed > 0) this.publishSnapshot();
    return removed;
  }

  dispose(): void {
    if (this.pruneTimer !== null) this.scheduler.clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    this.listeners.clear();
    this.active.clear();
    this.tombstones.clear();
    this.snapshot = EMPTY_GESTURE_PREVIEW_SNAPSHOT;
  }

  private samplesFit(currentGestureSamples: number, nextGestureSamples: number): boolean {
    if (nextGestureSamples > this.limits.maxSamplesPerGesture) return false;
    let total = 0;
    for (const gesture of this.active.values()) total += gesture.snapshot.sampleCount;
    return total - currentGestureSamples + nextGestureSamples <= this.limits.maxTotalSamples;
  }

  private activeSenderCount(): number {
    return new Set(
      [...this.active.values()].map((gesture) => gesture.snapshot.senderSessionId),
    ).size;
  }

  private activeGestureCountForSender(senderSessionId: string): number {
    let count = 0;
    for (const gesture of this.active.values()) {
      if (gesture.snapshot.senderSessionId === senderSessionId) count += 1;
    }
    return count;
  }

  private addTombstone(key: string, tombstone: GestureTombstone): void {
    this.tombstones.delete(key);
    this.tombstones.set(key, tombstone);
    while (this.tombstones.size > this.limits.maxTombstones) {
      const oldestKey = this.tombstones.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.tombstones.delete(oldestKey);
    }
  }

  private pruneExpired(now: number): boolean {
    let changed = false;
    for (const [key, gesture] of this.active) {
      if (now - gesture.snapshot.updatedAt <= STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS) continue;
      this.active.delete(key);
      this.addTombstone(key, {
        senderSessionId: gesture.snapshot.senderSessionId,
        pageId: gesture.snapshot.pageId,
        seq: gesture.snapshot.seq,
        payloadFingerprint: gesture.lastPayloadFingerprint,
        updatedAt: now,
      });
      changed = true;
    }
    for (const [key, tombstone] of this.tombstones) {
      if (now - tombstone.updatedAt > STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS) {
        this.tombstones.delete(key);
      }
    }
    return changed;
  }

  private publishSnapshot(): void {
    this.snapshot = this.active.size === 0
      ? EMPTY_GESTURE_PREVIEW_SNAPSHOT
      : Object.freeze([...this.active.values()].map((gesture) => gesture.snapshot));
    for (const listener of [...this.listeners]) listener();
  }
}
