/**
 * Primary-owned reference-board compositor for detached Studio companions.
 *
 * Callers provide only already-decoded drawables and, optionally, copied RGBA pixels. Editable
 * reference records and source metadata are never serialized or transported to the companion.
 * A frame is rendered into a private staging canvas and is returned only after every resolved item
 * succeeds, so a failed draw can never publish a partially composited board.
 */

import {
  STUDIO_COMPANION_REFERENCE_MAX_BYTES,
  STUDIO_COMPANION_REFERENCE_MAX_EDGE,
  STUDIO_COMPANION_REFERENCE_MAX_ITEMS,
  STUDIO_COMPANION_REFERENCE_MAX_PIXELS,
  isStudioCompanionReferencePreviewFrame,
  type StudioCompanionReferencePoint,
  type StudioCompanionReferencePreviewFrame,
} from "./studio-companion-reference-projection";
import {
  STUDIO_REFERENCE_BOARD_MAX_MEDIA_DIMENSION,
  STUDIO_REFERENCE_BOARD_MAX_ZOOM,
  STUDIO_REFERENCE_BOARD_MIN_ZOOM,
} from "./studio-reference-board";
import {
  STUDIO_REFERENCE_COLOR_MAX_DECODED_PIXELS,
  mapStudioReferenceBoardPointToSourcePixel,
  sampleStudioReferenceRasterPixel,
  studioReferenceItemFramePercent,
} from "./studio-reference-color-sampler";

export const STUDIO_COMPANION_REFERENCE_WEBP_QUALITIES = [0.86, 0.7, 0.54] as const;
export const STUDIO_COMPANION_REFERENCE_WEBP_RESIZE_SCALE = 0.78;
export const STUDIO_COMPANION_REFERENCE_WEBP_MAX_RESIZE_PASSES = 3;
export const STUDIO_COMPANION_REFERENCE_WEBP_DEFAULT_TIMEOUT_MS = 1_500;
export const STUDIO_COMPANION_REFERENCE_MAX_RGBA_BYTES = 32 * 1024 * 1024;

export interface StudioCompanionReferencePreviewSource {
  /** A decoded CanvasImageSource-like object. Strings and source URLs are rejected at runtime. */
  drawable: object;
  /** Intrinsic drawable dimensions. */
  width: number;
  height: number;
  /** Optional authoritative RGBA copy used by the primary-side color picker. */
  pixels?: Uint8ClampedArray;
  /** Optional aspect hint matching the reference document descriptor. Both values are required. */
  layoutWidth?: number;
  layoutHeight?: number;
}

export interface StudioCompanionReferencePreviewItemView {
  centerX: number;
  centerY: number;
  zoom: number;
  rotationDeg: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  grayscale: boolean;
}

export interface StudioCompanionReferencePreviewItem {
  /** `null` means that the primary could not resolve this item; unresolved items are skipped. */
  source: StudioCompanionReferencePreviewSource | null;
  view: StudioCompanionReferencePreviewItemView;
}

export interface StudioCompanionReferencePreviewContext {
  globalAlpha: number;
  filter: string;
  imageSmoothingEnabled: boolean;
  clearRect(x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  drawImage(image: unknown, dx: number, dy: number, dWidth: number, dHeight: number): void;
}

export interface StudioCompanionReferencePreviewCanvas {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: { alpha?: boolean }
  ): StudioCompanionReferencePreviewContext | null;
  convertToBlob?(options?: { type?: string; quality?: number }): Promise<Blob>;
  toBlob?(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export type StudioCompanionReferencePreviewCanvasFactory = (
  width: number,
  height: number
) => StudioCompanionReferencePreviewCanvas;

export type StudioCompanionReferencePreviewEncoder = (
  canvas: StudioCompanionReferencePreviewCanvas,
  options: { type: "image/webp"; quality: number }
) => Blob | null | Promise<Blob | null>;

export interface StudioCompanionReferencePreviewClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface StudioCompanionReferencePreviewDependencies {
  createCanvas?: StudioCompanionReferencePreviewCanvasFactory;
  encodeCanvas?: StudioCompanionReferencePreviewEncoder;
  clock?: StudioCompanionReferencePreviewClock;
}

export interface StudioCompanionReferencePreviewInput {
  boardWidth: number;
  boardHeight: number;
  /** Back-to-front z-order, matching the reference-board document. */
  items: readonly StudioCompanionReferencePreviewItem[];
}

export interface StudioCompanionReferenceRenderedPreview {
  canvas: StudioCompanionReferencePreviewCanvas;
  width: number;
  height: number;
  resolvedItemCount: number;
}

export interface StudioCompanionReferenceEncodedPreview {
  blob: Blob;
  width: number;
  height: number;
  resolvedItemCount: number;
}

export interface StudioCompanionReferencePreviewEncodeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A stricter test/product budget may be supplied, but never one above the transport limit. */
  maximumBytes?: number;
}

export interface StudioCompanionReferencePreviewFrameInput
  extends StudioCompanionReferencePreviewInput {
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
}

type ParsedReferenceItem = Readonly<{
  source: StudioCompanionReferencePreviewSource;
  view: StudioCompanionReferencePreviewItemView;
}>;

type ParsedReferenceSource = Readonly<{
  source: StudioCompanionReferencePreviewSource;
  rgbaBytes: number;
}>;

type EncodeAttempt =
  | { kind: "done"; blob: Blob | null }
  | { kind: "failed" }
  | { kind: "stopped" };

type WebpBlobState =
  | { kind: "accepted"; blob: Blob }
  | { kind: "oversize" }
  | { kind: "invalid" };

const ITEM_KEYS = ["source", "view"] as const;
const VIEW_KEYS = [
  "centerX",
  "centerY",
  "zoom",
  "rotationDeg",
  "flipX",
  "flipY",
  "opacity",
  "grayscale",
] as const;
const SOURCE_REQUIRED_KEYS = ["drawable", "width", "height"] as const;
const SOURCE_OPTIONAL_KEYS = ["pixels", "layoutWidth", "layoutHeight"] as const;
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function safePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function finiteUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function plainOwnData(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      requiredKeys.some((key) => !ownKeys.includes(key))
      || ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key))
    ) return null;

    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of ownKeys) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function denseArrayValues(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    if (!Number.isSafeInteger(value.length) || value.length > STUDIO_COMPANION_REFERENCE_MAX_ITEMS) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== value.length + 1
      || ownKeys.some((key) => {
        if (key === "length") return false;
        if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) return true;
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || index >= value.length;
      })
    ) return null;

    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function parseView(value: unknown): StudioCompanionReferencePreviewItemView | null {
  const exact = plainOwnData(value, VIEW_KEYS);
  if (
    !exact
    || !finiteUnit(exact.centerX)
    || !finiteUnit(exact.centerY)
    || !finitePositive(exact.zoom)
    || exact.zoom < STUDIO_REFERENCE_BOARD_MIN_ZOOM
    || exact.zoom > STUDIO_REFERENCE_BOARD_MAX_ZOOM
    || typeof exact.rotationDeg !== "number"
    || !Number.isFinite(exact.rotationDeg)
    || exact.rotationDeg < -180
    || exact.rotationDeg >= 180
    || typeof exact.flipX !== "boolean"
    || typeof exact.flipY !== "boolean"
    || !finiteUnit(exact.opacity)
    || typeof exact.grayscale !== "boolean"
  ) return null;
  return Object.freeze({
    centerX: exact.centerX,
    centerY: exact.centerY,
    zoom: exact.zoom,
    rotationDeg: exact.rotationDeg,
    flipX: exact.flipX,
    flipY: exact.flipY,
    opacity: exact.opacity,
    grayscale: exact.grayscale,
  });
}

function inspectUint8ClampedArray(
  value: unknown,
  expectedLength: number,
  copy: boolean
): { snapshot?: Uint8ClampedArray } | null {
  try {
    if (!(value instanceof Uint8ClampedArray)) return null;
    const typedArrayPrototype = Object.getPrototypeOf(Uint8ClampedArray.prototype) as object;
    const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
    const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
    if (!lengthGetter || !bufferGetter) return null;
    const length = Reflect.apply(lengthGetter, value, []) as unknown;
    const buffer = Reflect.apply(bufferGetter, value, []) as unknown;
    if (
      length !== expectedLength
      || (typeof SharedArrayBuffer === "function" && buffer instanceof SharedArrayBuffer)
    ) return null;
    if (!copy) return {};
    const snapshot = new Uint8ClampedArray(expectedLength);
    Reflect.apply(Uint8ClampedArray.prototype.set, snapshot, [value, 0]);
    return { snapshot };
  } catch {
    return null;
  }
}

function parseSource(
  value: unknown,
  remainingRgbaBytes: number,
  copyPixels: boolean
): ParsedReferenceSource | null {
  const exact = plainOwnData(value, SOURCE_REQUIRED_KEYS, SOURCE_OPTIONAL_KEYS);
  if (
    !exact
    || !exact.drawable
    || typeof exact.drawable !== "object"
    || !safePositiveInteger(exact.width)
    || !safePositiveInteger(exact.height)
    || exact.width > STUDIO_REFERENCE_BOARD_MAX_MEDIA_DIMENSION
    || exact.height > STUDIO_REFERENCE_BOARD_MAX_MEDIA_DIMENSION
  ) return null;

  const hasLayoutWidth = Object.hasOwn(exact, "layoutWidth");
  const hasLayoutHeight = Object.hasOwn(exact, "layoutHeight");
  if (hasLayoutWidth !== hasLayoutHeight) return null;
  if (
    hasLayoutWidth
    && (
      !safePositiveInteger(exact.layoutWidth)
      || !safePositiveInteger(exact.layoutHeight)
      || exact.layoutWidth > STUDIO_REFERENCE_BOARD_MAX_MEDIA_DIMENSION
      || exact.layoutHeight > STUDIO_REFERENCE_BOARD_MAX_MEDIA_DIMENSION
    )
  ) return null;

  let pixels: Uint8ClampedArray | undefined;
  if (Object.hasOwn(exact, "pixels")) {
    const pixelCount = exact.width * exact.height;
    if (
      !Number.isSafeInteger(pixelCount)
      || pixelCount > STUDIO_REFERENCE_COLOR_MAX_DECODED_PIXELS
      || pixelCount * 4 > remainingRgbaBytes
    ) return null;
    const inspected = inspectUint8ClampedArray(exact.pixels, pixelCount * 4, copyPixels);
    if (!inspected) return null;
    pixels = inspected.snapshot;
  }
  const rgbaBytes = Object.hasOwn(exact, "pixels") ? exact.width * exact.height * 4 : 0;
  return Object.freeze({
    source: Object.freeze({
      drawable: exact.drawable as object,
      width: exact.width,
      height: exact.height,
      ...(pixels === undefined ? {} : { pixels }),
      ...(hasLayoutWidth
        ? { layoutWidth: exact.layoutWidth as number, layoutHeight: exact.layoutHeight as number }
        : {}),
    }),
    rgbaBytes,
  });
}

function parseResolvedItems(
  value: unknown,
  options: { copyPixels: boolean }
): ParsedReferenceItem[] | null {
  const candidates = denseArrayValues(value);
  if (!candidates) return null;
  const output: ParsedReferenceItem[] = [];
  let rgbaBytes = 0;
  for (const candidate of candidates) {
    const item = plainOwnData(candidate, ITEM_KEYS);
    if (!item) return null;
    if (item.source === null) continue;
    const parsedSource = parseSource(
      item.source,
      STUDIO_COMPANION_REFERENCE_MAX_RGBA_BYTES - rgbaBytes,
      options.copyPixels
    );
    const view = parseView(item.view);
    if (!parsedSource || !view) return null;
    rgbaBytes += parsedSource.rgbaBytes;
    if (!Number.isSafeInteger(rgbaBytes) || rgbaBytes > STUDIO_COMPANION_REFERENCE_MAX_RGBA_BYTES) {
      return null;
    }
    output.push(Object.freeze({ source: parsedSource.source, view }));
  }
  return output;
}

/** Fits an output size inside both the longest-edge and decoded-pixel transport budgets. */
export function fitStudioCompanionReferencePreviewDimensions(
  width: number,
  height: number
): { width: number; height: number } | null {
  if (!finitePositive(width) || !finitePositive(height)) return null;
  const roundedWidth = Math.max(1, Math.round(width));
  const roundedHeight = Math.max(1, Math.round(height));
  if (!Number.isSafeInteger(roundedWidth) || !Number.isSafeInteger(roundedHeight)) return null;
  const scale = Math.min(
    1,
    STUDIO_COMPANION_REFERENCE_MAX_EDGE / Math.max(roundedWidth, roundedHeight),
    Math.sqrt(STUDIO_COMPANION_REFERENCE_MAX_PIXELS / (roundedWidth * roundedHeight))
  );
  if (!finitePositive(scale)) return null;
  let fittedWidth = Math.max(1, Math.floor(roundedWidth * scale));
  let fittedHeight = Math.max(1, Math.floor(roundedHeight * scale));
  while (fittedWidth * fittedHeight > STUDIO_COMPANION_REFERENCE_MAX_PIXELS) {
    if (fittedWidth >= fittedHeight) fittedWidth -= 1;
    else fittedHeight -= 1;
  }
  return { width: fittedWidth, height: fittedHeight };
}

function defaultCanvasFactory(
  width: number,
  height: number
): StudioCompanionReferencePreviewCanvas {
  const offscreenConstructor = globalThis.OffscreenCanvas;
  if (typeof offscreenConstructor === "function") {
    return new offscreenConstructor(width, height) as StudioCompanionReferencePreviewCanvas;
  }
  const documentHost = globalThis.document;
  if (!documentHost) throw new Error("Reference preview canvas is unavailable");
  const canvas = documentHost.createElement("canvas") as StudioCompanionReferencePreviewCanvas;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createSizedCanvas(
  width: number,
  height: number,
  factory: StudioCompanionReferencePreviewCanvasFactory
): StudioCompanionReferencePreviewCanvas | null {
  try {
    const canvas = factory(width, height);
    if (!canvas || typeof canvas !== "object") return null;
    canvas.width = width;
    canvas.height = height;
    return canvas.width === width && canvas.height === height ? canvas : null;
  } catch {
    return null;
  }
}

function safeContext(
  canvas: StudioCompanionReferencePreviewCanvas,
  alpha: boolean
): StudioCompanionReferencePreviewContext | null {
  try {
    const context = canvas.getContext("2d", { alpha });
    if (
      !context
      || typeof context.clearRect !== "function"
      || typeof context.save !== "function"
      || typeof context.restore !== "function"
      || typeof context.translate !== "function"
      || typeof context.rotate !== "function"
      || typeof context.scale !== "function"
      || typeof context.drawImage !== "function"
    ) return null;
    return context;
  } catch {
    return null;
  }
}

function restoreContext(context: StudioCompanionReferencePreviewContext): boolean {
  try {
    context.restore();
    return true;
  } catch {
    return false;
  }
}

/** Renders a bounded private staging canvas, or returns null without exposing a partial result. */
export function renderStudioCompanionReferencePreview(
  input: StudioCompanionReferencePreviewInput,
  dependencies: Pick<StudioCompanionReferencePreviewDependencies, "createCanvas"> = {}
): StudioCompanionReferenceRenderedPreview | null {
  const exact = plainOwnData(input, ["boardWidth", "boardHeight", "items"]);
  if (!exact) return null;
  const dimensions = fitStudioCompanionReferencePreviewDimensions(
    exact.boardWidth as number,
    exact.boardHeight as number
  );
  const items = parseResolvedItems(exact.items, { copyPixels: false });
  if (!dimensions || !items || items.length === 0) return null;

  const canvas = createSizedCanvas(
    dimensions.width,
    dimensions.height,
    dependencies.createCanvas ?? defaultCanvasFactory
  );
  if (!canvas) return null;
  const context = safeContext(canvas, true);
  if (!context) return null;

  try {
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.imageSmoothingEnabled = true;
  } catch {
    return null;
  }

  for (const { source, view } of items) {
    const layoutWidth = source.layoutWidth ?? source.width;
    const layoutHeight = source.layoutHeight ?? source.height;
    const framePercent = studioReferenceItemFramePercent(layoutWidth, layoutHeight);
    const frameWidth = dimensions.width * framePercent.width / 100;
    const frameHeight = dimensions.height * framePercent.height / 100;
    const containScale = Math.min(frameWidth / source.width, frameHeight / source.height);
    const renderedWidth = source.width * containScale;
    const renderedHeight = source.height * containScale;
    if (!finitePositive(renderedWidth) || !finitePositive(renderedHeight)) return null;

    try {
      context.save();
    } catch {
      return null;
    }
    let succeeded: boolean;
    try {
      context.globalAlpha = view.opacity;
      context.filter = view.grayscale ? "grayscale(1)" : "none";
      context.translate(view.centerX * dimensions.width, view.centerY * dimensions.height);
      context.rotate(view.rotationDeg * Math.PI / 180);
      context.scale(
        view.zoom * (view.flipX ? -1 : 1),
        view.zoom * (view.flipY ? -1 : 1)
      );
      context.drawImage(
        source.drawable,
        -renderedWidth / 2,
        -renderedHeight / 2,
        renderedWidth,
        renderedHeight
      );
      succeeded = true;
    } catch {
      succeeded = false;
    }
    if (!restoreContext(context) || !succeeded) return null;
  }

  return {
    canvas,
    width: dimensions.width,
    height: dimensions.height,
    resolvedItemCount: items.length,
  };
}

function defaultClock(): StudioCompanionReferencePreviewClock {
  return {
    now: () => globalThis.performance?.now?.() ?? Date.now(),
    schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    cancel: (handle) => globalThis.clearTimeout(
      handle as ReturnType<typeof globalThis.setTimeout>
    ),
  };
}

function defaultEncodeCanvas(
  canvas: StudioCompanionReferencePreviewCanvas,
  options: { type: "image/webp"; quality: number }
): Promise<Blob | null> {
  if (typeof canvas.convertToBlob === "function") {
    try {
      return Promise.resolve(canvas.convertToBlob(options));
    } catch {
      return Promise.resolve(null);
    }
  }
  if (typeof canvas.toBlob !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      canvas.toBlob?.(resolve, options.type, options.quality);
    } catch {
      resolve(null);
    }
  });
}

function boundedTimeout(value: number | undefined): number {
  if (!finitePositive(value)) return STUDIO_COMPANION_REFERENCE_WEBP_DEFAULT_TIMEOUT_MS;
  return Math.min(5_000, Math.max(25, Math.round(value)));
}

function boundedMaximumBytes(value: number | undefined): number {
  if (!safePositiveInteger(value)) return STUDIO_COMPANION_REFERENCE_MAX_BYTES;
  return Math.min(STUDIO_COMPANION_REFERENCE_MAX_BYTES, value);
}

function clockNow(clock: StudioCompanionReferencePreviewClock): number | null {
  try {
    const value = clock.now();
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function runEncodeAttempt(
  canvas: StudioCompanionReferencePreviewCanvas,
  quality: number,
  encode: StudioCompanionReferencePreviewEncoder,
  clock: StudioCompanionReferencePreviewClock,
  delayMs: number,
  signal: AbortSignal | undefined
): Promise<EncodeAttempt> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: unknown;
    const finish = (result: EncodeAttempt) => {
      if (settled) return;
      settled = true;
      try {
        clock.cancel(timer);
      } catch {
        // Timer ownership is already released from this attempt.
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish({ kind: "stopped" });
    if (signal?.aborted) {
      finish({ kind: "stopped" });
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      timer = clock.schedule(() => finish({ kind: "stopped" }), delayMs);
      Promise.resolve(encode(canvas, { type: "image/webp", quality })).then(
        (blob) => finish({ kind: "done", blob }),
        () => finish({ kind: "failed" })
      );
    } catch {
      finish({ kind: "failed" });
    }
  });
}

function inspectWebpBlob(value: unknown, maximumBytes: number): WebpBlobState {
  const blobConstructor = globalThis.Blob;
  try {
    if (typeof blobConstructor !== "function" || !(value instanceof blobConstructor)) {
      return { kind: "invalid" };
    }
    const sizeGetter = Object.getOwnPropertyDescriptor(blobConstructor.prototype, "size")?.get;
    const typeGetter = Object.getOwnPropertyDescriptor(blobConstructor.prototype, "type")?.get;
    if (!sizeGetter || !typeGetter) return { kind: "invalid" };
    const size = Reflect.apply(sizeGetter, value, []) as unknown;
    const type = Reflect.apply(typeGetter, value, []) as unknown;
    if (typeof size !== "number" || typeof type !== "string" || type !== "image/webp" || size <= 0) {
      return { kind: "invalid" };
    }
    return size <= maximumBytes
      ? { kind: "accepted", blob: value }
      : { kind: "oversize" };
  } catch {
    return { kind: "invalid" };
  }
}

function resizeRenderedPreview(
  source: StudioCompanionReferenceRenderedPreview,
  width: number,
  height: number,
  factory: StudioCompanionReferencePreviewCanvasFactory
): StudioCompanionReferenceRenderedPreview | null {
  const canvas = createSizedCanvas(width, height, factory);
  if (!canvas) return null;
  const context = safeContext(canvas, true);
  if (!context) return null;
  try {
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.drawImage(source.canvas, 0, 0, width, height);
  } catch {
    return null;
  }
  return { canvas, width, height, resolvedItemCount: source.resolvedItemCount };
}

/**
 * Encodes a rendered staging canvas as a validated WebP. Quality is reduced before dimensions;
 * an encoder rejection, wrong MIME, empty Blob, abort or deadline exhaustion fails closed.
 */
export async function encodeStudioCompanionReferencePreviewWebp(
  rendered: StudioCompanionReferenceRenderedPreview,
  options: StudioCompanionReferencePreviewEncodeOptions = {},
  dependencies: StudioCompanionReferencePreviewDependencies = {}
): Promise<StudioCompanionReferenceEncodedPreview | null> {
  if (
    !safePositiveInteger(rendered.width)
    || !safePositiveInteger(rendered.height)
    || Math.max(rendered.width, rendered.height) > STUDIO_COMPANION_REFERENCE_MAX_EDGE
    || rendered.width * rendered.height > STUDIO_COMPANION_REFERENCE_MAX_PIXELS
    || !safePositiveInteger(rendered.resolvedItemCount)
    || rendered.resolvedItemCount > STUDIO_COMPANION_REFERENCE_MAX_ITEMS
    || !rendered.canvas
    || typeof rendered.canvas !== "object"
    || rendered.canvas.width !== rendered.width
    || rendered.canvas.height !== rendered.height
  ) return null;

  const clock = dependencies.clock ?? defaultClock();
  const startedAt = clockNow(clock);
  if (startedAt === null) return null;
  const deadline = startedAt + boundedTimeout(options.timeoutMs);
  if (!Number.isFinite(deadline)) return null;
  const maximumBytes = boundedMaximumBytes(options.maximumBytes);
  const encode = dependencies.encodeCanvas ?? defaultEncodeCanvas;
  const factory = dependencies.createCanvas ?? defaultCanvasFactory;
  let candidate = rendered;

  for (let resizePass = 0; resizePass <= STUDIO_COMPANION_REFERENCE_WEBP_MAX_RESIZE_PASSES; resizePass += 1) {
    const qualities = resizePass === 0
      ? STUDIO_COMPANION_REFERENCE_WEBP_QUALITIES
      : [STUDIO_COMPANION_REFERENCE_WEBP_QUALITIES.at(-1) ?? 0.54];
    for (const quality of qualities) {
      const now = clockNow(clock);
      if (now === null || now >= deadline || options.signal?.aborted) return null;
      const attempt = await runEncodeAttempt(
        candidate.canvas,
        quality,
        encode,
        clock,
        Math.max(1, Math.ceil(deadline - now)),
        options.signal
      );
      if (attempt.kind !== "done") return null;
      const inspected = inspectWebpBlob(attempt.blob, maximumBytes);
      if (inspected.kind === "invalid") return null;
      if (inspected.kind === "accepted") {
        return {
          blob: inspected.blob,
          width: candidate.width,
          height: candidate.height,
          resolvedItemCount: candidate.resolvedItemCount,
        };
      }
    }

    if (resizePass === STUDIO_COMPANION_REFERENCE_WEBP_MAX_RESIZE_PASSES) break;
    const nextWidth = Math.max(
      1,
      Math.floor(candidate.width * STUDIO_COMPANION_REFERENCE_WEBP_RESIZE_SCALE)
    );
    const nextHeight = Math.max(
      1,
      Math.floor(candidate.height * STUDIO_COMPANION_REFERENCE_WEBP_RESIZE_SCALE)
    );
    if (nextWidth === candidate.width && nextHeight === candidate.height) return null;
    const resized = resizeRenderedPreview(candidate, nextWidth, nextHeight, factory);
    if (!resized) return null;
    candidate = resized;
  }
  return null;
}

/** Composites and encodes in one call without exposing the private staging canvas. */
export async function createStudioCompanionReferencePreview(
  input: StudioCompanionReferencePreviewInput,
  options: StudioCompanionReferencePreviewEncodeOptions = {},
  dependencies: StudioCompanionReferencePreviewDependencies = {}
): Promise<StudioCompanionReferenceEncodedPreview | null> {
  const rendered = renderStudioCompanionReferencePreview(input, dependencies);
  return rendered
    ? encodeStudioCompanionReferencePreviewWebp(rendered, options, dependencies)
    : null;
}

/** Produces the exact transport frame only after the contract validator accepts the encoded Blob. */
export async function createStudioCompanionReferencePreviewFrame(
  input: StudioCompanionReferencePreviewFrameInput,
  options: StudioCompanionReferencePreviewEncodeOptions = {},
  dependencies: StudioCompanionReferencePreviewDependencies = {}
): Promise<StudioCompanionReferencePreviewFrame | null> {
  const exact = plainOwnData(input, [
    "boardWidth",
    "boardHeight",
    "items",
    "generation",
    "revision",
    "referenceRevision",
    "sequence",
  ]);
  if (
    !exact
    || !safePositiveInteger(exact.generation)
    || !safePositiveInteger(exact.revision)
    || !safePositiveInteger(exact.referenceRevision)
    || !safePositiveInteger(exact.sequence)
  ) return null;
  const cursor = Object.freeze({
    generation: exact.generation,
    revision: exact.revision,
    referenceRevision: exact.referenceRevision,
    sequence: exact.sequence,
  });
  const previewInput: StudioCompanionReferencePreviewInput = Object.freeze({
    boardWidth: exact.boardWidth as number,
    boardHeight: exact.boardHeight as number,
    items: exact.items as readonly StudioCompanionReferencePreviewItem[],
  });
  const encoded = await createStudioCompanionReferencePreview(
    previewInput,
    options,
    dependencies
  );
  if (!encoded) return null;
  const frame: StudioCompanionReferencePreviewFrame = {
    generation: cursor.generation,
    revision: cursor.revision,
    referenceRevision: cursor.referenceRevision,
    sequence: cursor.sequence,
    width: encoded.width,
    height: encoded.height,
    blob: encoded.blob,
  };
  return isStudioCompanionReferencePreviewFrame(frame) ? frame : null;
}

/**
 * Samples original source RGB on the primary. Items are tested front-to-back; transparent pixels,
 * zero-opacity items, unresolved rasters and object-contain letterboxes fall through to items below.
 * Display grayscale deliberately does not alter the selected source color.
 */
export function sampleStudioCompanionReferenceColor(
  itemsInput: readonly StudioCompanionReferencePreviewItem[],
  point: StudioCompanionReferencePoint,
  boardWidth: number,
  boardHeight: number
): string | null {
  const exactPoint = plainOwnData(point, ["x", "y"]);
  if (
    !exactPoint
    || !finiteUnit(exactPoint.x)
    || !finiteUnit(exactPoint.y)
    || !finitePositive(boardWidth)
    || !finitePositive(boardHeight)
  ) return null;
  const items = parseResolvedItems(itemsInput, { copyPixels: true });
  if (!items) return null;
  const boardPoint = { x: exactPoint.x * boardWidth, y: exactPoint.y * boardHeight };

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.view.opacity === 0 || !item.source.pixels) continue;
    const layoutWidth = item.source.layoutWidth ?? item.source.width;
    const layoutHeight = item.source.layoutHeight ?? item.source.height;
    const framePercent = studioReferenceItemFramePercent(layoutWidth, layoutHeight);
    const pixel = mapStudioReferenceBoardPointToSourcePixel(boardPoint, {
      boardWidth,
      boardHeight,
      centerX: item.view.centerX,
      centerY: item.view.centerY,
      frameWidth: boardWidth * framePercent.width / 100,
      frameHeight: boardHeight * framePercent.height / 100,
      sourceWidth: item.source.width,
      sourceHeight: item.source.height,
      zoom: item.view.zoom,
      rotationDeg: item.view.rotationDeg,
      flipX: item.view.flipX,
      flipY: item.view.flipY,
    });
    const sampled = sampleStudioReferenceRasterPixel({
      width: item.source.width,
      height: item.source.height,
      data: item.source.pixels,
    }, pixel);
    if (sampled) return sampled;
  }
  return null;
}
