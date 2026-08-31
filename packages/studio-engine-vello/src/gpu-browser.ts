import {
  UnsupportedSceneFeatureError,
  sceneIRSchema,
} from "@toonspectrum/studio-project-model";

import type { InitInput } from "../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js";
import type { SceneIR } from "@toonspectrum/studio-project-model";

/**
 * Browser WebGPU lane of the Vello provider (ADR-0011 lane 2, V12 §4.1).
 *
 * Wraps the `pkg-gpu/` wasm-pack artifact (vello 0.9 GPU + wgpu 29, built with
 * `--features gpu`), which is loaded dynamically so the default CPU lane never
 * pays for the ~4.3MB GPU module. The artifact also carries the identical
 * vello_cpu 0.2.0 pin, which `compareGpuVsCpu` uses as the deterministic
 * reference — the same pairing the native Metal parity gate validated
 * (`crates/studio-engine-vello/tests/gpu_parity.rs`).
 *
 * Contract: WebGPU absence is an explicit error (`loadVelloGpuBrowser`) or an
 * explicit `{ supported: false }` report (`probeWebGpu`) — never a silent
 * substitute. Callers receive the explicit failure and must not switch the
 * active provider binding automatically.
 */

type VelloGpuModule = typeof import("../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js");

export type VelloGpuInitInput = InitInput;

export interface WebGpuAdapterInfo {
  name: string;
  backend: string;
  deviceType: string;
  driver: string;
  driverInfo: string;
}

export type WebGpuProbeResult =
  | { supported: true; adapter: WebGpuAdapterInfo; engine: string }
  | { supported: false; reason: string };

export interface GpuCpuComparison {
  width: number;
  height: number;
  gpuPixels: Uint8Array;
  cpuPixels: Uint8Array;
  fuzzyMismatchPct: number;
}

const WEBGPU_MISSING_MESSAGE =
  "WebGPU is unavailable in this environment (navigator.gpu missing) — " +
  "the selected vello-gpu-browser lane requires a WebGPU-capable browser; " +
  "the lane remains unavailable until the caller explicitly selects another provider";

const FEATURE_ERROR_MARKER = "cannot render required scene features:";

/** Same δ48 tolerance as tests/visual/cross-renderer-diff.test.ts. */
const FUZZY_DELTA = 48;

let initialized: Promise<VelloGpuModule> | null = null;

/** True when the host exposes a WebGPU entry point (`navigator.gpu`). */
export function hasWebGpu(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { gpu?: unknown }).gpu != null
  );
}

async function importAndInit(moduleOrPath?: VelloGpuInitInput): Promise<VelloGpuModule> {
  const module = await import(
    "../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js"
  );
  await (moduleOrPath === undefined
    ? module.default()
    : module.default({ module_or_path: moduleOrPath }));
  return module;
}

/**
 * Idempotent pkg-gpu wasm init. Rejects with an explicit error when the host
 * has no WebGPU entry point — loading 4.3MB of GPU wasm without `navigator.gpu`
 * would only defer the failure to the first render.
 */
export function loadVelloGpuBrowser(
  moduleOrPath?: VelloGpuInitInput,
): Promise<VelloGpuModule> {
  if (!hasWebGpu()) {
    return Promise.reject(new Error(WEBGPU_MISSING_MESSAGE));
  }
  initialized ??= importAndInit(moduleOrPath).catch((error: unknown) => {
    // A failed init must not poison later retries with a stale promise.
    initialized = null;
    throw error instanceof Error ? error : new Error(String(error));
  });
  return initialized;
}

function requireInitialized(): Promise<VelloGpuModule> {
  if (initialized === null) {
    throw new Error(
      "vello gpu wasm not initialized — call loadVelloGpuBrowser() first",
    );
  }
  return initialized;
}

/**
 * Probes WebGPU adapter availability. Never throws: environments without
 * WebGPU (including Node test runs) resolve `{ supported: false }` with the
 * concrete reason, without downloading the wasm module.
 */
export async function probeWebGpu(): Promise<WebGpuProbeResult> {
  if (!hasWebGpu()) {
    return { supported: false, reason: WEBGPU_MISSING_MESSAGE };
  }
  const module = await loadVelloGpuBrowser();
  const raw: unknown = JSON.parse(await module.probe_webgpu());
  return parseProbeResult(raw);
}

function parseProbeResult(raw: unknown): WebGpuProbeResult {
  if (typeof raw === "object" && raw !== null && "supported" in raw) {
    const record = raw as Record<string, unknown>;
    if (record.supported === true && typeof record.engine === "string") {
      const adapter = record.adapter as Record<string, unknown> | undefined;
      if (adapter && typeof adapter.name === "string") {
        return {
          supported: true,
          engine: record.engine,
          adapter: {
            name: adapter.name,
            backend: String(adapter.backend ?? ""),
            deviceType: String(adapter.deviceType ?? ""),
            driver: String(adapter.driver ?? ""),
            driverInfo: String(adapter.driverInfo ?? ""),
          },
        };
      }
    }
    if (record.supported === false && typeof record.reason === "string") {
      return { supported: false, reason: record.reason };
    }
  }
  throw new Error(`unrecognized probe_webgpu payload: ${JSON.stringify(raw)}`);
}

/**
 * Renders a SceneIR on the browser WebGPU device to straight RGBA8 bytes.
 * Input is normalized through the canonical zod schema first, mirroring the
 * CPU lane, so schema defaults are materialized before the serde boundary.
 */
export async function renderSceneToPixelsGpu(scene: SceneIR): Promise<Uint8Array> {
  const module = await requireInitialized();
  const normalized = sceneIRSchema.parse(scene);
  try {
    return await module.render_scene_gpu_json(JSON.stringify(normalized));
  } catch (error) {
    throw mapRenderError(error);
  }
}

function mapRenderError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const markerIndex = message.indexOf(FEATURE_ERROR_MARKER);
  if (markerIndex >= 0) {
    const features = message
      .slice(markerIndex + FEATURE_ERROR_MARKER.length)
      .split(",")
      .map((feature) => feature.trim())
      .filter((feature) => feature.length > 0);
    return new UnsupportedSceneFeatureError("vello-gpu-browser", features);
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * Adopts a `GPUDevice` the caller owns (StudioGpuFabric's single-owner device)
 * as the device the vello wasm module renders on — V12 §6.1 single device
 * ownership, build track B (`--features fabric`, backed by the
 * `crates/vendor/wgpu-toon` patch).
 *
 * Call this before the first render: the module installs a device singleton on
 * first use, and `renderSceneToTextureGpu` refuses to hand out a texture from a
 * self-owned device (it could not be shared).
 *
 * wgpu never destroys an adopted handle, so the fabric's lease/refcount policy
 * stays authoritative.
 */
export async function adoptGpuDevice(device: GPUDevice): Promise<void> {
  const module = await requireInitialized();
  module.adopt_gpu_device(device);
}

/** True once {@link adoptGpuDevice} installed an external device. */
export async function isGpuDeviceAdopted(): Promise<boolean> {
  const module = await requireInitialized();
  return module.fabric_device_adopted();
}

/**
 * The `GPUDevice` the wasm module currently renders on, or `null` before
 * initialization. Compare it by identity against the fabric device to prove
 * adoption really happened rather than assuming it.
 */
export async function gpuDeviceHandle(): Promise<GPUDevice | null> {
  const module = await requireInitialized();
  return (module.fabric_device_handle() as GPUDevice | null) ?? null;
}

/**
 * Renders a SceneIR on the adopted device and resolves with the raw
 * `GPUTexture` — no readback, no pixel array crossing the wasm boundary
 * (V12 §6.3 L4). The caller owns the returned texture.
 *
 * `rgba8unorm`, usage `STORAGE_BINDING | COPY_SRC | TEXTURE_BINDING`.
 */
export async function renderSceneToTextureGpu(scene: SceneIR): Promise<GPUTexture> {
  const module = await requireInitialized();
  const normalized = sceneIRSchema.parse(scene);
  try {
    return (await module.render_scene_gpu_texture_json(
      JSON.stringify(normalized),
    )) as GPUTexture;
  } catch (error) {
    throw mapRenderError(error);
  }
}

function directionalMismatches(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const other = (ny * width + nx) * 4;
          let channelMax = 0;
          for (let c = 0; c < 4; c += 1) {
            const delta = Math.abs((from[base + c] ?? 0) - (to[other + c] ?? 0));
            if (delta > channelMax) channelMax = delta;
          }
          if (channelMax <= FUZZY_DELTA) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

/**
 * Symmetric 3×3-neighborhood fuzzy mismatch (δ≤48 per channel), the same
 * metric as tests/visual/cross-renderer-diff.test.ts and the native GPU
 * parity harness. Implemented locally on purpose: this package must stay
 * importable in a browser without pulling test harness code.
 */
export function fuzzyMismatchPct(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
): number {
  const expected = width * height * 4;
  if (a.length !== expected || b.length !== expected) {
    throw new Error(
      `pixel buffer size mismatch: expected ${expected}, got ${a.length} and ${b.length}`,
    );
  }
  const worst = Math.max(
    directionalMismatches(a, b, width, height),
    directionalMismatches(b, a, width, height),
  );
  return (worst / (width * height)) * 100;
}

/**
 * Renders the scene through both lanes of the loaded pkg-gpu module — WebGPU
 * (vello 0.9) and the embedded deterministic vello_cpu 0.2.0 reference — and
 * reports the δ48 fuzzy mismatch. This is the browser-side equivalent of the
 * native Metal parity gate (0.6% ceiling in ADR-0011 lane 2).
 */
export async function compareGpuVsCpu(scene: SceneIR): Promise<GpuCpuComparison> {
  const module = await requireInitialized();
  const normalized = sceneIRSchema.parse(scene);
  const json = JSON.stringify(normalized);
  let gpuPixels: Uint8Array;
  try {
    gpuPixels = await module.render_scene_gpu_json(json);
  } catch (error) {
    throw mapRenderError(error);
  }
  const cpuPixels = module.render_scene_json(json);
  return {
    width: normalized.width,
    height: normalized.height,
    gpuPixels,
    cpuPixels,
    fuzzyMismatchPct: fuzzyMismatchPct(
      gpuPixels,
      cpuPixels,
      normalized.width,
      normalized.height,
    ),
  };
}
