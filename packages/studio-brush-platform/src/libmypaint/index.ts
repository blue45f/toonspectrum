import createLibMypaintModule from "./mypaint-wasm";

import type { LibMypaintEmscriptenModule } from "./mypaint-wasm";

/**
 * Loader for the pinned libmypaint wasm build (ADR-0011 lane 11).
 *
 * Source: libmypaint v1.6.1 (2768251dacce3939136c839aeca413f4aa4241d0),
 * compiled directly with emcc by bridge/build.sh — json-c is bypassed, so
 * brushes are programmed exclusively through the injection API surfaced here.
 * The committed `mypaint-wasm.{mjs,wasm}` pair is pinned by INTEGRITY.sha256
 * (verified in scripts/verify-studio-engine.mjs).
 *
 * Node resolves the `.wasm` next to the glue via `import.meta.url`; web
 * consumers can either rely on the same URL pattern (bundler asset) or pass
 * explicit bytes via `wasmBinary`, mirroring the studio-hokusai-wasm
 * `init({ module_or_path })` convention.
 */

/** Typed, pointer-level view over the C bridge (mypaint-bridge.c). */
export interface LibMypaintRaw {
  /** e.g. "libmypaint 1.6.1+2768251d (emcc)" */
  version(): string;
  settingCount(): number;
  inputCount(): number;
  /** Setting id for a `.myb` cname; out-of-range result means unknown. */
  settingId(cname: string): number;
  inputId(cname: string): number;
  /** New brush pre-loaded with MyPaint stock defaults. */
  brushNew(): number;
  brushFree(brush: number): void;
  brushSetBaseValue(brush: number, settingId: number, value: number): void;
  brushGetBaseValue(brush: number, settingId: number): number;
  brushSetMappingN(
    brush: number,
    settingId: number,
    inputId: number,
    n: number,
  ): void;
  brushSetMappingPoint(
    brush: number,
    settingId: number,
    inputId: number,
    index: number,
    x: number,
    y: number,
  ): void;
  /** Reset dynamic state, reseed RNG (libc rand) and begin a stroke. */
  brushNewStroke(brush: number, seed: number): void;
  surfaceNew(width: number, height: number): number;
  surfaceFree(surface: number): void;
  /**
   * One sample: begin_atomic → stroke_to → end_atomic (HokusaiCanvas
   * addSample granularity). `dtimeSeconds` is the delta since the previous
   * sample. Returns libmypaint's painted flag (0/1).
   */
  strokeTo(
    brush: number,
    surface: number,
    x: number,
    y: number,
    pressure: number,
    tiltX: number,
    tiltY: number,
    dtimeSeconds: number,
  ): number;
  /** Whole surface as straight-alpha RGBA8 (fresh copy, width*height*4). */
  surfaceToRgba8(surface: number, width: number, height: number): Uint8Array;
  module: LibMypaintEmscriptenModule;
}

export interface LoadLibMypaintOptions {
  /** Explicit wasm bytes (hermetic loads / custom bundling). */
  wasmBinary?: Uint8Array;
}

function bindRaw(module: LibMypaintEmscriptenModule): LibMypaintRaw {
  // cwrap once — strokeTo is the hot loop the throughput gate measures.
  const version = module.cwrap("lmp_version", "number", []);
  const settingCount = module.cwrap("lmp_setting_count", "number", []);
  const inputCount = module.cwrap("lmp_input_count", "number", []);
  const settingId = module.cwrap("lmp_setting_id", "number", ["string"]);
  const inputId = module.cwrap("lmp_input_id", "number", ["string"]);
  const brushNew = module.cwrap("lmp_brush_new", "number", []);
  const brushFree = module.cwrap("lmp_brush_free", null, ["number"]);
  const setBaseValue = module.cwrap("lmp_brush_set_base_value", null, [
    "number",
    "number",
    "number",
  ]);
  const getBaseValue = module.cwrap("lmp_brush_get_base_value", "number", [
    "number",
    "number",
  ]);
  const setMappingN = module.cwrap("lmp_brush_set_mapping_n", null, [
    "number",
    "number",
    "number",
    "number",
  ]);
  const setMappingPoint = module.cwrap("lmp_brush_set_mapping_point", null, [
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
  ]);
  const newStroke = module.cwrap("lmp_brush_new_stroke", null, [
    "number",
    "number",
  ]);
  const surfaceNew = module.cwrap("lmp_surface_new", "number", [
    "number",
    "number",
  ]);
  const surfaceFree = module.cwrap("lmp_surface_free", null, ["number"]);
  const strokeTo = module.cwrap("lmp_stroke_to", "number", [
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
  ]);
  const surfaceToRgba8 = module.cwrap("lmp_surface_to_rgba8", null, [
    "number",
    "number",
  ]);

  return {
    version: () => module.UTF8ToString(version()),
    settingCount: () => settingCount(),
    inputCount: () => inputCount(),
    settingId: (cname) => settingId(cname),
    inputId: (cname) => inputId(cname),
    brushNew: () => brushNew(),
    brushFree: (brush) => {
      brushFree(brush);
    },
    brushSetBaseValue: (brush, setting, value) => {
      setBaseValue(brush, setting, value);
    },
    brushGetBaseValue: (brush, setting) => getBaseValue(brush, setting),
    brushSetMappingN: (brush, setting, input, n) => {
      setMappingN(brush, setting, input, n);
    },
    brushSetMappingPoint: (brush, setting, input, index, x, y) => {
      setMappingPoint(brush, setting, input, index, x, y);
    },
    brushNewStroke: (brush, seed) => {
      newStroke(brush, seed);
    },
    surfaceNew: (width, height) => surfaceNew(width, height),
    surfaceFree: (surface) => {
      surfaceFree(surface);
    },
    strokeTo: (brush, surface, x, y, pressure, tiltX, tiltY, dtimeSeconds) =>
      strokeTo(brush, surface, x, y, pressure, tiltX, tiltY, dtimeSeconds),
    surfaceToRgba8: (surface, width, height) => {
      const byteLength = width * height * 4;
      const pointer = module._malloc(byteLength);
      try {
        surfaceToRgba8(surface, pointer);
        return new Uint8Array(
          module.HEAPU8.subarray(pointer, pointer + byteLength),
        );
      } finally {
        module._free(pointer);
      }
    },
    module,
  };
}

let cachedLoad: Promise<LibMypaintRaw> | undefined;

/** Load (and memoize) the libmypaint wasm bridge. */
export function loadLibMypaint(
  options: LoadLibMypaintOptions = {},
): Promise<LibMypaintRaw> {
  if (options.wasmBinary) {
    // Explicit bytes bypass the cache: hermetic loads stay hermetic.
    // BufferSource cast: Uint8Array<ArrayBufferLike> (e.g. node Buffer) is not
    // assignable to the DOM lib's BufferSource generic, but the runtime accepts
    // any Uint8Array here.
    const bytes = options.wasmBinary as unknown as BufferSource;
    return createLibMypaintModule({
      instantiateWasm: (imports, receiveInstance) => {
        void WebAssembly.instantiate(bytes, imports).then((result) =>
          receiveInstance(result.instance, result.module),
        );
      },
    }).then(bindRaw);
  }
  cachedLoad ??= createLibMypaintModule().then(bindRaw);
  return cachedLoad;
}
