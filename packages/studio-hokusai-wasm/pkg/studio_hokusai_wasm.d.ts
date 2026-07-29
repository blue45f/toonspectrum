/* tslint:disable */
/* eslint-disable */

/**
 * Parsed libmypaint v3 brush data.
 *
 * A canvas snapshots this value at `beginStroke`, so mutating a brush while
 * a stroke is active cannot change the in-flight stroke half way through.
 */
export class HokusaiBrush {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A pressure-, tilt-, and seeded-random-aware natural-media preset.
     */
    static naturalMedia(): HokusaiBrush;
    /**
     * Parse a libmypaint `.myb` v3 JSON document.
     */
    constructor(myb_json: string);
    radiusLog(): number;
    /**
     * Override the HSV base colour. Hue wraps; saturation and value clamp.
     */
    setColorHsv(h: number, s: number, v: number): void;
    /**
     * Override the UI-facing base-2 logarithmic radius in pixels.
     *
     * Hokusai 0.3.0 internally evaluates `exp(radius_logarithmic)`, so this
     * wrapper converts the public log2 value to Hokusai's natural-log storage.
     */
    setRadiusLog(log2_radius: number): void;
}

/**
 * Stateful transparent canvas with an explicit stroke lifecycle.
 *
 * Dirty bounds are conservative, tile-aligned bounds clipped to the canvas.
 * They safely include pixels that became transparent through erasing.
 */
export class HokusaiCanvas {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add one absolute-time pointer sample.
     *
     * `timeMs` must be finite and monotonic. Pressure clamps to `[0, 1]`;
     * tilt components clamp to `[-1, 1]`. The `brush` argument preserves a
     * convenient call-site contract; rendering uses the immutable snapshot
     * captured by `beginStroke`.
     */
    addSample(_brush: HokusaiBrush, x: number, y: number, pressure: number, tilt_x: number, tilt_y: number, time_ms: number): boolean;
    /**
     * Begin a stroke and snapshot `brush`. Passing `undefined`/`null` for
     * `seed` uses the constructor seed.
     */
    beginStroke(brush: HokusaiBrush, seed?: number | null): void;
    /**
     * Acknowledge pending changes without altering canvas pixels.
     */
    clearDirty(): void;
    /**
     * Return `[x, y, width, height]` for changes since `clearDirty`.
     *
     * An empty `Int32Array` means there are no pending changes.
     */
    dirtyBounds(): Int32Array;
    /**
     * Return tightly packed transparent RGBA8 for `dirtyBounds`.
     *
     * This does not clear dirty tracking. Call `clearDirty` after the
     * consumer has uploaded both bounds and bytes.
     */
    dirtyFrame(): Uint8Array;
    /**
     * Release Rust-owned tile memory and permanently tombstone this object.
     *
     * The method is idempotent. Call wasm-bindgen's generated `.free()`
     * afterwards when the JavaScript wrapper itself is no longer needed.
     */
    dispose(): void;
    /**
     * Flush slow-tracking tail dabs, then close the active stroke.
     */
    finishStroke(_brush: HokusaiBrush): boolean;
    /**
     * Return the entire transparent canvas as straight-alpha sRGB RGBA8.
     */
    fullFrame(): Uint8Array;
    /**
     * Create a transparent canvas. `seed` is used when `beginStroke` omits
     * its optional per-stroke seed.
     */
    constructor(width: number, height: number, seed: number);
    /**
     * Clear all paint and cancel any active stroke.
     *
     * If the canvas contained tiles, the whole canvas becomes dirty so the
     * caller can clear its destination texture.
     */
    reset(): boolean;
    readonly hasDirty: boolean;
    readonly height: number;
    readonly isDisposed: boolean;
    readonly isStrokeActive: boolean;
    readonly width: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_hokusaibrush_free: (a: number, b: number) => void;
    readonly __wbg_hokusaicanvas_free: (a: number, b: number) => void;
    readonly hokusaibrush_naturalMedia: () => number;
    readonly hokusaibrush_new: (a: number, b: number, c: number) => void;
    readonly hokusaibrush_radiusLog: (a: number) => number;
    readonly hokusaibrush_setColorHsv: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly hokusaibrush_setRadiusLog: (a: number, b: number, c: number) => void;
    readonly hokusaicanvas_addSample: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly hokusaicanvas_beginStroke: (a: number, b: number, c: number, d: number) => void;
    readonly hokusaicanvas_dirtyBounds: (a: number, b: number) => void;
    readonly hokusaicanvas_dirtyFrame: (a: number, b: number) => void;
    readonly hokusaicanvas_dispose: (a: number) => void;
    readonly hokusaicanvas_finishStroke: (a: number, b: number, c: number) => void;
    readonly hokusaicanvas_fullFrame: (a: number, b: number) => void;
    readonly hokusaicanvas_hasDirty: (a: number) => number;
    readonly hokusaicanvas_isDisposed: (a: number) => number;
    readonly hokusaicanvas_isStrokeActive: (a: number) => number;
    readonly hokusaicanvas_new: (a: number, b: number, c: number, d: number) => void;
    readonly hokusaicanvas_reset: (a: number, b: number) => void;
    readonly hokusaicanvas_height: (a: number) => number;
    readonly hokusaicanvas_width: (a: number) => number;
    readonly hokusaicanvas_clearDirty: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
