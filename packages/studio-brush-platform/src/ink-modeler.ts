/**
 * Google ink-stroke-modeler wasm boundary (ADR-0009 / ADR-0011 lane 3 PoC).
 *
 * The wasm module is the committed artifact in ./ink-modeler/ (upstream
 * commit-pinned build + first-party C bridge, INTEGRITY.sha256 pinned — see
 * ./ink-modeler/README.md). This wrapper owns init lifecycle, unit conversion
 * (px + ms in, px + ms out; the modeler itself is unit-agnostic but wobble
 * speeds and output rate are per-second, so time crosses the boundary in
 * seconds) and error mapping. Prediction is intentionally unavailable: the
 * PoC contract is deterministic replayable output with no predicted
 * extension, so the bridge never exposes Predict().
 *
 * This lane is quarantined per ADR-0011 — production inking stays on the
 * first-party stabilizer (./stabilizer.ts) + perfect-freehand chain until the
 * blind-lab gate (ADR-0009) rules on the measured comparison in
 * tests/benchmarks/results/ink-modeler-poc.json.
 */

/** Upstream commit pin of the committed wasm artifact. */
export const INK_STROKE_MODELER_COMMIT = "f2388813b0b25bc3e33d143d369a8367ab2e30c8";

export interface InkRawPoint {
  x: number;
  y: number;
  tMs: number;
  /** [0, 1]; omit for "unknown" (forwarded as the modeler's -1 sentinel). */
  pressure?: number;
}

export interface InkModeledPoint {
  x: number;
  y: number;
  tMs: number;
  /** Interpolated from raw input; -1 when the raw stream had no pressure. */
  pressure: number;
  /** px/ms. */
  velocityX: number;
  /** px/ms. */
  velocityY: number;
}

export interface InkStrokeModelerParams {
  /** Minimum modeled outputs per second (upstream sampling_params). */
  minOutputRate?: number;
  /** End-of-stroke convergence stopping distance, px. */
  endOfStrokeStoppingDistancePx?: number;
  /** Wobble (high-frequency noise) smoother stage. */
  wobble?: {
    enabled?: boolean;
    timeoutMs?: number;
    speedFloorPxPerS?: number;
    speedCeilingPxPerS?: number;
  };
  /** Position modeler spring constant / mass (s²) — upstream default 11/32400. */
  springMassConstant?: number;
  /** Position modeler drag (1/s) — upstream default 72. */
  dragConstant?: number;
}

/**
 * Defaults: upstream stroke_modeler_test.cc kDefaultParams (cm + seconds),
 * with the distance-dependent wobble speeds converted to px at 96dpi
 * (1 cm ≈ 37.8 px → 1.31 cm/s ≈ 50 px/s, 1.44 cm/s ≈ 54 px/s) and the
 * 0.001 cm stopping distance rounded to 0.05 px. spring/drag are
 * distance-unit independent and kept verbatim.
 */
export const INK_DEFAULT_PARAMS: Required<Omit<InkStrokeModelerParams, "wobble">> & {
  wobble: Required<NonNullable<InkStrokeModelerParams["wobble"]>>;
} = {
  minOutputRate: 180,
  endOfStrokeStoppingDistancePx: 0.05,
  wobble: {
    enabled: true,
    timeoutMs: 40,
    speedFloorPxPerS: 50,
    speedCeilingPxPerS: 54,
  },
  springMassConstant: 11 / 32400,
  dragConstant: 72,
};

export class InkModelerError extends Error {
  /** absl::StatusCode from the wasm boundary, or -1 for wrapper-side validation. */
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "InkModelerError";
    this.code = code;
  }
}

export interface InkStrokeModeler {
  /**
   * Model one complete stroke: first point is the pen-down event, last point
   * the pen-up event. Deterministic for identical inputs. Output density is
   * >= input density (minOutputRate upsampling) and never extends past the
   * raw endpoint time (no prediction).
   */
  modelStroke(
    points: readonly InkRawPoint[],
    params?: InkStrokeModelerParams,
  ): InkModeledPoint[];
}

/** Emscripten module surface exported by ink-modeler/ink_stroke_modeler.mjs. */
interface InkWasmModule {
  HEAPF64: Float64Array;
  _ism_create(): number;
  _ism_destroy(handle: number): void;
  _ism_result_stride(): number;
  _ism_reset(
    handle: number,
    minOutputRate: number,
    endOfStrokeStoppingDistance: number,
    wobbleEnabled: number,
    wobbleTimeoutSeconds: number,
    wobbleSpeedFloor: number,
    wobbleSpeedCeiling: number,
    springMassConstant: number,
    dragConstant: number,
    predictionEnabled: number,
  ): number;
  _ism_update(
    handle: number,
    eventType: number,
    x: number,
    y: number,
    tSeconds: number,
    pressure: number,
  ): number;
  _ism_results_ptr(handle: number): number;
}

type InkWasmFactory = (moduleArg?: Record<string, unknown>) => Promise<InkWasmModule>;

const RESULT_STRIDE = 6;

let modulePromise: Promise<InkWasmModule> | null = null;

/**
 * Idempotent loader (node + web). The default module URL resolves next to
 * this file; browser hosts bundling from elsewhere can pass an explicit URL.
 */
export function loadInkStrokeModeler(options?: {
  moduleUrl?: string | URL;
}): Promise<InkStrokeModeler> {
  modulePromise ??= (async () => {
    const href =
      options?.moduleUrl !== undefined
        ? String(options.moduleUrl)
        : new URL("./ink-modeler/ink_stroke_modeler.mjs", import.meta.url).href;
    // Computed specifier on purpose: the emscripten loader resolves its wasm
    // via import.meta.url, and static analysis must not inline/rewrite it.
    const imported = (await import(/* @vite-ignore */ href)) as {
      default: InkWasmFactory;
    };
    const wasm = await imported.default();
    if (wasm._ism_result_stride() !== RESULT_STRIDE) {
      throw new InkModelerError(
        `ink-modeler ABI mismatch: expected result stride ${RESULT_STRIDE}, got ${wasm._ism_result_stride()}`,
        -1,
      );
    }
    return wasm;
  })();
  return modulePromise.then((wasm) => ({
    modelStroke: (points, params) => modelStrokeWith(wasm, points, params),
  }));
}

function modelStrokeWith(
  wasm: InkWasmModule,
  points: readonly InkRawPoint[],
  params?: InkStrokeModelerParams,
): InkModeledPoint[] {
  if (points.length < 2) {
    throw new InkModelerError(
      `ink-modeler needs at least 2 points (down + up), got ${points.length}`,
      -1,
    );
  }
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous !== undefined && current !== undefined && current.tMs <= previous.tMs) {
      throw new InkModelerError(
        `ink-modeler requires strictly increasing tMs (index ${i}: ${current.tMs} <= ${previous.tMs})`,
        3, // absl kInvalidArgument
      );
    }
  }
  const resolved = resolveParams(params);
  const handle = wasm._ism_create();
  if (handle === 0) {
    throw new InkModelerError("ink-modeler allocation failed", -1);
  }
  try {
    const resetCode = wasm._ism_reset(
      handle,
      resolved.minOutputRate,
      resolved.endOfStrokeStoppingDistancePx,
      resolved.wobble.enabled ? 1 : 0,
      resolved.wobble.timeoutMs / 1000,
      resolved.wobble.speedFloorPxPerS,
      resolved.wobble.speedCeilingPxPerS,
      resolved.springMassConstant,
      resolved.dragConstant,
      0, // prediction disabled — PoC contract
    );
    if (resetCode !== 0) {
      throw new InkModelerError(
        `ink-modeler rejected params (absl status ${resetCode})`,
        resetCode,
      );
    }
    const out: InkModeledPoint[] = [];
    points.forEach((point, index) => {
      const eventType = index === 0 ? 0 : index === points.length - 1 ? 2 : 1;
      const produced = wasm._ism_update(
        handle,
        eventType,
        point.x,
        point.y,
        point.tMs / 1000,
        point.pressure ?? -1,
      );
      if (produced < 0) {
        throw new InkModelerError(
          `ink-modeler rejected input at index ${index} (absl status ${-produced})`,
          -produced,
        );
      }
      // Re-read the heap view every call: ALLOW_MEMORY_GROWTH can re-anchor it.
      const base = wasm._ism_results_ptr(handle) / Float64Array.BYTES_PER_ELEMENT;
      const view = wasm.HEAPF64.subarray(base, base + produced * RESULT_STRIDE);
      for (let i = 0; i < produced; i += 1) {
        const offset = i * RESULT_STRIDE;
        out.push({
          x: view[offset] ?? 0,
          y: view[offset + 1] ?? 0,
          tMs: (view[offset + 2] ?? 0) * 1000,
          pressure: view[offset + 3] ?? -1,
          velocityX: (view[offset + 4] ?? 0) / 1000,
          velocityY: (view[offset + 5] ?? 0) / 1000,
        });
      }
    });
    return out;
  } finally {
    wasm._ism_destroy(handle);
  }
}

function resolveParams(params?: InkStrokeModelerParams): typeof INK_DEFAULT_PARAMS {
  return {
    minOutputRate: params?.minOutputRate ?? INK_DEFAULT_PARAMS.minOutputRate,
    endOfStrokeStoppingDistancePx:
      params?.endOfStrokeStoppingDistancePx ?? INK_DEFAULT_PARAMS.endOfStrokeStoppingDistancePx,
    wobble: {
      enabled: params?.wobble?.enabled ?? INK_DEFAULT_PARAMS.wobble.enabled,
      timeoutMs: params?.wobble?.timeoutMs ?? INK_DEFAULT_PARAMS.wobble.timeoutMs,
      speedFloorPxPerS:
        params?.wobble?.speedFloorPxPerS ?? INK_DEFAULT_PARAMS.wobble.speedFloorPxPerS,
      speedCeilingPxPerS:
        params?.wobble?.speedCeilingPxPerS ?? INK_DEFAULT_PARAMS.wobble.speedCeilingPxPerS,
    },
    springMassConstant: params?.springMassConstant ?? INK_DEFAULT_PARAMS.springMassConstant,
    dragConstant: params?.dragConstant ?? INK_DEFAULT_PARAMS.dragConstant,
  };
}
