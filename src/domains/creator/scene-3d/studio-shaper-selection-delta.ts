import { applyShaperSelectionToBodyParams, type ShaperPresetSelection } from "./studio-shaper-model";

import type {
  StudioMannequinBodyParams,
  StudioMannequinCoreParamKey,
  StudioMannequinHeadParamKey,
} from "./studio-mannequin-model";

const BODY_KEYS: readonly StudioMannequinCoreParamKey[] = Object.freeze([
  "heightCm",
  "headCount",
  "shoulderWidth",
  "pelvisWidth",
  "armLength",
  "legLength",
  "build",
]);

const FACE_KEYS: readonly StudioMannequinHeadParamKey[] = Object.freeze([
  "faceWidth",
  "chinLength",
]);

function assignKeys(
  target: StudioMannequinBodyParams,
  source: StudioMannequinBodyParams,
  keys: readonly (keyof StudioMannequinBodyParams)[],
): StudioMannequinBodyParams {
  const next = { ...target };
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number") next[key] = value;
  }
  return next;
}

/**
 * Applies only categories that changed between two controlled selections. This prevents an eye or
 * pose card from silently resetting an artist's manually tuned shoulders, legs, or face silhouette.
 * The full planner still supplies each category's canonical values, so preview and commit share the
 * same recipe authority.
 */
export function applyShaperSelectionDeltaToBodyParams(
  current: StudioMannequinBodyParams,
  previousSelection: ShaperPresetSelection,
  nextSelection: ShaperPresetSelection,
): StudioMannequinBodyParams {
  const planned = applyShaperSelectionToBodyParams(current, nextSelection);
  let next = { ...current };

  if (previousSelection.body !== nextSelection.body) {
    next = assignKeys(next, planned, BODY_KEYS);
  }
  if (previousSelection.face !== nextSelection.face) {
    next = assignKeys(next, planned, FACE_KEYS);
  }
  if (previousSelection.eye !== nextSelection.eye && typeof planned.eyeScale === "number") {
    next = { ...next, eyeScale: planned.eyeScale };
  }
  if (previousSelection.nose !== nextSelection.nose && typeof planned.noseHeight === "number") {
    next = { ...next, noseHeight: planned.noseHeight };
  }

  return next;
}
