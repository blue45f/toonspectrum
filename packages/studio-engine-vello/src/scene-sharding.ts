import {
  UnsupportedSceneFeatureError,
  composeShardPixels,
  encodeSceneToRenderJson,
  extractShardRectPixels,
} from "@toonspectrum/studio-project-model";

import { render_scene_json } from "../../../crates/studio-engine-vello/pkg/studio_engine_vello.js";

import { assertVelloInitialized, renderSceneToPixels } from "./render";

import type {
  SceneFragmentCache,
  SceneIR,
  SceneShardingPlanIR,
  ShardPixels,
} from "@toonspectrum/studio-project-model";

/**
 * Render access for V12 §3.4 scene sharding and §3.5 fragment recordings.
 *
 * The sharding/fragment model itself is pure IR (studio-project-model
 * scene-sharding.ts); this module connects it to the vello_cpu wasm lane:
 * shard-by-shard rendering + disjoint blit composition, and a render entry
 * that feeds the fragment cache's canonical encoding straight to the wasm
 * boundary so unchanged subtrees skip zod + JSON re-encoding.
 *
 * The existing `renderSceneToPixels` path is untouched — these are additive
 * entries over the same committed pkg build.
 */

// Same marker contract as render.ts — the wasm boundary reports unsupported
// scene features through this message shape (absolute rule: never skip nodes).
const FEATURE_ERROR_MARKER = "cannot render required scene features:";

function renderRenderJson(json: string): Uint8Array {
  assertVelloInitialized();
  try {
    return render_scene_json(json);
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

/** Per-shard render sample: wall-clock cost of one shard's isolated render. */
export interface ShardRenderTiming {
  index: number;
  ms: number;
}

export interface ShardedRenderResult {
  /** Full-canvas straight RGBA8 — blit-composed from the shard renders. */
  pixels: Uint8Array;
  /** One entry per shard, in plan order. */
  timings: ShardRenderTiming[];
}

/**
 * Renders every shard of a viewport-grid plan through the vello_cpu lane and
 * composes the results with the disjoint blit: each shard scene renders in the
 * source coordinate space, then only its owned rect is extracted and blitted.
 * Sequential by design (V12 parallelization is v2); the value proven here is
 * that shard composition is pixel-identical to the single render and the
 * sharding overhead is small.
 */
export function renderShardedScene(plan: SceneShardingPlanIR): ShardedRenderResult {
  const timings: ShardRenderTiming[] = [];
  const shardPixels: ShardPixels[] = plan.shards.map((shard) => {
    const start = performance.now();
    const pixels = renderSceneToPixels(shard.scene);
    timings.push({ index: shard.index, ms: performance.now() - start });
    return {
      rect: shard.rect,
      pixels: extractShardRectPixels(
        pixels,
        shard.scene.width,
        shard.scene.height,
        shard.rect,
      ),
    };
  });
  return {
    pixels: composeShardPixels(shardPixels, plan.source.width, plan.source.height),
    timings,
  };
}

/**
 * Fragment-cached render (§3.5): the scene document is assembled from the
 * cache's canonical per-node recordings — byte-equal to the normal boundary
 * encoding — and handed to the wasm renderer directly. Warm calls skip zod
 * normalization and JSON encoding for every unchanged top-level subtree;
 * pixels are bit-identical to {@link renderSceneToPixels} (asserted in tests).
 */
export function renderSceneToPixelsWithFragments(
  scene: SceneIR,
  cache: SceneFragmentCache,
): Uint8Array {
  return renderRenderJson(encodeSceneToRenderJson(scene, cache));
}
