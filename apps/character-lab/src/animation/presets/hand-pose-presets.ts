/**
 * 손 포즈 프리셋 8종(SLOT_PRESET_IDS["hand-pose"] 어휘와 1:1). 손가락 30본(좌 15·우 15)만 담는다.
 * 굴곡·벌림 각(도)은 손 해부학의 일반 가동 범위 안이며(MCP ≤ 90°, PIP ≤ 100°, DIP ≤ 70°)
 * JOINT_LIMITS_DEG의 손가락 제한(swing 95°, twist 10°) 안이다.
 */
import { SLOT_PRESET_IDS } from "../../contracts/preset-vocabulary";

import { fingerCurl, fingerSpread, seq, thumbCurl, thumbSpread, type Side } from "./rotation-dsl";

import type { HumanoidBoneName } from "../../contracts/bones";
import type { HandPosePreset, Pose, Quat } from "../../contracts/pose";
import type { HandPosePresetName } from "../../contracts/preset-vocabulary";

type Finger = "Index" | "Middle" | "Ring" | "Little";

interface FingerSpec {
  /** [근위, 중위, 원위] 굴곡(도) */
  readonly curl: readonly [number, number, number];
  /** 벌림(도, 엄지 쪽 양수) */
  readonly spread?: number;
}

interface ThumbSpec {
  /** [중수, 근위, 원위] 굴곡(도) */
  readonly curl: readonly [number, number, number];
  /** 벌림(도, 검지에서 멀어지면 양수) */
  readonly spread?: number;
}

interface HandSpec {
  readonly labelKo: string;
  readonly thumb: ThumbSpec;
  readonly index: FingerSpec;
  readonly middle: FingerSpec;
  readonly ring: FingerSpec;
  readonly little: FingerSpec;
}

const FIST: FingerSpec = { curl: [85, 90, 60] };
const STRAIGHT: FingerSpec = { curl: [0, 0, 0] };

const SPECS: Readonly<Record<HandPosePresetName, HandSpec>> = {
  relaxed: {
    labelKo: "편안한 손",
    thumb: { curl: [10, 15, 10], spread: 10 },
    index: { curl: [18, 22, 12] },
    middle: { curl: [22, 26, 14] },
    ring: { curl: [26, 30, 16], spread: -3 },
    little: { curl: [30, 32, 18], spread: -6 },
  },
  fist: {
    labelKo: "주먹",
    thumb: { curl: [40, 45, 35], spread: -10 },
    index: FIST,
    middle: FIST,
    ring: FIST,
    little: FIST,
  },
  open: {
    labelKo: "펼친 손",
    thumb: { ...STRAIGHT, spread: 35 },
    index: { ...STRAIGHT, spread: 12 },
    middle: { ...STRAIGHT, spread: 3 },
    ring: { ...STRAIGHT, spread: -8 },
    little: { ...STRAIGHT, spread: -18 },
  },
  point: {
    labelKo: "가리키기",
    thumb: { curl: [30, 35, 25], spread: 5 },
    index: { ...STRAIGHT, spread: 4 },
    middle: FIST,
    ring: FIST,
    little: FIST,
  },
  peace: {
    labelKo: "브이",
    thumb: { curl: [35, 40, 30], spread: 0 },
    index: { ...STRAIGHT, spread: 14 },
    middle: { ...STRAIGHT, spread: -10 },
    ring: FIST,
    little: FIST,
  },
  "thumbs-up": {
    labelKo: "엄지 척",
    thumb: { ...STRAIGHT, spread: 45 },
    index: FIST,
    middle: FIST,
    ring: FIST,
    little: FIST,
  },
  ok: {
    labelKo: "오케이",
    thumb: { curl: [30, 40, 25], spread: 15 },
    index: { curl: [55, 65, 45], spread: 6 },
    middle: { curl: [8, 10, 6], spread: 2 },
    ring: { curl: [10, 12, 8], spread: -6 },
    little: { curl: [12, 14, 10], spread: -14 },
  },
  rock: {
    labelKo: "록",
    thumb: { curl: [35, 40, 30], spread: -5 },
    index: { ...STRAIGHT, spread: 10 },
    middle: FIST,
    ring: FIST,
    little: { ...STRAIGHT, spread: -16 },
  },
};

function fingerBones(side: Side, finger: Finger): readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName] {
  return [`${side}${finger}Proximal`, `${side}${finger}Intermediate`, `${side}${finger}Distal`];
}

function thumbBones(side: Side): readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName] {
  return [`${side}ThumbMetacarpal`, `${side}ThumbProximal`, `${side}ThumbDistal`];
}

function nonIdentity(q: Quat): boolean {
  return Math.abs(q[0]) > 1e-12 || Math.abs(q[1]) > 1e-12 || Math.abs(q[2]) > 1e-12;
}

function buildHand(side: Side, spec: HandSpec): Pose {
  const pose: Pose = {};
  const put = (bone: HumanoidBoneName, q: Quat): void => {
    if (nonIdentity(q)) pose[bone] = q;
  };
  const [tm, tp, td] = thumbBones(side);
  put(tm, seq(thumbSpread(side, spec.thumb.spread ?? 0), thumbCurl(side, spec.thumb.curl[0])));
  put(tp, thumbCurl(side, spec.thumb.curl[1]));
  put(td, thumbCurl(side, spec.thumb.curl[2]));
  const fingers: ReadonlyArray<readonly [Finger, FingerSpec]> = [
    ["Index", spec.index],
    ["Middle", spec.middle],
    ["Ring", spec.ring],
    ["Little", spec.little],
  ];
  for (const [finger, fingerSpec] of fingers) {
    const [proximal, intermediate, distal] = fingerBones(side, finger);
    put(proximal, seq(fingerSpread(side, fingerSpec.spread ?? 0), fingerCurl(side, fingerSpec.curl[0])));
    put(intermediate, fingerCurl(side, fingerSpec.curl[1]));
    put(distal, fingerCurl(side, fingerSpec.curl[2]));
  }
  return pose;
}

/** 어휘 순서대로 8개 */
export const HAND_POSE_PRESETS: readonly HandPosePreset[] = SLOT_PRESET_IDS["hand-pose"].map((name) => {
  const spec = SPECS[name];
  return { id: `hand-pose/${name}`, labelKo: spec.labelKo, left: buildHand("left", spec), right: buildHand("right", spec) };
});

export function findHandPosePreset(name: HandPosePresetName): HandPosePreset {
  const found = HAND_POSE_PRESETS.find((preset) => preset.id === `hand-pose/${name}`);
  if (!found) throw new Error(`손 포즈 프리셋이 없습니다: ${name}`);
  return found;
}
