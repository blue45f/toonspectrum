import { canonicalJson, fnv1a64Hex } from "./digest";

import type { AnimationGraphIR } from "./animation";
import type { ComicGraphIR } from "./comic";
import type { EffectGraphIR } from "./effect";
import type { SceneIR } from "./scene";

/**
 * ProjectStateIR — the full replayable project state (V11.1 §10).
 *
 * The scene layer stays the only pixel/vector source of truth; the comic,
 * animation and effect graphs hang off the same journaled state so one
 * CommandBus dispatch stream reconstructs all four layers deterministically.
 *
 * Backward compatibility contract: a legacy journal (scene commands only)
 * replays to `{ scene, comic: null, animation: null, effects: null }` — the
 * scene value and `sceneDigest` are bit-identical to what the scene-only
 * reducer produced, so existing digests, snapshots and fixtures keep verifying.
 */
export interface ProjectStateIR {
  scene: SceneIR;
  comic: ComicGraphIR | null;
  animation: AnimationGraphIR | null;
  effects: EffectGraphIR | null;
}

/** Bootstraps a project around an initialized scene; graph layers start empty. */
export function createProjectState(scene: SceneIR): ProjectStateIR {
  return { scene, comic: null, animation: null, effects: null };
}

/**
 * fnv1a64Hex over the canonical JSON of the whole project state.
 *
 * `sceneDigest` is intentionally left untouched (it still identifies the scene
 * layer alone, and legacy snapshots keep verifying against it); projectDigest
 * is the new whole-project identity used by v2 snapshots and parity checks.
 * Note the two digests differ even when all graphs are null — projectDigest
 * hashes the wrapper object, never a bare scene.
 */
export function projectDigest(state: ProjectStateIR): string {
  return fnv1a64Hex(
    canonicalJson({
      scene: state.scene,
      comic: state.comic,
      animation: state.animation,
      effects: state.effects,
    }),
  );
}
