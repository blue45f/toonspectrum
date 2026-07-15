import * as THREE from "three";

import {
  propDefById,
  type PropAnchorDef,
  type PropAttachBone,
  type PropDef,
  type PropFitProfile,
  type PropFitReference,
  type PropGripKind,
  type PropGripProfile,
  type PropHandBone,
  type PropInstance,
  type PropRigSecondary,
  type Vec3,
} from "./studio-vrm-props";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * VRM마다 다른 골격 비율을 소품 제작 기준 치수로 변환하는 측정 결과.
 * 단위는 VRM scene의 world-space meter이며, 불완전한 VRM은 안전한 실측 추정값으로 폴백한다.
 */
export interface VrmPropRigMetrics {
  avatarHeight: number;
  hand: number;
  leftHand: number;
  rightHand: number;
  head: number;
  eyeDistance: number;
  shoulder: number;
  hip: number;
  handSockets: Record<PropHandBone, VrmPropHandSocket>;
  /**
   * 머리 본 로컬 공간의 눈/얼굴 착용 소켓(선글라스·마스크·헤드셋).
   * handSockets 와 같이 본 로컬이라 루트 체형 스케일과 중복 적용하지 않는다.
   */
  faceSocket: VrmPropFaceSocket;
  boneWorldPositions: Partial<Record<VrmPropMetricBone, Vec3>>;
  sources: Record<Exclude<PropFitReference, "none">, PropMetricSource>;
  missingBones: VrmPropMetricBone[];
}

export type Quat4 = readonly [number, number, number, number];

/** hand bone 로컬 공간의 손바닥 중심과 정렬 basis. */
export interface VrmPropHandSocket {
  position: Vec3;
  rotationQuaternion: Quat4;
  rotationDeg: Vec3;
  source: PropMetricSource;
}

/** head bone 로컬 공간의 얼굴/눈 착용 소켓(선글라스·마스크 등). */
export type VrmPropFaceSocket = VrmPropHandSocket;

export type PropMetricSource = "measured" | "derived" | "fallback";

export type VrmPropMetricBone =
  | "hips"
  | "head"
  | "neck"
  | "leftShoulder"
  | "rightShoulder"
  | "leftHand"
  | "rightHand"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftIndexProximal"
  | "rightIndexProximal"
  | "leftMiddleProximal"
  | "rightMiddleProximal"
  | "leftLittleProximal"
  | "rightLittleProximal"
  | "leftUpperLeg"
  | "rightUpperLeg"
  | "leftFoot"
  | "rightFoot";

export const PROP_RIG_FIT_MIN = 0.25;
export const PROP_RIG_FIT_MAX = 4;

const METRIC_BONES: readonly VrmPropMetricBone[] = [
  "hips",
  "head",
  "neck",
  "leftShoulder",
  "rightShoulder",
  "leftHand",
  "rightHand",
  "leftLowerArm",
  "rightLowerArm",
  "leftIndexProximal",
  "rightIndexProximal",
  "leftMiddleProximal",
  "rightMiddleProximal",
  "leftLittleProximal",
  "rightLittleProximal",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftFoot",
  "rightFoot",
] as const;

const FALLBACK_HAND_SOCKETS: Record<PropHandBone, VrmPropHandSocket> = {
  leftHand: {
    position: [0, -0.035, 0],
    rotationQuaternion: [0, 0, 0, 1],
    rotationDeg: [0, 0, 0],
    source: "fallback",
  },
  rightHand: {
    position: [0, -0.035, 0],
    rotationQuaternion: [0, 0, 0, 1],
    rotationDeg: [0, 0, 0],
    source: "fallback",
  },
};

/** 선글라스 카탈로그 defaultPosition([0,0.02,0.07])과 호환되는 얼굴 소켓 폴백. */
const FALLBACK_FACE_SOCKET: VrmPropFaceSocket = {
  position: [0, 0.02, 0.07],
  rotationQuaternion: [0, 0, 0, 1],
  rotationDeg: [0, 0, 0],
  source: "fallback",
};

const FALLBACK_METRICS: Omit<VrmPropRigMetrics, "boneWorldPositions" | "handSockets" | "faceSocket" | "missingBones"> = {
  avatarHeight: 1.65,
  hand: 0.075,
  leftHand: 0.075,
  rightHand: 0.075,
  head: 0.18,
  eyeDistance: 0.064,
  shoulder: 0.32,
  hip: 0.18,
  sources: {
    avatarHeight: "fallback",
    hand: "fallback",
    head: "fallback",
    eyeDistance: "fallback",
    shoulder: "fallback",
    hip: "fallback",
  },
};

type NumericMetricKey = Exclude<
  keyof VrmPropRigMetrics,
  "boneWorldPositions" | "handSockets" | "faceSocket" | "sources" | "missingBones"
>;

const METRIC_RANGES: Record<NumericMetricKey, readonly [number, number]> = {
  avatarHeight: [0.45, 3.2],
  hand: [0.025, 0.28],
  leftHand: [0.025, 0.28],
  rightHand: [0.025, 0.28],
  head: [0.08, 0.55],
  eyeDistance: [0.025, 0.18],
  shoulder: [0.12, 0.85],
  hip: [0.08, 0.65],
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizedMetric(value: unknown, fallback: number, range: readonly [number, number]): number {
  const number = finite(value) ?? fallback;
  return clamp(number, range[0], range[1]);
}

function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const x = finite(value[0]);
  const y = finite(value[1]);
  const z = finite(value[2]);
  return x === null || y === null || z === null ? null : [x, y, z];
}

function metricSource(value: unknown, fallback: PropMetricSource): PropMetricSource {
  return value === "measured" || value === "derived" || value === "fallback" ? value : fallback;
}

function quaternionTuple(value: unknown): Quat4 | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const components = value.slice(0, 4).map(finite);
  if (components.some((component) => component === null)) return null;
  const quaternion = new THREE.Quaternion(
    components[0]!,
    components[1]!,
    components[2]!,
    components[3]!
  );
  if (quaternion.lengthSq() < 1e-8) return null;
  quaternion.normalize();
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function quaternionDegrees(value: Quat4): Vec3 {
  const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...value), "XYZ");
  return [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ];
}

function sanitizeHandSocket(value: unknown, fallback: VrmPropHandSocket): VrmPropHandSocket {
  const raw = value && typeof value === "object" ? value as Partial<VrmPropHandSocket> : {};
  const position = vec3(raw.position) ?? fallback.position;
  const rotationQuaternion = quaternionTuple(raw.rotationQuaternion) ?? fallback.rotationQuaternion;
  return {
    position,
    rotationQuaternion,
    rotationDeg: quaternionDegrees(rotationQuaternion),
    source: metricSource(raw.source, fallback.source),
  };
}

/** 저장값·외부 모델에서 들어온 NaN/극단값을 렌더링에 안전한 범위로 정규화한다. */
export function sanitizeVrmPropRigMetrics(raw: unknown): VrmPropRigMetrics {
  const value = raw && typeof raw === "object" ? raw as Partial<VrmPropRigMetrics> : {};
  const boneWorldPositions: Partial<Record<VrmPropMetricBone, Vec3>> = {};
  const rawPositions = value.boneWorldPositions;
  if (rawPositions && typeof rawPositions === "object") {
    for (const bone of METRIC_BONES) {
      const position = vec3(rawPositions[bone]);
      if (position) boneWorldPositions[bone] = position;
    }
  }

  const missingBones = METRIC_BONES.filter((bone) => !boneWorldPositions[bone]);
  const rawHandSockets: Partial<VrmPropRigMetrics["handSockets"]> =
    value.handSockets && typeof value.handSockets === "object" ? value.handSockets : {};
  const rawSources = value.sources && typeof value.sources === "object" ? value.sources : FALLBACK_METRICS.sources;
  return {
    avatarHeight: sanitizedMetric(value.avatarHeight, FALLBACK_METRICS.avatarHeight, METRIC_RANGES.avatarHeight),
    hand: sanitizedMetric(value.hand, FALLBACK_METRICS.hand, METRIC_RANGES.hand),
    leftHand: sanitizedMetric(value.leftHand, FALLBACK_METRICS.leftHand, METRIC_RANGES.leftHand),
    rightHand: sanitizedMetric(value.rightHand, FALLBACK_METRICS.rightHand, METRIC_RANGES.rightHand),
    head: sanitizedMetric(value.head, FALLBACK_METRICS.head, METRIC_RANGES.head),
    eyeDistance: sanitizedMetric(value.eyeDistance, FALLBACK_METRICS.eyeDistance, METRIC_RANGES.eyeDistance),
    shoulder: sanitizedMetric(value.shoulder, FALLBACK_METRICS.shoulder, METRIC_RANGES.shoulder),
    hip: sanitizedMetric(value.hip, FALLBACK_METRICS.hip, METRIC_RANGES.hip),
    handSockets: {
      leftHand: sanitizeHandSocket(rawHandSockets.leftHand, FALLBACK_HAND_SOCKETS.leftHand),
      rightHand: sanitizeHandSocket(rawHandSockets.rightHand, FALLBACK_HAND_SOCKETS.rightHand),
    },
    faceSocket: sanitizeHandSocket(value.faceSocket, FALLBACK_FACE_SOCKET),
    boneWorldPositions,
    sources: {
      avatarHeight: metricSource(rawSources.avatarHeight, "fallback"),
      hand: metricSource(rawSources.hand, "fallback"),
      head: metricSource(rawSources.head, "fallback"),
      eyeDistance: metricSource(rawSources.eyeDistance, "fallback"),
      shoulder: metricSource(rawSources.shoulder, "fallback"),
      hip: metricSource(rawSources.hip, "fallback"),
    },
    missingBones,
  };
}

/** 루트 비균일 체형 스케일을 rest-pose 실측값에 합성해 현재 화면 기준 자동 핏을 만든다. */
export function scaleVrmPropRigMetrics(
  rawMetrics: VrmPropRigMetrics,
  bodyScale: { height: number; width: number }
): VrmPropRigMetrics {
  const metrics = sanitizeVrmPropRigMetrics(rawMetrics);
  const height = clamp(finite(bodyScale?.height) ?? 1, 0.5, 1.6);
  const width = clamp(finite(bodyScale?.width) ?? 1, 0.5, 1.6);
  // 손은 모델마다 종축 방향이 달라 한 축만 택하면 T/A 포즈에 따라 튄다. 두 축의 기하평균은
  // 비균일 루트 스케일에서도 회전 방향과 무관한 안정적인 대표 길이를 제공한다.
  const handScale = Math.sqrt(height * width);
  const scalePosition = (value: Vec3): Vec3 => [value[0] * width, value[1] * height, value[2] * width];

  return sanitizeVrmPropRigMetrics({
    ...metrics,
    avatarHeight: metrics.avatarHeight * height,
    hand: metrics.hand * handScale,
    leftHand: metrics.leftHand * handScale,
    rightHand: metrics.rightHand * handScale,
    head: metrics.head * height,
    eyeDistance: metrics.eyeDistance * width,
    shoulder: metrics.shoulder * width,
    hip: metrics.hip * width,
    boneWorldPositions: Object.fromEntries(
      Object.entries(metrics.boneWorldPositions).map(([bone, position]) => [bone, scalePosition(position)])
    ),
  });
}

export const DEFAULT_VRM_PROP_RIG_METRICS: VrmPropRigMetrics = sanitizeVrmPropRigMetrics(null);

function distance(a: Vec3 | undefined, b: Vec3 | undefined): number | null {
  if (!a || !b) return null;
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  const result = Math.hypot(dx, dy, dz);
  return Number.isFinite(result) && result > 1e-5 ? result : null;
}

function measuredOrFallback(
  measured: number | null,
  fallback: number,
  range: readonly [number, number]
): readonly [number, PropMetricSource] {
  return measured === null
    ? [fallback, "fallback"]
    : [sanitizedMetric(measured, fallback, range), "measured"];
}

function quaternionToTuple(quaternion: THREE.Quaternion): Quat4 {
  const normalized = quaternion.clone().normalize();
  return [normalized.x, normalized.y, normalized.z, normalized.w];
}

function stableBasis(
  forwardInput: THREE.Vector3,
  rightInput: THREE.Vector3
): THREE.Quaternion | null {
  const forward = forwardInput.clone();
  if (forward.lengthSq() < 1e-8) return null;
  forward.normalize();
  const right = rightInput.clone().addScaledVector(forward, -rightInput.dot(forward));
  if (right.lengthSq() < 1e-8) {
    const fallbackAxis = Math.abs(forward.x) < 0.8
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    right.copy(fallbackAxis).addScaledVector(forward, -fallbackAxis.dot(forward));
  }
  right.normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const correctedRight = new THREE.Vector3().crossVectors(up, forward).normalize();
  const matrix = new THREE.Matrix4().makeBasis(correctedRight, up, forward);
  return new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
}

function measureHandSocket(
  side: "left" | "right",
  nodes: Partial<Record<VrmPropMetricBone, THREE.Object3D>>,
  positions: Partial<Record<VrmPropMetricBone, Vec3>>
): VrmPropHandSocket {
  const handName = `${side}Hand` as const;
  const lowerArmName = `${side}LowerArm` as const;
  const indexName = `${side}IndexProximal` as const;
  const middleName = `${side}MiddleProximal` as const;
  const littleName = `${side}LittleProximal` as const;
  const fallback = FALLBACK_HAND_SOCKETS[handName];
  const hand = nodes[handName];
  const handPosition = positions[handName];
  if (!hand || !handPosition) return fallback;

  const handWorldQuaternion = hand.getWorldQuaternion(new THREE.Quaternion()).normalize();
  const middlePosition = positions[middleName];
  const indexPosition = positions[indexName];
  const littlePosition = positions[littleName];
  const lowerArmPosition = positions[lowerArmName];

  let forwardWorld: THREE.Vector3 | null = null;
  let socketWorld: THREE.Vector3 | null = null;
  let source: PropMetricSource = "fallback";
  if (middlePosition) {
    const wrist = new THREE.Vector3(...handPosition);
    const middle = new THREE.Vector3(...middlePosition);
    forwardWorld = middle.clone().sub(wrist);
    socketWorld = wrist.clone().lerp(middle, 0.5);
    source = indexPosition && littlePosition ? "measured" : "derived";
  } else if (lowerArmPosition) {
    const wrist = new THREE.Vector3(...handPosition);
    forwardWorld = wrist.clone().sub(new THREE.Vector3(...lowerArmPosition));
    if (forwardWorld.lengthSq() > 1e-8) {
      socketWorld = wrist.clone().add(forwardWorld.clone().normalize().multiplyScalar(0.035));
      source = "derived";
    }
  }

  if (!forwardWorld || !socketWorld || forwardWorld.lengthSq() < 1e-8) return fallback;
  const localPositionVector = hand.worldToLocal(socketWorld.clone());
  const position: Vec3 = [localPositionVector.x, localPositionVector.y, localPositionVector.z];

  let rightWorld: THREE.Vector3;
  if (indexPosition && littlePosition) {
    // index→little 순서를 양손 모두 동일하게 사용하면 결과 basis가 자연스럽게 좌우 반사된다.
    rightWorld = new THREE.Vector3(...indexPosition).sub(new THREE.Vector3(...littlePosition));
  } else {
    rightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(handWorldQuaternion);
  }
  const socketWorldQuaternion = stableBasis(forwardWorld, rightWorld);
  if (!socketWorldQuaternion) {
    return { ...fallback, position, source };
  }
  const socketLocalQuaternion = handWorldQuaternion.clone().invert().multiply(socketWorldQuaternion).normalize();
  const rotationQuaternion = quaternionToTuple(socketLocalQuaternion);
  return {
    position,
    rotationQuaternion,
    rotationDeg: quaternionDegrees(rotationQuaternion),
    source,
  };
}

/**
 * 머리 본 로컬의 눈 착용 소켓. VRM 표준에 눈 본이 없어 head 치수에서 유도한다.
 * 콧등/눈 사이 중앙 전방 — 선글라스·마스크가 떠 보이거나 정수리에 붙는 문제를 줄인다.
 */
export function measureFaceSocket(
  nodes: Partial<Record<VrmPropMetricBone, THREE.Object3D>>,
  positions: Partial<Record<VrmPropMetricBone, Vec3>>,
  headSize: number
): VrmPropFaceSocket {
  const headNode = nodes.head;
  const headPos = positions.head;
  const neckPos = positions.neck;
  if (!headNode || !headPos) return FALLBACK_FACE_SOCKET;

  const safeHead = clamp(headSize, METRIC_RANGES.head[0], METRIC_RANGES.head[1]);
  // 눈 높이는 정수리 쪽이 아니라 머리 중심에서 약간 아래(−Y), 전방(+Z) — VRM head 로컬 관례.
  const y = safeHead * 0.06;
  const z = safeHead * 0.36;
  let source: PropMetricSource = "derived";

  // neck→head 방향이 있으면 고개를 든/숙인 rest 포즈에 맞춰 전방 축을 보정한다.
  if (neckPos) {
    const upWorld = new THREE.Vector3(...headPos).sub(new THREE.Vector3(...neckPos));
    if (upWorld.lengthSq() > 1e-8) {
      source = "measured";
    }
  }

  const position: Vec3 = [0, y, z];
  // 얼굴 전방 basis: local +Z forward, +Y up (wearable 표면이 시선과 수직에 가깝게).
  return {
    position,
    rotationQuaternion: [0, 0, 0, 1],
    rotationDeg: [0, 0, 0],
    source,
  };
}

/**
 * 정규화 humanoid rest pose의 핵심 본을 world-space에서 측정한다.
 * 손가락/발 본이 없는 불완전 VRM도 부분 실측 + 카탈로그 기준 폴백으로 계속 사용할 수 있다.
 */
export function measureVrmPropRigMetrics(vrm: VRM): VrmPropRigMetrics {
  const humanoid = vrm.humanoid;
  if (!humanoid) return sanitizeVrmPropRigMetrics(null);

  try {
    vrm.scene.updateMatrixWorld(true);
  } catch {
    return sanitizeVrmPropRigMetrics(null);
  }

  const boneWorldPositions: Partial<Record<VrmPropMetricBone, Vec3>> = {};
  const boneNodes: Partial<Record<VrmPropMetricBone, THREE.Object3D>> = {};
  for (const bone of METRIC_BONES) {
    try {
      const node = humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
      if (!node) continue;
      boneNodes[bone] = node;
      const position = node.getWorldPosition(new THREE.Vector3());
      if ([position.x, position.y, position.z].every(Number.isFinite)) {
        boneWorldPositions[bone] = [position.x, position.y, position.z];
      }
    } catch {
      // 개별 잘못된 본은 버리고 나머지 실측값을 계속 사용한다.
    }
  }

  const neckToHead = distance(boneWorldPositions.neck, boneWorldPositions.head);
  const [head, headSource] = measuredOrFallback(
    neckToHead === null ? null : neckToHead * 1.2,
    FALLBACK_METRICS.head,
    METRIC_RANGES.head
  );

  const leftHandLength = distance(boneWorldPositions.leftHand, boneWorldPositions.leftMiddleProximal);
  const rightHandLength = distance(boneWorldPositions.rightHand, boneWorldPositions.rightMiddleProximal);
  const [leftHand, leftHandSource] = measuredOrFallback(
    leftHandLength === null ? null : leftHandLength * 1.15,
    FALLBACK_METRICS.leftHand,
    METRIC_RANGES.leftHand
  );
  const [rightHand, rightHandSource] = measuredOrFallback(
    rightHandLength === null ? null : rightHandLength * 1.15,
    FALLBACK_METRICS.rightHand,
    METRIC_RANGES.rightHand
  );
  const measuredHandCount = Number(leftHandSource === "measured") + Number(rightHandSource === "measured");
  const hand = measuredHandCount === 0
    ? FALLBACK_METRICS.hand
    : (leftHandSource === "measured" ? leftHand : 0) / measuredHandCount
      + (rightHandSource === "measured" ? rightHand : 0) / measuredHandCount;

  const shoulderDistance = distance(boneWorldPositions.leftShoulder, boneWorldPositions.rightShoulder);
  const [shoulder, shoulderSource] = measuredOrFallback(
    shoulderDistance,
    FALLBACK_METRICS.shoulder,
    METRIC_RANGES.shoulder
  );
  const hipDistance = distance(boneWorldPositions.leftUpperLeg, boneWorldPositions.rightUpperLeg);
  const [hip, hipSource] = measuredOrFallback(hipDistance, FALLBACK_METRICS.hip, METRIC_RANGES.hip);

  const feet = [boneWorldPositions.leftFoot, boneWorldPositions.rightFoot].filter((item): item is Vec3 => Boolean(item));
  const headPosition = boneWorldPositions.head;
  let heightMeasured: number | null = null;
  let heightSource: PropMetricSource = "fallback";
  if (headPosition && feet.length > 0) {
    heightMeasured = headPosition[1] + head * 0.5 - Math.min(...feet.map((foot) => foot[1]));
    heightSource = "measured";
  } else if (headPosition && boneWorldPositions.hips) {
    heightMeasured = Math.abs(headPosition[1] - boneWorldPositions.hips[1]) * 2.65;
    heightSource = "derived";
  }
  const avatarHeight = sanitizedMetric(heightMeasured, FALLBACK_METRICS.avatarHeight, METRIC_RANGES.avatarHeight);

  // VRM humanoid에는 눈 간격 표준 본이 없으므로 실측된 머리 치수에서 안정적으로 추정한다.
  const eyeDistance = sanitizedMetric(head * 0.355, FALLBACK_METRICS.eyeDistance, METRIC_RANGES.eyeDistance);
  const eyeSource: PropMetricSource = headSource === "fallback" ? "fallback" : "derived";
  const handSockets: Record<PropHandBone, VrmPropHandSocket> = {
    leftHand: measureHandSocket("left", boneNodes, boneWorldPositions),
    rightHand: measureHandSocket("right", boneNodes, boneWorldPositions),
  };
  const faceSocket = measureFaceSocket(boneNodes, boneWorldPositions, head);

  return sanitizeVrmPropRigMetrics({
    avatarHeight,
    hand,
    leftHand,
    rightHand,
    head,
    eyeDistance,
    shoulder,
    hip,
    handSockets,
    faceSocket,
    boneWorldPositions,
    sources: {
      avatarHeight: heightMeasured === null ? "fallback" : heightSource,
      hand: measuredHandCount > 0 ? "measured" : "fallback",
      head: headSource,
      eyeDistance: eyeSource,
      shoulder: shoulderSource,
      hip: hipSource,
    },
  });
}

function fitMetric(metrics: VrmPropRigMetrics, reference: PropFitReference, bone: PropAttachBone): number {
  if (reference === "hand") {
    if (bone === "leftHand") return metrics.leftHand;
    if (bone === "rightHand") return metrics.rightHand;
    return metrics.hand;
  }
  if (reference === "none") return 1;
  return metrics[reference];
}

export type PropFitStatusKind = "manual" | "exact" | "adjusted" | "clamped" | "fallback";

export interface PropFitStatus {
  kind: PropFitStatusKind;
  label: string;
  reference: PropFitReference;
  measured: number;
  designReference: number;
  requestedScale: number;
  fitScale: number;
  wasClamped: boolean;
  usedFallback: boolean;
}

function safeFitProfile(profile: PropFitProfile): PropFitProfile {
  const designReference = clamp(finite(profile.designReference) ?? 1, 1e-4, 10);
  const minScale = clamp(finite(profile.minScale) ?? 1, PROP_RIG_FIT_MIN, PROP_RIG_FIT_MAX);
  const maxScale = clamp(finite(profile.maxScale) ?? 1, minScale, PROP_RIG_FIT_MAX);
  return { ...profile, designReference, minScale, maxScale };
}

/** UI 배지와 renderer가 동일한 자동 맞춤 판단을 공유한다. */
export function getPropFitStatus(
  def: PropDef,
  instance: PropInstance,
  metrics: VrmPropRigMetrics
): PropFitStatus {
  const profile = safeFitProfile(def.fit);
  const autoScale = instance.rig?.autoScale ?? false;
  const reference = profile.reference;
  const measured = fitMetric(metrics, reference, instance.bone);
  if (!autoScale || reference === "none") {
    return {
      kind: "manual",
      label: "수동 크기",
      reference,
      measured,
      designReference: profile.designReference,
      requestedScale: 1,
      fitScale: 1,
      wasClamped: false,
      usedFallback: false,
    };
  }

  const requestedScale = measured / profile.designReference;
  const fitScale = clamp(requestedScale, profile.minScale, profile.maxScale);
  const wasClamped = Math.abs(requestedScale - fitScale) > 1e-6;
  const source = reference === "hand"
    ? metrics.sources.hand
    : metrics.sources[reference as Exclude<PropFitReference, "none">];
  const usedFallback = source === "fallback";
  const exact = Math.abs(fitScale - 1) <= 0.025;
  const kind: PropFitStatusKind = wasClamped ? "clamped" : usedFallback ? "fallback" : exact ? "exact" : "adjusted";
  const label = kind === "clamped"
    ? "맞춤 한계 적용"
    : kind === "fallback"
      ? "표준 체형 기준"
      : kind === "exact"
        ? "원본 크기 적합"
        : "체형 자동 맞춤";
  return {
    kind,
    label,
    reference,
    measured,
    designReference: profile.designReference,
    requestedScale,
    fitScale,
    wasClamped,
    usedFallback,
  };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mirrorPosition(value: Vec3): Vec3 {
  return [-value[0], value[1], value[2]];
}

/** YZ 평면 반사에서 XYZ Euler 회전을 같은 시각 방향으로 옮긴다. */
function mirrorEulerDeg(value: Vec3): Vec3 {
  return [value[0], -value[1], -value[2]];
}

function handSide(bone: PropAttachBone): PropHandBone | null {
  return bone === "leftHand" || bone === "rightHand" ? bone : null;
}

function safeDirection(value: Vec3, fallback: THREE.Vector3): THREE.Vector3 {
  const vector = new THREE.Vector3(value[0], value[1], value[2]);
  return vector.lengthSq() > 1e-8 && [vector.x, vector.y, vector.z].every(Number.isFinite)
    ? vector.normalize()
    : fallback.clone();
}

function anchorBasisQuaternion(anchor: PropAnchorDef): THREE.Quaternion {
  const forward = safeDirection(anchor.forward, new THREE.Vector3(0, 0, 1));
  let up = safeDirection(anchor.up, new THREE.Vector3(0, 1, 0));
  up = up.addScaledVector(forward, -up.dot(forward));
  if (up.lengthSq() < 1e-8) {
    up = Math.abs(forward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    up.addScaledVector(forward, -up.dot(forward));
  }
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const correctedUp = new THREE.Vector3().crossVectors(forward, right).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, correctedUp, forward);
  return new THREE.Quaternion().setFromRotationMatrix(basis).normalize();
}

function primaryAnchor(def: PropDef, instance: PropInstance): PropAnchorDef {
  const requested = instance.rig?.anchorId
    ? def.anchors.find((anchor) => anchor.id === instance.rig?.anchorId && anchor.role !== "secondary")
    : undefined;
  return requested
    ?? def.anchors.find((anchor) => anchor.role === "primary" || anchor.role === "surface")
    ?? def.anchors[0];
}

export interface ResolvedPropAttachment {
  bone: PropAttachBone;
  anchorId: string;
  anchor: PropAnchorDef;
  /** 본/소켓 로컬 공간에서 anchor가 도달해야 하는 최종 접촉점. */
  socketPosition: Vec3;
  socketRotationQuaternion: Quat4;
  socketRotationDeg: Vec3;
  socketSource: PropMetricSource;
  /** anchor.position * scale을 단순 반전한, 회전 전 geometry 원점 보정값. */
  anchorInverseLocal: Vec3;
  /** anchorInverseLocal을 최종 회전한 뒤의 실제 wrapper 위치 보정값. */
  visualOffset: Vec3;
  /** geometry wrapper에 바로 적용할 본 로컬 transform. */
  position: Vec3;
  rotationDeg: Vec3;
  scale: number;
  fit: PropFitStatus;
  mirrored: boolean;
  /** false면 rig 없는 V1 인스턴스를 그대로 통과시킨 결과다. */
  usesSmartRig: boolean;
}

/**
 * geometry 원점이 아닌 의미적 anchor를 소켓 원점에 정확히 맞추는 wrapper transform을 만든다.
 * invariant: position + rotate(anchor.position * scale) === socketPosition.
 */
export function resolvePropAttachment(
  def: PropDef,
  instance: PropInstance,
  rawMetrics: VrmPropRigMetrics
): ResolvedPropAttachment {
  const metrics = sanitizeVrmPropRigMetrics(rawMetrics);
  const anchor = primaryAnchor(def, instance);
  const rig = instance.rig;

  // V1 문서는 top-level transform이 이미 geometry 원점 기준으로 저작되어 있다.
  // anchor를 소급 적용하면 기존 컷이 이동하므로 스마트 리그는 rig가 명시된 V2에만 적용한다.
  if (!rig) {
    const fit = getPropFitStatus(def, instance, metrics);
    return {
      bone: instance.bone,
      anchorId: anchor.id,
      anchor,
      socketPosition: instance.position,
      socketRotationQuaternion: [0, 0, 0, 1],
      socketRotationDeg: [0, 0, 0],
      socketSource: "fallback",
      anchorInverseLocal: [0, 0, 0],
      visualOffset: [0, 0, 0],
      position: instance.position,
      rotationDeg: instance.rotationDeg,
      scale: instance.scale,
      fit,
      mirrored: false,
      usesSmartRig: false,
    };
  }

  const deltaPosition = rig.deltaPosition;
  const deltaRotation = rig.deltaRotationDeg;
  const deltaScale = clamp(finite(rig.deltaScale) ?? 1, PROP_RIG_FIT_MIN, PROP_RIG_FIT_MAX);
  const sourceHand = handSide(def.defaultBone);
  const targetHand = handSide(instance.bone);
  const mirrored = sourceHand !== null && targetHand !== null && sourceHand !== targetHand;

  // rig가 존재하면 top-level V1 transform은 절대 base로 재사용하지 않는다.
  // 손 → 실측 palm socket, 머리 착용(선글라스 등) → face socket, 그 외 → 카탈로그 기본점.
  const handSocket = targetHand ? metrics.handSockets[targetHand] : null;
  const faceWear =
    !handSocket
    && (instance.bone === "head" || instance.bone === "neck")
    && (def.category === "head" || def.fit.reference === "eyeDistance" || def.fit.reference === "head");
  const faceSocket = faceWear ? metrics.faceSocket : null;
  const activeSocket = handSocket ?? faceSocket;
  const socketBasis = activeSocket
    ? new THREE.Quaternion(...activeSocket.rotationQuaternion).normalize()
    : new THREE.Quaternion();
  let adjustedDeltaPosition: Vec3 = [...deltaPosition];
  let userRotationDeg = addVec3(def.smartRotationDeg ?? def.defaultRotationDeg, deltaRotation);
  if (mirrored) {
    adjustedDeltaPosition = mirrorPosition(adjustedDeltaPosition);
    userRotationDeg = mirrorEulerDeg(userRotationDeg);
  }
  const socketPosition = addVec3(activeSocket?.position ?? def.defaultPosition, adjustedDeltaPosition);

  const fit = getPropFitStatus(def, instance, metrics);
  const baseScale = clamp(finite(def.defaultScale) ?? 1, PROP_RIG_FIT_MIN, PROP_RIG_FIT_MAX);
  const scale = clamp(baseScale * fit.fitScale * deltaScale, PROP_RIG_FIT_MIN, PROP_RIG_FIT_MAX);

  const userRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(userRotationDeg[0]),
    THREE.MathUtils.degToRad(userRotationDeg[1]),
    THREE.MathUtils.degToRad(userRotationDeg[2]),
    "XYZ"
  ));
  const anchorInverseRotation = anchorBasisQuaternion(anchor).invert();
  const wrapperRotation = socketBasis.clone().multiply(userRotation).multiply(anchorInverseRotation).normalize();
  const euler = new THREE.Euler().setFromQuaternion(wrapperRotation, "XYZ");
  const rotationDeg: Vec3 = [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ];

  const anchorInverseLocal: Vec3 = [
    -anchor.position[0] * scale,
    -anchor.position[1] * scale,
    -anchor.position[2] * scale,
  ];
  const rotatedOffset = new THREE.Vector3(...anchorInverseLocal).applyQuaternion(wrapperRotation);
  const visualOffset: Vec3 = [rotatedOffset.x, rotatedOffset.y, rotatedOffset.z];
  const position = addVec3(socketPosition, visualOffset);

  return {
    bone: instance.bone,
    anchorId: anchor.id,
    anchor,
    socketPosition,
    socketRotationQuaternion: quaternionToTuple(socketBasis),
    socketRotationDeg: quaternionDegrees(quaternionToTuple(socketBasis)),
    socketSource: activeSocket?.source ?? "fallback",
    anchorInverseLocal,
    visualOffset,
    position,
    rotationDeg,
    scale,
    fit,
    mirrored,
    usesSmartRig: true,
  };
}

export interface ResolvedSecondaryPropTarget {
  enabled: boolean;
  bone: PropHandBone;
  anchor: PropAnchorDef;
  anchorId: string;
  influence: number;
  elbowHint?: Vec3;
}

export interface ResolvedSecondaryHandConstraint {
  /** 소품의 secondary anchor가 놓인 정확한 world-space 접촉점. */
  anchorWorldPosition: Vec3;
  /** IK가 맞춰야 하는 hand bone(손목) world-space 위치. */
  wristWorldPosition: Vec3;
  /** 손바닥 소켓 basis가 소품 anchor basis와 일치하도록 하는 hand bone world 회전. */
  targetHandWorldQuaternion: Quat4;
}

/** 양손 IK renderer가 소비할 보조 anchor/손 정보만 계산한다. 팔 IK 자체는 호출자가 담당한다. */
export function resolveSecondaryPropTarget(
  def: PropDef,
  instance: PropInstance
): ResolvedSecondaryPropTarget | null {
  const secondary = instance.rig?.secondary;
  if (!secondary?.enabled) return null;
  const anchor = def.anchors.find((candidate) => candidate.id === secondary.anchorId && candidate.role === "secondary")
    ?? def.anchors.find((candidate) => candidate.role === "secondary");
  if (!anchor || secondary.bone === instance.bone) return null;
  return {
    enabled: true,
    bone: secondary.bone,
    anchor,
    anchorId: anchor.id,
    influence: clamp(finite(secondary.influence) ?? 1, 0, 1),
    ...(secondary.elbowHint ? { elbowHint: secondary.elbowHint } : {}),
  };
}

/**
 * 보조 손의 손목 목표를 계산한다.
 *
 * 팔 IK의 endpoint는 hand bone 원점(손목)이지만 창작자가 기대하는 접촉점은 실측된 손바닥
 * 소켓이다. 따라서 소품 anchor의 world transform에서 손바닥의 회전·스케일된 로컬 오프셋을
 * 빼야 손목을 소품 안에 파묻지 않고 정확한 접촉점을 만들 수 있다.
 */
export function resolveSecondaryHandConstraint(
  anchor: PropAnchorDef,
  groupWorldPositionRaw: Vec3,
  groupWorldQuaternionRaw: Quat4,
  propScaleRaw: number,
  handSocket: VrmPropHandSocket,
  handWorldScaleRaw: Vec3 = [1, 1, 1]
): ResolvedSecondaryHandConstraint | null {
  const groupWorldPosition = vec3(groupWorldPositionRaw);
  const groupWorldQuaternionTuple = quaternionTuple(groupWorldQuaternionRaw);
  const anchorPosition = vec3(anchor.position);
  const socketPosition = vec3(handSocket.position);
  const socketQuaternionTuple = quaternionTuple(handSocket.rotationQuaternion);
  const handWorldScale = vec3(handWorldScaleRaw);
  const propScale = finite(propScaleRaw);
  if (
    !groupWorldPosition
    || !groupWorldQuaternionTuple
    || !anchorPosition
    || !socketPosition
    || !socketQuaternionTuple
    || !handWorldScale
    || propScale === null
    || propScale <= 0
  ) {
    return null;
  }

  const groupWorldQuaternion = new THREE.Quaternion(...groupWorldQuaternionTuple).normalize();
  const anchorWorldQuaternion = groupWorldQuaternion.clone()
    .multiply(anchorBasisQuaternion(anchor))
    .normalize();
  const socketLocalQuaternion = new THREE.Quaternion(...socketQuaternionTuple).normalize();
  const targetHandWorldQuaternion = anchorWorldQuaternion.clone()
    .multiply(socketLocalQuaternion.invert())
    .normalize();

  const anchorWorldPosition = new THREE.Vector3(...anchorPosition)
    .multiplyScalar(propScale)
    .applyQuaternion(groupWorldQuaternion)
    .add(new THREE.Vector3(...groupWorldPosition));
  const palmWorldOffset = new THREE.Vector3(...socketPosition)
    .multiply(new THREE.Vector3(...handWorldScale))
    .applyQuaternion(targetHandWorldQuaternion);
  const wristWorldPosition = anchorWorldPosition.clone().sub(palmWorldOffset);

  if (
    ![anchorWorldPosition.x, anchorWorldPosition.y, anchorWorldPosition.z].every(Number.isFinite)
    || ![wristWorldPosition.x, wristWorldPosition.y, wristWorldPosition.z].every(Number.isFinite)
  ) {
    return null;
  }

  return {
    anchorWorldPosition: [anchorWorldPosition.x, anchorWorldPosition.y, anchorWorldPosition.z],
    wristWorldPosition: [wristWorldPosition.x, wristWorldPosition.y, wristWorldPosition.z],
    targetHandWorldQuaternion: quaternionToTuple(targetHandWorldQuaternion),
  };
}

export type AutoGripFingerOverrides = Record<string, Vec3>;

const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
const FINGER_SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;

function gripWeight(kind: PropGripKind, finger: (typeof FINGERS)[number]): number {
  if (kind === "flat") return finger === "Index" || finger === "Middle" ? 0.55 : 0.75;
  if (kind === "pinch") return finger === "Index" ? 0.42 : finger === "Middle" ? 0.7 : 1;
  if (kind === "support") return finger === "Index" || finger === "Middle" ? 0.35 : 0.55;
  if (kind === "wear") return 0;
  return 1;
}

function fingerPoseForGrip(
  side: PropHandBone,
  grip: PropGripProfile,
  strength = 1
): AutoGripFingerOverrides {
  if (grip.kind === "wear") return {};
  const prefix = side === "leftHand" ? "left" : "right";
  const sign = side === "leftHand" ? -1 : 1;
  const poseStrength = clamp(finite(strength) ?? 1, 0, 1.25);
  const result: AutoGripFingerOverrides = {};
  for (const finger of FINGERS) {
    const curl = THREE.MathUtils.degToRad(
      grip.fingerCurlDeg * gripWeight(grip.kind, finger) * poseStrength
    );
    for (let index = 0; index < FINGER_SEGMENTS.length; index += 1) {
      const segment = FINGER_SEGMENTS[index];
      const segmentWeight = index === 0 ? 0.82 : index === 1 ? 1 : 0.88;
      result[`${prefix}${finger}${segment}`] = [0, 0, sign * curl * segmentWeight];
    }
  }

  const thumb = THREE.MathUtils.degToRad(grip.thumbOppositionDeg * poseStrength);
  result[`${prefix}ThumbMetacarpal`] = [0, sign * thumb * 0.35, sign * thumb * 0.2];
  result[`${prefix}ThumbProximal`] = [0, sign * thumb, sign * thumb * 0.7];
  result[`${prefix}ThumbDistal`] = [0, 0, sign * thumb * 0.55];
  return result;
}

export type PropDefinitionResolver = (propId: string) => PropDef | undefined;

function gripStrengthForHand(
  definition: PropDef,
  item: PropInstance,
  hand: PropHandBone,
  metrics: VrmPropRigMetrics
): number {
  if (!definition.grip) return 1;
  const resolved = resolvePropAttachment(definition, item, metrics);
  const handSize = hand === "leftHand" ? metrics.leftHand : metrics.rightHand;
  if (!(handSize > 1e-6)) return 1;
  const normalizedRadius = definition.grip.radius * resolved.scale / handSize;
  // 손 길이의 약 16% 반경을 카탈로그 중립값으로 삼는다. 굵은 손잡이는 덜 감고,
  // 가는 손잡이는 더 감되 과도한 관절 접힘은 안전 범위로 제한한다.
  return clamp(1 + (0.16 - normalizedRadius) * 1.4, 0.72, 1.18);
}

/**
 * 자동 그립이 켜진 손 소품을 FingerRotationMap 호환 레코드로 변환한다.
 * 사용자 수동 손가락 편집은 호출자가 이 결과 뒤에 merge해 우선권을 주어야 한다.
 */
export function createAutoGripFingerOverrides(
  items: readonly PropInstance[],
  resolveDefinition: PropDefinitionResolver = propDefById,
  rawMetrics: VrmPropRigMetrics = DEFAULT_VRM_PROP_RIG_METRICS
): AutoGripFingerOverrides {
  const metrics = sanitizeVrmPropRigMetrics(rawMetrics);
  const result: AutoGripFingerOverrides = {};
  for (const item of items) {
    if ((item.rig?.autoFingerPose ?? false) !== true) continue;
    const side = handSide(item.bone);
    if (!side) continue;
    const definition = resolveDefinition(item.propId);
    if (!definition?.grip) continue;
    const primaryStrength = gripStrengthForHand(definition, item, side, metrics);
    Object.assign(result, fingerPoseForGrip(side, definition.grip, primaryStrength));
    const secondary = item.rig?.secondary;
    if (secondary?.enabled && secondary.bone !== item.bone && secondary.influence > 0) {
      const secondaryStrength = gripStrengthForHand(definition, item, secondary.bone, metrics)
        * clamp(secondary.influence, 0, 1);
      Object.assign(result, fingerPoseForGrip(secondary.bone, definition.grip, secondaryStrength));
    }
  }
  return result;
}

/** V2 secondary를 UI에서 켤 때 사용할 안전한 기본값. */
export function createDefaultSecondaryRig(def: PropDef, primaryBone: PropAttachBone): PropRigSecondary | null {
  const secondaryAnchor = def.anchors.find((candidate) => candidate.role === "secondary");
  const hand = handSide(primaryBone);
  if (!secondaryAnchor || !hand) return null;
  return {
    enabled: true,
    anchorId: secondaryAnchor.id,
    bone: hand === "leftHand" ? "rightHand" : "leftHand",
    influence: clamp(finite(def.secondaryGripInfluence) ?? 0.75, 0, 1),
  };
}
