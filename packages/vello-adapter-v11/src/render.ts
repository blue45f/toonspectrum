import {
  UnsupportedSceneFeatureError,
  sceneIRSchema,
} from "@toonspectrum/project-model-v11";


import init, {
  adapter_version,
  render_scene_json,
} from "../../../crates/vello-adapter-v11/pkg/vello_adapter_v11.js";

import type { InitInput } from "../../../crates/vello-adapter-v11/pkg/vello_adapter_v11.js";
import type { SceneIR } from "@toonspectrum/project-model-v11";

/**
 * JS boundary of the Vello CPU provider. The wasm module is the crate at
 * crates/vello-adapter-v11 (committed pkg build, INTEGRITY.sha256 pinned);
 * this wrapper owns init lifecycle, zod normalization and error mapping.
 */

export type VelloInitInput = InitInput;

let initialized: Promise<void> | null = null;

/** Idempotent wasm init. Pass bytes/module/URL depending on host environment. */
export function loadVelloWasm(moduleOrPath?: VelloInitInput): Promise<void> {
  initialized ??= (
    moduleOrPath === undefined
      ? init()
      : init({ module_or_path: moduleOrPath })
  ).then(() => undefined);
  return initialized;
}

const FEATURE_ERROR_MARKER = "cannot render required scene features:";

/**
 * Renders a SceneIR to straight RGBA8 bytes. Input is normalized through the
 * canonical zod schema first, so schema defaults (opacity, blend, …) are
 * always materialized before crossing the serde boundary.
 */
export function renderSceneToPixels(scene: SceneIR): Uint8Array {
  if (initialized === null) {
    throw new Error("vello wasm not initialized — call loadVelloWasm() first");
  }
  const normalized = sceneIRSchema.parse(scene);
  try {
    return render_scene_json(JSON.stringify(normalized));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const markerIndex = message.indexOf(FEATURE_ERROR_MARKER);
    if (markerIndex >= 0) {
      const features = message
        .slice(markerIndex + FEATURE_ERROR_MARKER.length)
        .split(",")
        .map((feature) => feature.trim())
        .filter((feature) => feature.length > 0);
      throw new UnsupportedSceneFeatureError("vello-cpu", features);
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

export function adapterVersion(): string {
  if (initialized === null) {
    throw new Error("vello wasm not initialized — call loadVelloWasm() first");
  }
  return adapter_version();
}
