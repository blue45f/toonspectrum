/**
 * VRM 캐릭터 스테이징 모델.
 *
 * VRM 아바타(@pixiv/three-vrm)에 포즈·표정을 지정하고 웹툰 컷 구도에
 * 배치하기 위한 명세 모듈. 실제 VRM 로딩·본 조작은 vrm 도메인의 렌더러가
 * 담당하고, 이 모듈은 "어떤 포즈/표정으로 어디에 둘지"만 다룬다.
 *
 * 관절 회전은 XYZ 오일러(deg), 표정은 0..1 가중치로 정규화한다.
 * VRM 1.0 Expression과 VRM 0.x BlendShape 이름을 함께 제공한다.
 */

/** 스테이징에 쓰는 최소 휴머노이드 관절 집합. */
export type XrVrmJoint =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "upperArmL"
  | "lowerArmL"
  | "upperArmR"
  | "lowerArmR"
  | "upperLegL"
  | "lowerLegL"
  | "upperLegR"
  | "lowerLegR";

/** XYZ 오일러 회전(deg). */
export type XrVrmJointRotation = readonly [number, number, number];

export type XrVrmPoseId = "stand" | "sit" | "walk" | "wave" | "bow" | "action";

export interface XrVrmPosePreset {
  readonly id: XrVrmPoseId;
  readonly label: { readonly ko: string; readonly en: string };
  /** 생략된 관절은 중립(0,0,0)으로 둔다. */
  readonly joints: Partial<Record<XrVrmJoint, XrVrmJointRotation>>;
}

const NEUTRAL: XrVrmJointRotation = [0, 0, 0];

export const XR_VRM_POSE_PRESETS: Readonly<Record<XrVrmPoseId, XrVrmPosePreset>> =
  Object.freeze({
    stand: {
      id: "stand",
      label: { ko: "서 있기", en: "Standing" },
      joints: {},
    },
    sit: {
      id: "sit",
      label: { ko: "앉기", en: "Sitting" },
      joints: {
        hips: [-90, 0, 0],
        upperLegL: [90, 0, 0],
        lowerLegL: [-90, 0, 0],
        upperLegR: [90, 0, 0],
        lowerLegR: [-90, 0, 0],
        spine: [8, 0, 0],
      },
    },
    walk: {
      id: "walk",
      label: { ko: "걷기", en: "Walking" },
      joints: {
        upperLegL: [28, 0, 0],
        lowerLegL: [-12, 0, 0],
        upperLegR: [-24, 0, 0],
        lowerLegR: [-6, 0, 0],
        upperArmL: [-20, 0, 8],
        lowerArmL: [-18, 0, 0],
        upperArmR: [22, 0, -8],
        lowerArmR: [-14, 0, 0],
        spine: [4, 6, 0],
      },
    },
    wave: {
      id: "wave",
      label: { ko: "손 흔들기", en: "Waving" },
      joints: {
        upperArmR: [0, 0, -150],
        lowerArmR: [0, 0, -25],
        head: [0, 0, 8],
        spine: [0, 0, -4],
      },
    },
    bow: {
      id: "bow",
      label: { ko: "인사", en: "Bowing" },
      joints: {
        spine: [35, 0, 0],
        chest: [15, 0, 0],
        neck: [12, 0, 0],
        head: [8, 0, 0],
        upperArmL: [12, 0, 6],
        upperArmR: [12, 0, -6],
      },
    },
    action: {
      id: "action",
      label: { ko: "액션", en: "Action pose" },
      joints: {
        hips: [-12, 0, 0],
        spine: [-8, 12, 0],
        chest: [0, 10, 0],
        upperArmR: [-70, 0, -30],
        lowerArmR: [-40, 0, 0],
        upperArmL: [30, 0, 25],
        lowerArmL: [-50, 0, 0],
        upperLegL: [35, 0, 0],
        lowerLegL: [-45, 0, 0],
        upperLegR: [-20, 0, 0],
        lowerLegR: [-15, 0, 0],
        head: [0, -14, 0],
      },
    },
  });

export type XrVrmExpressionId = "neutral" | "happy" | "sad" | "angry" | "surprised";

export interface XrVrmExpressionPreset {
  readonly id: XrVrmExpressionId;
  readonly label: { readonly ko: string; readonly en: string };
  /** VRM 1.0 Expression 프리셋 이름 → 가중치. */
  readonly vrm1: Partial<Record<string, number>>;
  /** VRM 0.x BlendShape 이름 → 가중치. */
  readonly vrm0: Partial<Record<string, number>>;
}

export const XR_VRM_EXPRESSION_PRESETS: Readonly<
  Record<XrVrmExpressionId, XrVrmExpressionPreset>
> = Object.freeze({
  neutral: {
    id: "neutral",
    label: { ko: "무표정", en: "Neutral" },
    vrm1: { neutral: 1 },
    vrm0: {},
  },
  happy: {
    id: "happy",
    label: { ko: "기쁨", en: "Happy" },
    vrm1: { happy: 1 },
    vrm0: { joy: 1 },
  },
  sad: {
    id: "sad",
    label: { ko: "슬픔", en: "Sad" },
    vrm1: { sad: 0.9 },
    vrm0: { sorrow: 0.9 },
  },
  angry: {
    id: "angry",
    label: { ko: "분노", en: "Angry" },
    vrm1: { angry: 1 },
    vrm0: { angry: 1 },
  },
  surprised: {
    id: "surprised",
    label: { ko: "놀람", en: "Surprised" },
    vrm1: { surprised: 1, aa: 0.6 },
    vrm0: { surprised: 1 },
  },
});

function clampWeight(w: number): number {
  if (!Number.isFinite(w)) return 0;
  return Math.min(1, Math.max(0, w));
}

/** 관절 회전을 정규화한다. 생략된 관절은 중립으로 채운다. */
export function xrVrmResolvePose(
  preset: XrVrmPosePreset,
): Record<XrVrmJoint, XrVrmJointRotation> {
  const joints: XrVrmJoint[] = [
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "upperArmL",
    "lowerArmL",
    "upperArmR",
    "lowerArmR",
    "upperLegL",
    "lowerLegL",
    "upperLegR",
    "lowerLegR",
  ];
  const resolved = {} as Record<XrVrmJoint, XrVrmJointRotation>;
  for (const joint of joints) {
    const r = preset.joints[joint];
    resolved[joint] = r ? ([r[0], r[1], r[2]] as XrVrmJointRotation) : NEUTRAL;
  }
  return resolved;
}

/** 두 포즈를 t(0..1)로 선형 보간한다. 애니메이션 전환용. */
export function xrVrmBlendPose(
  a: XrVrmPosePreset,
  b: XrVrmPosePreset,
  t: number,
): Record<XrVrmJoint, XrVrmJointRotation> {
  const tt = clampWeight(t);
  const ra = xrVrmResolvePose(a);
  const rb = xrVrmResolvePose(b);
  const out = {} as Record<XrVrmJoint, XrVrmJointRotation>;
  (Object.keys(ra) as XrVrmJoint[]).forEach((joint) => {
    const va = ra[joint];
    const vb = rb[joint];
    out[joint] = [
      va[0] + (vb[0] - va[0]) * tt,
      va[1] + (vb[1] - va[1]) * tt,
      va[2] + (vb[2] - va[2]) * tt,
    ];
  });
  return out;
}

/** 표정 가중치를 0..1로 정규화한다. */
export function xrVrmResolveExpression(
  preset: XrVrmExpressionPreset,
): { readonly vrm1: Record<string, number>; readonly vrm0: Record<string, number> } {
  const norm = (src: Partial<Record<string, number>>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(src)) {
      out[k] = clampWeight(v ?? 0);
    }
    return out;
  };
  return { vrm1: norm(preset.vrm1), vrm0: norm(preset.vrm0) };
}

export interface XrVrmStagePlacement {
  /** 컷 평면상 위치(0..1 정규화 좌표). */
  readonly x: number;
  readonly y: number;
  /** 캐릭터 크기(컷 높이 대비 비율). */
  readonly scale: number;
  /** Y축 회전(deg). 0 = 정면. */
  readonly rotationYDeg: number;
  /** 좌우 반전. */
  readonly mirrored: boolean;
}

export function xrVrmStagePlacement(input: {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotationYDeg?: number;
  readonly mirrored?: boolean;
}): XrVrmStagePlacement {
  const num = (v: number | undefined, fallback: number): number =>
    Number.isFinite(v) ? (v as number) : fallback;
  return {
    x: Math.min(1, Math.max(0, num(input.x, 0.5))),
    y: Math.min(1, Math.max(0, num(input.y, 0.5))),
    scale: Math.min(2, Math.max(0.1, num(input.scale, 0.8))),
    rotationYDeg: num(input.rotationYDeg, 0),
    mirrored: input.mirrored === true,
  };
}

export interface XrVrmStagingDescriptor {
  readonly kind: "toonstudio.xr-vrm-staging";
  readonly poseId: XrVrmPoseId;
  readonly expressionId: XrVrmExpressionId;
  readonly placement: XrVrmStagePlacement;
}

/** 스테이징 명세를 만든다. 렌더러가 이 명세대로 VRM을 배치한다. */
export function createXrVrmStaging(input: {
  readonly poseId: XrVrmPoseId;
  readonly expressionId: XrVrmExpressionId;
  readonly placement?: {
    readonly x?: number;
    readonly y?: number;
    readonly scale?: number;
    readonly rotationYDeg?: number;
    readonly mirrored?: boolean;
  };
}): XrVrmStagingDescriptor {
  if (!XR_VRM_POSE_PRESETS[input.poseId]) {
    throw new Error(`Unknown VRM pose: ${String(input.poseId)}`);
  }
  if (!XR_VRM_EXPRESSION_PRESETS[input.expressionId]) {
    throw new Error(`Unknown VRM expression: ${String(input.expressionId)}`);
  }
  return Object.freeze({
    kind: "toonstudio.xr-vrm-staging",
    poseId: input.poseId,
    expressionId: input.expressionId,
    placement: xrVrmStagePlacement(input.placement ?? {}),
  });
}
