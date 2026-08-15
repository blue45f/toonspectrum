import {
  STUDIO_LIVE_GESTURE_PREVIEW_BLEND_MODES,
  STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE,
  STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE,
  STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS,
  STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
  parseStudioLiveGesturePreviewPayload,
  type StudioLiveGesturePreviewBrushDynamics,
  type StudioLiveGesturePreviewOperation,
  type StudioLiveGesturePreviewPayload,
  type StudioLiveGesturePreviewRendererSnapshot,
  type StudioLiveGesturePreviewSampleChannelKey,
  type StudioLiveGesturePreviewSamples,
  type StudioLiveGesturePreviewShape,
} from "./studio-live-gesture-preview";

import type { DrawEl } from "./studio-element-model";

export const STUDIO_LIVE_GESTURE_PREVIEW_PUBLISH_INTERVAL_MS = 40;

const PREVIEW_BLEND_MODE_SET: ReadonlySet<string> = new Set(
  STUDIO_LIVE_GESTURE_PREVIEW_BLEND_MODES,
);
const PREVIEW_DYNAMICS_PRESET_SET: ReadonlySet<string> = new Set([
  "ink-particle",
  "airbrush",
  "dry-media",
]);

export interface StudioLiveGesturePreviewPublisherScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface StudioLiveGesturePreviewPublisherOptions {
  /** Returns false when the collaboration room cannot accept the packet. */
  readonly publish: (payload: StudioLiveGesturePreviewPayload) => boolean;
  readonly scheduler?: StudioLiveGesturePreviewPublisherScheduler;
  readonly intervalMs?: number;
  readonly onError?: (cause: unknown) => void;
}

export interface StudioLiveGesturePreviewBeginInput {
  readonly pageId: string;
  readonly documentGeneration: number;
  readonly element: DrawEl;
}

interface ActiveGesture {
  readonly gestureId: string;
  readonly pageId: string;
  readonly operation: StudioLiveGesturePreviewOperation;
  readonly rendererFingerprint: string;
  readonly sampleChannelKeys: readonly StudioLiveGesturePreviewSampleChannelKey[];
  nextSeq: number;
  nextSampleIndex: number;
  lastSentAt: number;
  pendingElement: DrawEl | null;
  lastShapeFingerprint: string | null;
}

const DEFAULT_SCHEDULER: StudioLiveGesturePreviewPublisherScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function previewOperationOf(element: DrawEl): StudioLiveGesturePreviewOperation | null {
  const kind = element.kind ?? "freehand";
  if (kind !== "freehand") return element.mode === "eraser" ? null : "shape";
  if (element.mode === "eraser") return "erase";
  return element.fill === undefined ? "draw" : "lasso-fill";
}

function previewBrushDynamicsOf(
  element: DrawEl,
): StudioLiveGesturePreviewBrushDynamics | undefined {
  const source = element.brushDynamics;
  if (
    !source
    || source.version !== 1
    || typeof source.presetId !== "string"
    || !PREVIEW_DYNAMICS_PRESET_SET.has(source.presetId)
    || !Number.isSafeInteger(source.seed)
    || !finite(source.fallbackPressure)
  ) return undefined;

  return {
    version: 1,
    presetId: source.presetId as StudioLiveGesturePreviewBrushDynamics["presetId"],
    seed: source.seed,
    fallbackPressure: source.fallbackPressure,
    ...(source.minimumDiameterRatio === undefined
      ? {}
      : { minimumDiameterRatio: source.minimumDiameterRatio }),
    ...(source.spacingRatio === undefined ? {} : { spacingRatio: source.spacingRatio }),
    ...(source.scatterRatio === undefined ? {} : { scatterRatio: source.scatterRatio }),
  };
}

/**
 * Captures only renderer inputs covered by the strict v1 preview contract. Unsupported custom
 * assets and arbitrary engine extensions deliberately stay out of the ephemeral channel.
 */
export function studioLiveGesturePreviewRendererOf(
  element: DrawEl,
): StudioLiveGesturePreviewRendererSnapshot {
  const kind = element.kind ?? "freehand";
  const brushDynamics = previewBrushDynamicsOf(element);
  return {
    kind,
    mode: element.mode ?? "pen",
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
    ...(element.opacity === undefined ? {} : { opacity: element.opacity }),
    ...(element.fill === undefined ? {} : { fill: element.fill }),
    ...(element.brush === undefined ? {} : { brush: element.brush }),
    ...(element.brushCatalogId === undefined
      ? {}
      : { brushCatalogId: element.brushCatalogId }),
    ...(element.brushCatalogName === undefined
      ? {}
      : { brushCatalogName: element.brushCatalogName }),
    ...(element.sampleSpacing === undefined ? {} : { sampleSpacing: element.sampleSpacing }),
    ...(typeof element.blendMode === "string" && PREVIEW_BLEND_MODE_SET.has(element.blendMode)
      ? { blendMode: element.blendMode as StudioLiveGesturePreviewRendererSnapshot["blendMode"] }
      : {}),
    ...(element.paintModel === undefined ? {} : { paintModel: element.paintModel }),
    ...(element.pressureModel === undefined ? {} : { pressureModel: element.pressureModel }),
    ...(element.materialPressureModel === undefined
      ? {}
      : { materialPressureModel: element.materialPressureModel }),
    ...(element.materialMinimumDiameterRatio === undefined
      ? {}
      : { materialMinimumDiameterRatio: element.materialMinimumDiameterRatio }),
    ...(element.watercolorPipeline === undefined
      ? {}
      : { watercolorPipeline: element.watercolorPipeline }),
    ...(element.stampPipeline === undefined ? {} : { stampPipeline: element.stampPipeline }),
    ...(element.brushTip === undefined ? {} : { brushTip: { ...element.brushTip } }),
    ...(element.strokeStyle === undefined
      ? {}
      : { strokeStyle: { ...element.strokeStyle } }),
    ...(element.shapeParams === undefined
      ? {}
      : { shapeParams: { ...element.shapeParams } }),
    ...(element.sketch === undefined ? {} : { sketch: { ...element.sketch } }),
    ...(element.symmetry === undefined ? {} : { symmetry: { ...element.symmetry } }),
    ...(brushDynamics === undefined ? {} : { brushDynamics }),
  };
}

function shapeOf(element: DrawEl): StudioLiveGesturePreviewShape | null {
  const kind = element.kind ?? "freehand";
  if (kind === "freehand" || element.points.length < 4) return null;
  const [x0, y0, x1, y1] = element.points;
  if (![x0, y0, x1, y1].every(finite)) return null;
  return { kind, x0: x0!, y0: y0!, x1: x1!, y1: y1! };
}

function sampleChannelKeysOf(
  element: DrawEl,
  sampleCount: number,
): readonly StudioLiveGesturePreviewSampleChannelKey[] {
  return STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS.filter((key) => {
    const channel = element[key];
    return Array.isArray(channel) && channel.length >= sampleCount;
  });
}

function samplesOf(
  element: DrawEl,
  startIndex: number,
  endIndex: number,
  channelKeys: readonly StudioLiveGesturePreviewSampleChannelKey[],
): StudioLiveGesturePreviewSamples | null {
  if (
    startIndex < 0
    || endIndex <= startIndex
    || endIndex > Math.floor(element.points.length / 2)
  ) return null;
  const samples: Record<string, number | number[]> = {
    startIndex,
    points: element.points.slice(startIndex * 2, endIndex * 2),
  };
  for (const key of channelKeys) {
    const channel = element[key];
    if (!Array.isArray(channel) || channel.length < endIndex) return null;
    samples[key] = channel.slice(startIndex, endIndex);
  }
  return samples as unknown as StudioLiveGesturePreviewSamples;
}

function payloadFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function parsedPayload(value: unknown): StudioLiveGesturePreviewPayload | null {
  return parseStudioLiveGesturePreviewPayload(value);
}

function beginPayload(
  input: StudioLiveGesturePreviewBeginInput,
): {
  readonly payload: StudioLiveGesturePreviewPayload;
  readonly rendererFingerprint: string;
  readonly sampleChannelKeys: readonly StudioLiveGesturePreviewSampleChannelKey[];
  readonly sampleCount: number;
  readonly shapeFingerprint: string | null;
} | null {
  const operation = previewOperationOf(input.element);
  if (!operation) return null;
  const renderer = studioLiveGesturePreviewRendererOf(input.element);
  const rendererFingerprint = payloadFingerprint(renderer);
  const base = { documentGeneration: input.documentGeneration };

  if (operation === "shape") {
    const shape = shapeOf(input.element);
    if (!shape) return null;
    const payload = parsedPayload({
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: input.element.id,
      pageId: input.pageId,
      seq: 1,
      phase: "begin",
      operation,
      base,
      renderer,
      shape,
    });
    return payload
      ? {
          payload,
          rendererFingerprint,
          sampleChannelKeys: [],
          sampleCount: 0,
          shapeFingerprint: payloadFingerprint(shape),
        }
      : null;
  }

  const totalSamples = Math.floor(input.element.points.length / 2);
  if (totalSamples < 1 || totalSamples > STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE) {
    return null;
  }
  const sampleChannelKeys = sampleChannelKeysOf(input.element, totalSamples);
  let sampleCount = Math.min(totalSamples, STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE);
  while (sampleCount >= 1) {
    const samples = samplesOf(input.element, 0, sampleCount, sampleChannelKeys);
    const payload = samples
      ? parsedPayload({
          version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
          gestureId: input.element.id,
          pageId: input.pageId,
          seq: 1,
          phase: "begin",
          operation,
          base,
          renderer,
          samples,
        })
      : null;
    if (payload) {
      return {
        payload,
        rendererFingerprint,
        sampleChannelKeys,
        sampleCount,
        shapeFingerprint: null,
      };
    }
    if (sampleCount === 1) break;
    sampleCount = Math.max(1, Math.floor(sampleCount / 2));
  }
  return null;
}

/** Builds a validated, detached v1 begin packet without touching transport state. */
export function planStudioLiveGesturePreviewBegin(
  input: StudioLiveGesturePreviewBeginInput,
): StudioLiveGesturePreviewPayload | null {
  return beginPayload(input)?.payload ?? null;
}

/**
 * Bounded, gesture-local publisher. Cursor presence remains a separate channel; this class owns
 * its own 25 Hz coalescing clock and never emits overlapping sample tails.
 */
export class StudioLiveGesturePreviewPublisher {
  readonly #publish: (payload: StudioLiveGesturePreviewPayload) => boolean;
  readonly #scheduler: StudioLiveGesturePreviewPublisherScheduler;
  readonly #intervalMs: number;
  readonly #onError: (cause: unknown) => void;
  #active: ActiveGesture | null = null;
  #timer: unknown = null;
  #disposed = false;

  constructor(options: StudioLiveGesturePreviewPublisherOptions) {
    this.#publish = options.publish;
    this.#scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.#intervalMs = finite(options.intervalMs)
      ? Math.max(1, Math.trunc(options.intervalMs!))
      : STUDIO_LIVE_GESTURE_PREVIEW_PUBLISH_INTERVAL_MS;
    this.#onError = options.onError ?? (() => undefined);
  }

  get activeGestureId(): string | null {
    return this.#active?.gestureId ?? null;
  }

  begin(input: StudioLiveGesturePreviewBeginInput): boolean {
    if (this.#disposed) return false;
    if (this.#active) this.cancel();
    const plan = beginPayload(input);
    if (!plan || !this.#send(plan.payload)) return false;
    this.#active = {
      gestureId: input.element.id,
      pageId: input.pageId,
      operation: plan.payload.operation,
      rendererFingerprint: plan.rendererFingerprint,
      sampleChannelKeys: plan.sampleChannelKeys,
      nextSeq: 2,
      nextSampleIndex: plan.sampleCount,
      lastSentAt: this.#scheduler.now(),
      pendingElement: plan.sampleCount < Math.floor(input.element.points.length / 2)
        ? input.element
        : null,
      lastShapeFingerprint: plan.shapeFingerprint,
    };
    if (this.#active.pendingElement) this.#schedule();
    return true;
  }

  append(element: DrawEl, _startSample = 0): boolean {
    const active = this.#active;
    if (
      this.#disposed
      || !active
      || active.gestureId !== element.id
      || active.operation === "shape"
      || previewOperationOf(element) !== active.operation
    ) return false;
    if (!this.#rendererStillMatches(element, active)) return this.#abortMalformed();
    const sampleCount = Math.floor(element.points.length / 2);
    if (
      sampleCount < active.nextSampleIndex
      || sampleCount > STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE
      || !this.#channelsRemainAligned(element, active.sampleChannelKeys, sampleCount)
    ) return this.#abortMalformed();
    if (sampleCount === active.nextSampleIndex) return true;
    active.pendingElement = element;
    this.#schedule();
    return true;
  }

  replaceShape(element: DrawEl): boolean {
    const active = this.#active;
    if (
      this.#disposed
      || !active
      || active.gestureId !== element.id
      || active.operation !== "shape"
      || previewOperationOf(element) !== "shape"
    ) return false;
    if (!this.#rendererStillMatches(element, active) || !shapeOf(element)) {
      return this.#abortMalformed();
    }
    active.pendingElement = element;
    this.#schedule();
    return true;
  }

  /** Flushes the final authoritative suffix/shape before sending the bodyless end packet. */
  end(element?: DrawEl): boolean {
    const active = this.#active;
    if (!active || this.#disposed || (element && element.id !== active.gestureId)) return false;
    if (element) {
      const accepted = active.operation === "shape"
        ? this.replaceShape(element)
        : this.append(element, active.nextSampleIndex);
      if (!accepted) return false;
    }
    if (!this.flush()) return false;
    const current = this.#active;
    if (!current) return false;
    const payload = parsedPayload({
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: current.gestureId,
      pageId: current.pageId,
      seq: current.nextSeq,
      phase: "end",
      operation: current.operation,
    });
    const sent = payload ? this.#send(payload) : false;
    this.#clearActive();
    return sent;
  }

  cancel(gestureId?: string): boolean {
    const active = this.#active;
    if (!active || (gestureId && gestureId !== active.gestureId)) return false;
    this.#cancelTimer();
    const payload = parsedPayload({
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: active.gestureId,
      pageId: active.pageId,
      seq: active.nextSeq,
      phase: "cancel",
      operation: active.operation,
    });
    const sent = payload ? this.#send(payload) : false;
    this.#active = null;
    return sent;
  }

  flush(): boolean {
    this.#cancelTimer();
    const active = this.#active;
    if (!active || !active.pendingElement) return active !== null;
    const element = active.pendingElement;
    active.pendingElement = null;
    return active.operation === "shape"
      ? this.#flushShape(active, element)
      : this.#flushSamples(active, element);
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#active) this.cancel();
    this.#disposed = true;
    this.#cancelTimer();
  }

  #flushShape(active: ActiveGesture, element: DrawEl): boolean {
    const shape = shapeOf(element);
    if (!shape || !this.#rendererStillMatches(element, active)) return this.#abortMalformed();
    const fingerprint = payloadFingerprint(shape);
    if (fingerprint === active.lastShapeFingerprint) return true;
    const payload = parsedPayload({
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: active.gestureId,
      pageId: active.pageId,
      seq: active.nextSeq,
      phase: "replace",
      operation: "shape",
      shape,
    });
    if (!payload || !this.#send(payload)) return this.#dropAfterTransportFailure();
    active.nextSeq += 1;
    active.lastSentAt = this.#scheduler.now();
    active.lastShapeFingerprint = fingerprint;
    return true;
  }

  #flushSamples(active: ActiveGesture, element: DrawEl): boolean {
    if (!this.#rendererStillMatches(element, active)) return this.#abortMalformed();
    const totalSamples = Math.floor(element.points.length / 2);
    if (
      totalSamples < active.nextSampleIndex
      || totalSamples > STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE
      || !this.#channelsRemainAligned(element, active.sampleChannelKeys, totalSamples)
    ) return this.#abortMalformed();

    while (active.nextSampleIndex < totalSamples) {
      const startIndex = active.nextSampleIndex;
      let chunkSize = Math.min(
        STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE,
        totalSamples - startIndex,
      );
      let payload: StudioLiveGesturePreviewPayload | null = null;
      while (chunkSize >= 1) {
        const samples = samplesOf(
          element,
          startIndex,
          startIndex + chunkSize,
          active.sampleChannelKeys,
        );
        payload = samples
          ? parsedPayload({
              version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
              gestureId: active.gestureId,
              pageId: active.pageId,
              seq: active.nextSeq,
              phase: "append",
              operation: active.operation,
              samples,
            })
          : null;
        if (payload || chunkSize === 1) break;
        chunkSize = Math.max(1, Math.floor(chunkSize / 2));
      }
      if (!payload) return this.#abortMalformed();
      if (!this.#send(payload)) return this.#dropAfterTransportFailure();
      active.nextSeq += 1;
      active.nextSampleIndex += chunkSize;
      active.lastSentAt = this.#scheduler.now();
    }
    return true;
  }

  #rendererStillMatches(element: DrawEl, active: ActiveGesture): boolean {
    return payloadFingerprint(studioLiveGesturePreviewRendererOf(element))
      === active.rendererFingerprint;
  }

  #channelsRemainAligned(
    element: DrawEl,
    channelKeys: readonly StudioLiveGesturePreviewSampleChannelKey[],
    sampleCount: number,
  ): boolean {
    return channelKeys.every((key) => {
      const channel = element[key];
      return Array.isArray(channel) && channel.length >= sampleCount;
    });
  }

  #abortMalformed(): false {
    this.cancel();
    return false;
  }

  #dropAfterTransportFailure(): false {
    this.#clearActive();
    return false;
  }

  #send(payload: StudioLiveGesturePreviewPayload): boolean {
    try {
      return this.#publish(payload);
    } catch (cause) {
      this.#onError(cause);
      return false;
    }
  }

  #schedule(): void {
    if (this.#timer !== null || !this.#active) return;
    const delay = Math.max(
      0,
      this.#intervalMs - (this.#scheduler.now() - this.#active.lastSentAt),
    );
    this.#timer = this.#scheduler.setTimeout(() => {
      this.#timer = null;
      this.flush();
    }, delay);
  }

  #cancelTimer(): void {
    if (this.#timer === null) return;
    this.#scheduler.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #clearActive(): void {
    this.#cancelTimer();
    this.#active = null;
  }
}
