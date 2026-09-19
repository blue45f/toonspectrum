// Keep the real ESM extension: Vite can infer it, but the standalone lane-11
// benchmark runs under Node/tsx where extensionless .mjs resolution is invalid.
import createLibMypaintModule from "./mypaint-wasm.mjs";

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

export interface LibMypaintDirtyFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Packed straight-alpha RGBA8. Replace these pixels; do not alpha-composite them again. */
  readonly pixels: Uint8Array;
}

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
  /** Read only a bounded rectangle, with no full-surface temporary. */
  surfaceToRgba8Region(surface: number, x: number, y: number, width: number, height: number): Uint8Array;
  /** Consume accumulated native dirty bounds only after the packed copy succeeds. */
  surfaceTakeDirtyFrame(surface: number): LibMypaintDirtyFrame | null;
  module: LibMypaintEmscriptenModule;
}

export interface LoadLibMypaintOptions {
  /** Explicit wasm bytes (hermetic loads / custom bundling). */
  wasmBinary?: Uint8Array;
  /** Explicit emitted WASM asset URL for browser/Worker bundling. Bypasses the default cache. */
  wasmUrl?: string;
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
  const regionToRgba8 = module.cwrap("lmp_surface_region_to_rgba8", "number", [
    "number", "number", "number", "number", "number", "number",
  ]);
  const dirtyRect = module.cwrap("lmp_surface_dirty_rect", "number", ["number", "number"]);
  const ackDirty = module.cwrap("lmp_surface_ack_dirty", null, ["number"]);
  const surfaces = new Map<number, { width: number; height: number }>();
  function dimensions(surface: number) {
    const value = surfaces.get(surface);
    if (!value) throw new RangeError("Unknown or released libmypaint surface handle");
    return value;
  }
  function allocate(bytes: number): number {
    const pointer = module._malloc(bytes);
    if (!pointer) throw new Error("libmypaint pixel allocation failed");
    return pointer;
  }
  function readRegion(surface: number, x: number, y: number, width: number, height: number): Uint8Array {
    const bound = dimensions(surface);
    if (![x, y, width, height].every(Number.isSafeInteger)
      || x < 0 || y < 0 || width <= 0 || height <= 0
      || x + width > bound.width || y + height > bound.height
    ) throw new RangeError("libmypaint pixel region exceeds its surface");
    const byteLength = width * height * 4;
    const pointer = allocate(byteLength);
    try {
      if (regionToRgba8(surface, x, y, width, height, pointer) !== 1) {
        throw new Error("libmypaint native pixel region was rejected");
      }
      // malloc may grow WASM memory; obtain its current heap only after allocation/call.
      return new Uint8Array(module.HEAPU8.subarray(pointer, pointer + byteLength));
    } finally { module._free(pointer); }
  }

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
    surfaceNew: (width, height) => {
      if (![width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0
        || width > 4096 || height > 4096 || width * height > 4_194_304
      ) throw new RangeError("libmypaint surface dimensions exceed the bounded allocation policy");
      const surface = surfaceNew(width, height);
      if (surface) surfaces.set(surface, { width, height });
      return surface;
    },
    surfaceFree: (surface) => {
      dimensions(surface);
      surfaces.delete(surface);
      surfaceFree(surface);
    },
    strokeTo: (brush, surface, x, y, pressure, tiltX, tiltY, dtimeSeconds) =>
      strokeTo(brush, surface, x, y, pressure, tiltX, tiltY, dtimeSeconds),
    surfaceToRgba8: (surface, width, height) => {
      const expected = dimensions(surface);
      if (expected.width !== width || expected.height !== height) {
        throw new RangeError("libmypaint full-frame dimensions do not match the native surface");
      }
      return readRegion(surface, 0, 0, width, height);
    },
    surfaceToRgba8Region: readRegion,
    surfaceTakeDirtyFrame: (surface) => {
      dimensions(surface);
      const pointer = allocate(16);
      try {
        if (!dirtyRect(surface, pointer)) return null;
        const view = new DataView(module.HEAPU8.buffer, module.HEAPU8.byteOffset + pointer, 16);
        const x = view.getInt32(0, true), y = view.getInt32(4, true);
        const width = view.getInt32(8, true), height = view.getInt32(12, true);
        const pixels = readRegion(surface, x, y, width, height);
        ackDirty(surface);
        return { x, y, width, height, pixels };
      } finally { module._free(pointer); }
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
    // Let Emscripten reject failed instantiations instead of leaving its initialization
    // promise unresolved inside a custom instantiateWasm callback.
    const bytes = new Uint8Array(options.wasmBinary);
    return WebAssembly.compile(bytes).then(() => createLibMypaintModule({ wasmBinary: bytes })).then(bindRaw);
  }
  if (options.wasmUrl) {
    return createLibMypaintModule({
      locateFile: (file, directory) => file.endsWith(".wasm") ? options.wasmUrl! : directory + file,
    }).then(bindRaw);
  }
  if (!cachedLoad) {
    const pending = createLibMypaintModule().then(bindRaw);
    cachedLoad = pending;
    void pending.catch(() => { if (cachedLoad === pending) cachedLoad = undefined; });
  }
  return cachedLoad;
}
