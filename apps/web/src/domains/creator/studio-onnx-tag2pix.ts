/**
 * Tag2Pix line-art colorization on the product ONNX provider
 * (`studio-onnx-inference-provider`) — the on-device fallback for the AI
 * colorize action.
 *
 * Why this exists: the AI colorize panel normally calls a cloud image model
 * through the artist's own API key (BYOK). When that route is unavailable —
 * offline, no key configured, provider down — the user directive of
 * 2026-10-03 asks for a client-side ONNX fallback "even if it is a stretch":
 * model size, inference time, and quality limits are accepted, the license
 * guardrail is not. Tag2Pix (Kim et al., ICCV 2019; official implementation
 * and release weights, MIT License) is the line-art colorizer that clears
 * that bar. Source pixels never leave the device; only the versioned model
 * asset and the ONNX Runtime WASM assets are downloaded, lazily, on first
 * use of this fallback.
 *
 * Honest limits (also surfaced in the panel copy): the 2019 GAN colorizes
 * at a fixed 512×512 and its palette runs pale. The composite step below
 * re-imposes the source line art's luminance at native resolution, so the
 * drawing's lines and shading survive even though the chroma is computed
 * small. Quality is visibly below the cloud route — this is a fallback,
 * not a replacement.
 *
 * Model provenance: `assets/tag2pix.onnx` is a direct conversion of the
 * two official release assets (generator `tag2pix_512.pkl` + SEResNeXt-Half
 * feature extractor `model.pth`) into one graph; see
 * `assets/tag2pix.LICENSE.md`. Input contract follows the upstream test
 * path: grayscale line art in [0,1] (white background, black lines) plus a
 * 115-way multi-hot color-tag vector.
 */
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
  type StudioOnnxInferenceProvider,
  type StudioOnnxInferenceResult,
  type StudioOnnxSessionReceipt,
  type StudioOnnxTensorValue,
} from "./studio-onnx-inference-provider";
import {
  createStudioOnnxModelRegistry,
  type StudioOnnxModelDescriptor,
  type StudioOnnxModelRegistry,
} from "./studio-onnx-model-registry";

export const STUDIO_TAG2PIX_MODEL_ID = "tag2pix" as const;
export const STUDIO_TAG2PIX_MODEL_VERSION = "1" as const;
export const STUDIO_TAG2PIX_INPUT_SIZE = 512 as const;
export const STUDIO_TAG2PIX_LINE_INPUT_NAME = "line" as const;
export const STUDIO_TAG2PIX_TAGS_INPUT_NAME = "tags" as const;
export const STUDIO_TAG2PIX_OUTPUT_NAME = "color" as const;
export const STUDIO_TAG2PIX_MODEL_BYTE_LENGTH = 79_269_994 as const;
export const STUDIO_TAG2PIX_MODEL_SHA256 =
  "sha256:ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc" as const;

/**
 * The 115 color-variant tags of the upstream vocabulary, in the exact
 * order of `loader/tag_dump.pkl` (`cv_tag_list`) — the tag vector index
 * contract. Never reorder; append-only if the model is ever re-converted.
 */
export const STUDIO_TAG2PIX_TAG_NAMES = Object.freeze([
  "black_legwear", "white_legwear", "brown_legwear", "blue_legwear",
  "red_legwear", "purple_legwear", "grey_legwear", "pink_legwear",
  "black_footwear", "brown_footwear", "white_footwear", "red_footwear",
  "blue_footwear", "white_panties", "black_panties", "black_skirt",
  "blue_skirt", "red_skirt", "green_skirt", "white_skirt",
  "pink_skirt", "brown_skirt", "grey_skirt", "orange_skirt",
  "denim", "white_shirt", "black_shirt", "red_shirt",
  "blue_shirt", "pink_shirt", "black_gloves", "brown_gloves",
  "red_gloves", "red_neckwear", "black_neckwear", "blue_neckwear",
  "green_neckwear", "yellow_neckwear", "black_jacket", "black_bra",
  "white_bra", "pink_bra", "white_dress", "black_dress",
  "blue_dress", "red_dress", "pink_dress", "purple_dress",
  "green_dress", "red_ribbon", "yellow_ribbon", "black_ribbon",
  "blue_ribbon", "white_ribbon", "pink_ribbon", "dark_skin",
  "shiny_skin", "pale_skin", "white_skin", "blue_skin",
  "white_bikini", "black_bikini", "red_bikini", "blush",
  "blue_eyes", "red_eyes", "brown_eyes", "green_eyes",
  "purple_eyes", "yellow_eyes", "pink_eyes", "black_eyes",
  "aqua_eyes", "orange_eyes", "grey_eyes", "silver_eyes",
  "red-framed_eyewear", "black-framed_eyewear", "blonde_hair", "brown_hair",
  "black_hair", "blue_hair", "purple_hair", "pink_hair",
  "silver_hair", "green_hair", "red_hair", "white_hair",
  "orange_hair", "grey_hair", "aqua_hair", "lavender_hair",
  "light_brown_hair", "black_hat", "white_hat", "red_bow",
  "blue_bow", "white_bow", "yellow_bow", "pink_bow",
  "black_bow", "green_bow", "white_background", "grey_background",
  "blue_background", "pink_background", "gradient_background", "yellow_background",
  "black_background", "green_background", "red_background", "brown_background",
  "purple_background", "orange_background", "beige_background",
] as const);

export type StudioTag2pixTagName = (typeof STUDIO_TAG2PIX_TAG_NAMES)[number];

export const STUDIO_TAG2PIX_TAG_COUNT = STUDIO_TAG2PIX_TAG_NAMES.length;

const TAG_INDEX = new Map<string, number>(
  STUDIO_TAG2PIX_TAG_NAMES.map((name, index) => [name, index] as const),
);

const INPUT_PIXELS = STUDIO_TAG2PIX_INPUT_SIZE * STUDIO_TAG2PIX_INPUT_SIZE;

export const STUDIO_TAG2PIX_MODEL_DESCRIPTOR: StudioOnnxModelDescriptor =
  Object.freeze({
    id: STUDIO_TAG2PIX_MODEL_ID,
    version: STUDIO_TAG2PIX_MODEL_VERSION,
    sha256: STUDIO_TAG2PIX_MODEL_SHA256,
    byteBudget: STUDIO_TAG2PIX_MODEL_BYTE_LENGTH,
    inputs: Object.freeze([
      Object.freeze({
        name: STUDIO_TAG2PIX_LINE_INPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([
          1, 1, STUDIO_TAG2PIX_INPUT_SIZE, STUDIO_TAG2PIX_INPUT_SIZE,
        ]),
      }),
      Object.freeze({
        name: STUDIO_TAG2PIX_TAGS_INPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([1, STUDIO_TAG2PIX_TAG_COUNT]),
      }),
    ]),
    outputs: Object.freeze([
      Object.freeze({
        name: STUDIO_TAG2PIX_OUTPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([
          1, 3, STUDIO_TAG2PIX_INPUT_SIZE, STUDIO_TAG2PIX_INPUT_SIZE,
        ]),
      }),
    ]),
  });

export function createStudioTag2pixModelRegistry(): StudioOnnxModelRegistry {
  return createStudioOnnxModelRegistry([STUDIO_TAG2PIX_MODEL_DESCRIPTOR]);
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("채색을 취소했습니다.", "AbortError");
  }
  const error = new Error("채색을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function isAbortFailure(cause: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (cause instanceof Error) {
    if (cause.name === "AbortError") return true;
    if (
      "code" in cause
      && (cause as { readonly code?: unknown }).code === "aborted"
    ) {
      return true;
    }
  }
  return false;
}

/** Build the multi-hot tag vector; unknown tag names are rejected loudly. */
export function buildStudioTag2pixTagVector(
  tagNames: readonly string[],
): Float32Array {
  const vector = new Float32Array(STUDIO_TAG2PIX_TAG_COUNT);
  for (const name of tagNames) {
    const index = TAG_INDEX.get(name);
    if (index === undefined) {
      throw new RangeError(`알 수 없는 채색 태그입니다: ${name}`);
    }
    vector[index] = 1;
  }
  return vector;
}

function compositeOverWhiteChannel(value: number, alpha: number): number {
  const a = alpha / 255;
  return value * a + 255 * (1 - a);
}

function luminance255(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Preprocess a 512×512 RGBA raster into the Tag2Pix line tensor: composite
 * over white, take luminance into [0,1]. A mostly-dark raster (white lines
 * on a black canvas) is inverted so the model still sees its trained
 * contract — dark lines on a white background.
 */
export function preprocessStudioTag2pixLine(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  if (width !== STUDIO_TAG2PIX_INPUT_SIZE || height !== STUDIO_TAG2PIX_INPUT_SIZE) {
    throw new RangeError(
      `Tag2Pix 입력은 ${STUDIO_TAG2PIX_INPUT_SIZE}×${STUDIO_TAG2PIX_INPUT_SIZE} 래스터만 허용합니다.`,
    );
  }
  if (rgba.length !== INPUT_PIXELS * 4) {
    throw new RangeError("Tag2Pix 입력 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  const gray = new Float32Array(INPUT_PIXELS);
  let sum = 0;
  for (let pixel = 0; pixel < INPUT_PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const alpha = rgba[offset + 3]!;
    const r = compositeOverWhiteChannel(rgba[offset]!, alpha);
    const g = compositeOverWhiteChannel(rgba[offset + 1]!, alpha);
    const b = compositeOverWhiteChannel(rgba[offset + 2]!, alpha);
    const value = luminance255(r, g, b) / 255;
    gray[pixel] = value;
    sum += value;
  }
  if (sum / INPUT_PIXELS < 0.5) {
    for (let pixel = 0; pixel < INPUT_PIXELS; pixel += 1) {
      gray[pixel] = 1 - gray[pixel]!;
    }
  }
  return gray;
}

interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): readonly [number, number, number] {
  if (s === 0) return [l, l, l] as const;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1 / 3),
  ] as const;
}

function sampleBilinear(
  plane: Float32Array,
  channel: number,
  x: number,
  y: number,
): number {
  const size = STUDIO_TAG2PIX_INPUT_SIZE;
  const clampedX = Math.min(Math.max(x, 0), size - 1);
  const clampedY = Math.min(Math.max(y, 0), size - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const base = channel * INPUT_PIXELS;
  const top = plane[base + y0 * size + x0]! * (1 - fx)
    + plane[base + y0 * size + x1]! * fx;
  const bottom = plane[base + y1 * size + x0]! * (1 - fx)
    + plane[base + y1 * size + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Composite the 512×512 model chroma onto the source raster at native
 * resolution: hue/saturation come from the model, lightness is scaled by
 * the source luminance so black lines stay black and white fills keep the
 * model color untouched. Source alpha is preserved.
 */
export function compositeStudioTag2pixColor(input: {
  readonly colorPlane: Float32Array;
  readonly sourceRgba: Uint8Array | Uint8ClampedArray;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}): Uint8ClampedArray<ArrayBuffer> {
  const { colorPlane, sourceRgba, sourceWidth, sourceHeight } = input;
  if (colorPlane.length !== 3 * INPUT_PIXELS) {
    throw new RangeError("Tag2Pix 색상 평면 길이가 모델 출력과 일치하지 않습니다.");
  }
  if (sourceRgba.length !== sourceWidth * sourceHeight * 4) {
    throw new RangeError("원본 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  const out = new Uint8ClampedArray(sourceRgba.length);
  const size = STUDIO_TAG2PIX_INPUT_SIZE;
  for (let y = 0; y < sourceHeight; y += 1) {
    const modelY = (y + 0.5) * (size / sourceHeight) - 0.5;
    for (let x = 0; x < sourceWidth; x += 1) {
      const modelX = (x + 0.5) * (size / sourceWidth) - 0.5;
      const mr = (sampleBilinear(colorPlane, 0, modelX, modelY) + 1) / 2;
      const mg = (sampleBilinear(colorPlane, 1, modelX, modelY) + 1) / 2;
      const mb = (sampleBilinear(colorPlane, 2, modelX, modelY) + 1) / 2;
      const offset = (y * sourceWidth + x) * 4;
      const alpha = sourceRgba[offset + 3]!;
      const sr = compositeOverWhiteChannel(sourceRgba[offset]!, alpha);
      const sg = compositeOverWhiteChannel(sourceRgba[offset + 1]!, alpha);
      const sb = compositeOverWhiteChannel(sourceRgba[offset + 2]!, alpha);
      const sourceLuminance = luminance255(sr, sg, sb) / 255;
      const hsl = rgbToHsl(
        Math.min(1, Math.max(0, mr)),
        Math.min(1, Math.max(0, mg)),
        Math.min(1, Math.max(0, mb)),
      );
      const [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l * sourceLuminance);
      out[offset] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      out[offset + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      out[offset + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      out[offset + 3] = alpha;
    }
  }
  return out;
}

export interface StudioTag2pixColorization {
  /** CHW float plane, 3×512×512, tanh range [-1,1]. */
  readonly color: Float32Array;
  readonly executionProvider: StudioOnnxExecutionProvider;
  readonly receipt: StudioOnnxSessionReceipt;
}

export interface StudioTag2pixColorizer {
  colorize(
    line: Float32Array,
    tags: Float32Array,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioTag2pixColorization>;
  dispose(): Promise<void>;
}

export interface CreateStudioTag2pixColorizerOptions {
  /** Injectable for tests. Defaults to the product provider factory below. */
  readonly createProvider?: (
    executionProvider: StudioOnnxExecutionProvider,
  ) => StudioOnnxInferenceProvider;
  /** Injectable for tests and for the asset module that owns the model URL. */
  readonly loadModelBytes: () => Promise<Uint8Array>;
  /** Execution routes in preference order. WebGPU first, WASM as fallback. */
  readonly executionProviders?: readonly StudioOnnxExecutionProvider[];
}

const DEFAULT_EXECUTION_PROVIDERS = Object.freeze([
  "webgpu",
  "wasm",
] as const satisfies readonly StudioOnnxExecutionProvider[]);

interface ProviderSlot {
  readonly provider: StudioOnnxInferenceProvider;
}

/**
 * Create a colorizer that owns one ONNX provider per execution route.
 * Mirrors the U-2-Netp segmenter contract: calls are serialized (the
 * provider epoch contract rejects stale results), and a route that fails
 * once is retired for the lifetime of this colorizer so the next route is
 * tried instead of repeating a known-bad path.
 */
export function createStudioTag2pixColorizer(
  options: CreateStudioTag2pixColorizerOptions,
): StudioTag2pixColorizer {
  const routes = options.executionProviders ?? DEFAULT_EXECUTION_PROVIDERS;
  const createProvider = options.createProvider ?? ((executionProvider) => (
    createStudioOnnxInferenceProvider({
      registry: createStudioTag2pixModelRegistry(),
      executionProvider,
    })
  ));
  const slots = new Map<StudioOnnxExecutionProvider, ProviderSlot>();
  const retiredRoutes = new Set<StudioOnnxExecutionProvider>();
  let modelBytesPromise: Promise<Uint8Array> | null = null;
  let requestCounter = 0;
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;

  const loadBytes = (): Promise<Uint8Array> => {
    modelBytesPromise ??= options.loadModelBytes().catch((cause: unknown) => {
      modelBytesPromise = null;
      throw cause;
    });
    return modelBytesPromise;
  };

  const runColorize = async (
    line: Float32Array,
    tags: Float32Array,
    signal?: AbortSignal,
  ): Promise<StudioTag2pixColorization> => {
    if (disposed) throw new Error("Tag2Pix 채색기가 이미 해제되었습니다.");
    throwIfAborted(signal);
    if (line.length !== INPUT_PIXELS) {
      throw new RangeError("Tag2Pix 선화 평면 길이가 모델 입력과 일치하지 않습니다.");
    }
    if (tags.length !== STUDIO_TAG2PIX_TAG_COUNT) {
      throw new RangeError("Tag2Pix 태그 벡터 길이가 어휘 크기와 일치하지 않습니다.");
    }
    const bytes = await loadBytes();
    throwIfAborted(signal);
    let lastFailure: unknown = null;
    for (const route of routes) {
      if (retiredRoutes.has(route)) continue;
      let slot = slots.get(route);
      if (!slot) {
        slot = { provider: createProvider(route) };
        slots.set(route, slot);
      }
      requestCounter += 1;
      const epoch = Object.freeze({
        request: requestCounter,
        stroke: 0,
        document: 0,
      });
      slot.provider.setEpoch(epoch);
      let result: StudioOnnxInferenceResult;
      try {
        result = await slot.provider.infer({
          modelId: STUDIO_TAG2PIX_MODEL_ID,
          version: STUDIO_TAG2PIX_MODEL_VERSION,
          source: Object.freeze({ kind: "bytes" as const, bytes }),
          epoch,
          inputs: Object.freeze([
            Object.freeze({
              name: STUDIO_TAG2PIX_LINE_INPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([
                1, 1, STUDIO_TAG2PIX_INPUT_SIZE, STUDIO_TAG2PIX_INPUT_SIZE,
              ]),
              data: line,
            }),
            Object.freeze({
              name: STUDIO_TAG2PIX_TAGS_INPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([1, STUDIO_TAG2PIX_TAG_COUNT]),
              data: tags,
            }),
          ]),
          signal,
        });
      } catch (cause) {
        if (isAbortFailure(cause, signal)) throw createAbortError();
        lastFailure = cause;
        retiredRoutes.add(route);
        slots.delete(route);
        await slot.provider.dispose().catch(() => undefined);
        continue;
      }
      throwIfAborted(signal);
      const output: StudioOnnxTensorValue | undefined =
        result.outputs[STUDIO_TAG2PIX_OUTPUT_NAME];
      if (
        !output
        || output.elementType !== "float32"
        || !(output.data instanceof Float32Array)
        || output.data.length !== 3 * INPUT_PIXELS
      ) {
        throw new RangeError("Tag2Pix 색상 출력이 없거나 형식이 다릅니다.");
      }
      return Object.freeze({
        color: output.data,
        executionProvider: route,
        receipt: result.receipt,
      });
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error("기기 채색 모델을 실행하지 못했습니다.");
  };

  return Object.freeze({
    colorize(
      line: Float32Array,
      tags: Float32Array,
      colorizeOptions: { readonly signal?: AbortSignal } = {},
    ) {
      const run = chain.then(() => runColorize(line, tags, colorizeOptions.signal));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    async dispose() {
      disposed = true;
      const live = [...slots.values()];
      slots.clear();
      await Promise.all(
        live.map((slot) => slot.provider.dispose().catch(() => undefined)),
      );
    },
  });
}
