/* tslint:disable */
/* eslint-disable */

/**
 * Provider identity string surfaced in descriptors and benchmark reports.
 */
export function adapter_version(): string;

/**
 * Adopts a `GPUDevice` the page owns (StudioGpuFabric's single-owner
 * device) as *the* device this module renders on, replacing any previously
 * installed context.
 *
 * wgpu never destroys an adopted handle, so the fabric's lease/refcount
 * policy stays authoritative. Rejects if `device` is not a `GPUDevice`.
 */
export function adopt_gpu_device(device: any): void;

/**
 * Audits an SVG without rendering it. This is exposed for product capability
 * gates and tests so unsupported semantics are visible before any GPU work.
 */
export function audit_svg_native_json(svg: string): string;

/**
 * True once [`adopt_gpu_device`] installed an external device.
 */
export function fabric_device_adopted(): boolean;

/**
 * Returns the `GPUDevice` this module currently renders on, or `null`
 * before initialization. The probe compares it by identity against the
 * fabric device to prove adoption really happened.
 */
export function fabric_device_handle(): any;

/**
 * Fits a flat x,y polyline into editable cubic PathIR JSON (Kurbo E05 lane).
 */
export function fit_polyline_json(points: Float64Array, closed: boolean, accuracy: number): string;

/**
 * Probes WebGPU adapter availability. Resolves with a JSON string:
 * `{"supported":true,"adapter":{...},"engine":"..."}` or
 * `{"supported":false,"reason":"..."}`. Never rejects — probing is the one
 * operation that must be safe to call blindly.
 */
export function probe_webgpu(): Promise<string>;

/**
 * Renders one frame of a Lottie (bodymovin) JSON document on the browser's
 * WebGPU device and resolves with straight RGBA8 pixels (width * height * 4)
 * over a transparent base (Lottie output is meant to be composited).
 *
 * ADR-0011 Velato lane: velato 0.11 lowers the composition to a vello 0.9
 * `Scene` (`crate::lottie`), which reuses the exact texture/readback path the
 * SceneIR lane validated. Rejections carry a JSON message
 * `{"code":"lottie-*","reason":"..."}` — parse failures, unsupported Lottie
 * constructs, out-of-range frames and WebGPU absence are all explicit.
 */
export function render_lottie_gpu_json(lottie_json: string, frame: number, width: number, height: number): Promise<Uint8Array>;

/**
 * Renders SceneIR JSON on the browser's WebGPU device and resolves with the
 * RGBA8 pixels (width * height * 4). Rejects with an explicit error when
 * WebGPU is unavailable, the scene is invalid, or it needs unsupported
 * features — never a silent fallback.
 */
export function render_scene_gpu_json(scene_json: string): Promise<Uint8Array>;

/**
 * Renders SceneIR JSON on the adopted device and resolves with the raw
 * `GPUTexture` — no `copy_texture_to_buffer`, no `mapAsync`, no JS-side
 * pixel array. The caller owns the returned handle and can bind it
 * directly in its own WGSL pass (V12 §6.3 L4).
 */
export function render_scene_gpu_texture_json(scene_json: string): Promise<any>;

/**
 * Renders SceneIR JSON to straight RGBA8 bytes (width * height * 4).
 */
export function render_scene_json(scene_json: string): Uint8Array;

/**
 * Renders the strict Vello-native SVG subset through vello_cpu. It ships in
 * pkg-gpu as the deterministic fallback/reference for the same usvg tree;
 * the default CPU pkg remains byte-untouched.
 */
export function render_svg_cpu_json(svg: string, width: number, height: number): Uint8Array;

/**
 * Renders the strict SVG subset through vello_svg 0.10 -> vello 0.9 on the
 * browser WebGPU device. Readback exists only for quality evidence/export;
 * callers must keep the interactive hot path on-GPU.
 */
export function render_svg_gpu_json(svg: string, width: number, height: number): Promise<Uint8Array>;

/**
 * Shapes text with the given font bytes into positioned glyph PathIR JSON
 * (Parley/harfrust/ICU4X lane, matrix E07).
 */
export function shape_text_json(text: string, font_bytes: Uint8Array, font_size: number, max_width: number): string;

/**
 * Shapes text into vertical-writing positioned glyph PathIR JSON (manual
 * vertical composition over the Parley lane — V12 Text row, 세로쓰기 확장).
 */
export function shape_text_vertical_json(text: string, font_bytes: Uint8Array, font_size: number, max_height_px: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly adapter_version: () => [number, number];
    readonly adopt_gpu_device: (a: any) => [number, number];
    readonly audit_svg_native_json: (a: number, b: number) => [number, number, number, number];
    readonly fabric_device_adopted: () => number;
    readonly fabric_device_handle: () => any;
    readonly fit_polyline_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly probe_webgpu: () => any;
    readonly render_lottie_gpu_json: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly render_scene_gpu_json: (a: number, b: number) => any;
    readonly render_scene_gpu_texture_json: (a: number, b: number) => any;
    readonly render_scene_json: (a: number, b: number) => [number, number, number, number];
    readonly render_svg_cpu_json: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly render_svg_gpu_json: (a: number, b: number, c: number, d: number) => any;
    readonly shape_text_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly shape_text_vertical_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasm_bindgen_b055bf54e8b77daf___convert__closures_____invoke___wasm_bindgen_b055bf54e8b77daf___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_b055bf54e8b77daf___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_b055bf54e8b77daf___convert__closures_____invoke___js_sys_76f24397c5a322f2___Function_fn_wasm_bindgen_b055bf54e8b77daf___JsValue_____wasm_bindgen_b055bf54e8b77daf___sys__Undefined___js_sys_76f24397c5a322f2___Function_fn_wasm_bindgen_b055bf54e8b77daf___JsValue_____wasm_bindgen_b055bf54e8b77daf___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_b055bf54e8b77daf___convert__closures_____invoke___wasm_bindgen_b055bf54e8b77daf___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
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
