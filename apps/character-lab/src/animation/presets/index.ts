/**
 * 연기 프리셋(표정 12·포즈 10·손 포즈 8 = 30)을 카탈로그 PresetEntry로 만든다.
 * core의 catalog-registry가 APPEARANCE_PRESETS(64)와 병합해 catalogInvariants를 실행한다.
 */
import { DEFAULT_FRAMING, FACE_FRAMING } from "../../contracts/capture";
import { FACS_UNITS } from "../../contracts/expression";
import { facsMorphName } from "../../contracts/morph-names";

import { EXPRESSION_PRESETS } from "./expression-presets";
import { HAND_POSE_PRESETS } from "./hand-pose-presets";
import { POSE_PRESETS } from "./pose-presets";

import type { CameraFraming } from "../../contracts/capture";
import type { PresetEntry } from "../../contracts/catalog";
import type { ExpressionPreset } from "../../contracts/expression";
import type { HandPosePreset, Pose, PosePreset } from "../../contracts/pose";

export { EXPRESSION_PRESETS, findExpressionPreset } from "./expression-presets";
export { HAND_POSE_PRESETS, findHandPosePreset } from "./hand-pose-presets";
export { POSE_PRESETS, findPosePreset } from "./pose-presets";

/** 손 포즈 썸네일: 상반신 프레이밍을 약간 당겨 손이 보이게 한다. */
export const HAND_POSE_FRAMING: CameraFraming = Object.freeze({ mode: "bust", yawDeg: 0, pitchDeg: -10, distanceScale: 1.15 });

function poseRequirements(pose: Pose): string[] {
  return Object.keys(pose).map((bone) => `bone:${bone}`);
}

function expressionEntry(preset: ExpressionPreset): PresetEntry {
  const requires = FACS_UNITS.filter((unit) => (preset.weights[unit] ?? 0) > 0).map((unit) => `morph:${facsMorphName(unit)}`);
  return {
    id: preset.id,
    slot: "expression",
    labelKo: preset.labelKo,
    patch: { expression: preset.weights },
    requires,
    conflictsWith: [],
    thumbnailFraming: FACE_FRAMING,
    license: "original",
  };
}

function poseEntry(preset: PosePreset): PresetEntry {
  return {
    id: preset.id,
    slot: "pose",
    labelKo: preset.labelKo,
    patch: { pose: preset.pose },
    requires: poseRequirements(preset.pose),
    conflictsWith: [],
    thumbnailFraming: DEFAULT_FRAMING,
    license: "original",
  };
}

function handPoseEntry(preset: HandPosePreset): PresetEntry {
  const requires = [...new Set([...poseRequirements(preset.left), ...poseRequirements(preset.right)])];
  return {
    id: preset.id,
    slot: "hand-pose",
    labelKo: preset.labelKo,
    patch: { handPose: { left: preset.left, right: preset.right } },
    requires,
    conflictsWith: [],
    thumbnailFraming: HAND_POSE_FRAMING,
    license: "original",
  };
}

/** 연기 프리셋 30개(표정 → 포즈 → 손 포즈 순) */
export const PERFORMANCE_PRESETS: readonly PresetEntry[] = Object.freeze([
  ...EXPRESSION_PRESETS.map(expressionEntry),
  ...POSE_PRESETS.map(poseEntry),
  ...HAND_POSE_PRESETS.map(handPoseEntry),
]);
