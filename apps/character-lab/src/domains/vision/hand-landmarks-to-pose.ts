/**
 * MediaPipe Hand Landmarker 21점 → 손가락 본 15개(한쪽) 굴곡 회전(순수, 베타).
 *
 * 검지~소지: 각 마디의 굴곡각 = 이전 세그먼트와 다음 세그먼트 사이 각(0..180°). 벌림(spread)이 섞이지 않도록 두 세그먼트를
 * 손바닥 측면 축(검지 MCP→소지 MCP)에 수직인 평면(손가락 시상면)으로 투영한 뒤 각을 잰다. 근위 마디의 기준은 손바닥 축(손목→중지 MCP).
 * 엄지: 손목→CMC를 기준으로 연속 세그먼트의 원시 각(투영 없음, 근사).
 * 회전축은 animation/presets/rotation-dsl.ts의 손가락 규약과 같다(검지~소지: rotZ(-sign·deg), 엄지: [√½, 0, -sign·√½] 축).
 * 벌림(spread)·엄지 대립은 2D 사진에서 신뢰하기 어려워 적용하지 않는다(사유를 결과에 적는다).
 * Hand Landmarker는 visibility를 보고하지 않는 경우가 많아 가시성 게이트 대신 좌표 유한성·세그먼트 길이로 판정한다.
 */
import { HAND_LANDMARK_COUNT, HAND_LANDMARK_NAMES, JOINT_LIMITS_DEG } from "../../contracts";
import { degToRad, qFromAxisAngle, v3Normalize } from "../../shared/math";

import { angleBetweenDeg, toModelSpace } from "./landmark-space";

import type { LandmarkSpaceOptions } from "./landmark-space";
import type { HandLandmarkName, HumanoidBoneName, Pose, PoseLandmark } from "../../contracts";
import type { Quat, Vec3 } from "../../shared/math";

export type HandSide = "left" | "right";

export interface HandLandmarksToPoseOptions extends LandmarkSpaceOptions {
  readonly side: HandSide;
  /** 기본 true: JOINT_LIMITS_DEG(손가락 swing 95°)로 클램프 */
  readonly clampToJointLimits?: boolean;
}

export interface HandSkippedBone {
  readonly bone: HumanoidBoneName;
  readonly reasonKo: string;
}

export interface HandLandmarksToPoseResult {
  /** 거울 모드가 반영된 실제 적용 측 */
  readonly side: HandSide;
  readonly pose: Pose;
  /** 본별 굴곡각(도) */
  readonly curlDeg: Readonly<Partial<Record<HumanoidBoneName, number>>>;
  readonly appliedBones: readonly HumanoidBoneName[];
  readonly skippedBones: readonly HandSkippedBone[];
  readonly clampedBones: readonly HumanoidBoneName[];
  readonly notesKo: readonly string[];
}

type FingerKey = "Index" | "Middle" | "Ring" | "Little";
type Joint = "Proximal" | "Intermediate" | "Distal";

interface FingerChain {
  readonly finger: FingerKey;
  readonly landmarks: readonly [HandLandmarkName, HandLandmarkName, HandLandmarkName, HandLandmarkName];
}

const FINGER_CHAINS: readonly FingerChain[] = [
  { finger: "Index", landmarks: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"] },
  { finger: "Middle", landmarks: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"] },
  { finger: "Ring", landmarks: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"] },
  { finger: "Little", landmarks: ["pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip"] },
];

const THUMB_CHAIN: readonly [HandLandmarkName, HandLandmarkName, HandLandmarkName, HandLandmarkName] = ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"];
const JOINTS: readonly Joint[] = ["Proximal", "Intermediate", "Distal"];
const THUMB_JOINTS: readonly ("ThumbMetacarpal" | "ThumbProximal" | "ThumbDistal")[] = ["ThumbMetacarpal", "ThumbProximal", "ThumbDistal"];

function sideSign(side: HandSide): 1 | -1 {
  return side === "left" ? 1 : -1;
}

/** 검지~소지 굴곡(rotation-dsl.fingerCurl과 동일) */
export function fingerCurlQuat(side: HandSide, deg: number): Quat {
  return qFromAxisAngle([0, 0, 1], degToRad(-sideSign(side) * deg));
}

/** 엄지 굴곡(rotation-dsl.thumbCurl과 동일) */
export function thumbCurlQuat(side: HandSide, deg: number): Quat {
  return qFromAxisAngle([Math.SQRT1_2, 0, -sideSign(side) * Math.SQRT1_2], degToRad(deg));
}

function handIndex(name: HandLandmarkName): number {
  return HAND_LANDMARK_NAMES.indexOf(name);
}

function boneName(side: HandSide, finger: FingerKey | "Thumb", joint: string): HumanoidBoneName {
  return `${side}${finger}${joint}` as HumanoidBoneName;
}

/** 21점 손 랜드마크 → 손가락 본 포즈 */
export function handLandmarksToPose(landmarks: readonly PoseLandmark[], options: HandLandmarksToPoseOptions): HandLandmarksToPoseResult {
  if (landmarks.length !== HAND_LANDMARK_COUNT) {
    throw new Error(`손 랜드마크는 ${HAND_LANDMARK_COUNT}개여야 합니다(받음 ${landmarks.length}).`);
  }
  const side: HandSide = options.mirror ? (options.side === "left" ? "right" : "left") : options.side;
  const clamp = options.clampToJointLimits ?? true;
  const points: Vec3[] = landmarks.map((landmark) => toModelSpace(landmark, { ...options, mirror: false }));
  const finite = points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]));
  const pose: Partial<Record<HumanoidBoneName, Quat>> = {};
  const curlDeg: Partial<Record<HumanoidBoneName, number>> = {};
  const applied: HumanoidBoneName[] = [];
  const skipped: HandSkippedBone[] = [];
  const clampedBones: HumanoidBoneName[] = [];
  const notesKo: string[] = ["벌림(spread)·엄지 대립은 2D 사진에서 신뢰할 수 없어 적용하지 않습니다(굴곡만 반영, 베타)."];

  if (!finite) {
    const all: HumanoidBoneName[] = [...THUMB_JOINTS.map((joint) => boneName(side, "Thumb", joint.replace("Thumb", ""))), ...FINGER_CHAINS.flatMap((chain) => JOINTS.map((joint) => boneName(side, chain.finger, joint)))];
    return { side, pose, curlDeg, appliedBones: [], skippedBones: all.map((bone) => ({ bone, reasonKo: "손 랜드마크 좌표에 NaN·무한대가 있습니다." })), clampedBones: [], notesKo };
  }

  const segment = (a: HandLandmarkName, b: HandLandmarkName): Vec3 | null => {
    const pa = points[handIndex(a)];
    const pb = points[handIndex(b)];
    if (!pa || !pb) return null;
    const d: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const length = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    return length < 1e-6 ? null : d;
  };

  // 손바닥 측면 축(검지 MCP→소지 MCP): 검지~소지 굴곡을 잴 때 이 축 성분을 제거해 벌림을 분리한다.
  const lateralRaw = segment("index_finger_mcp", "pinky_mcp");
  const lateral: Vec3 | null = lateralRaw ? v3Normalize(lateralRaw) : null;
  const projectOffLateral = (v: Vec3): Vec3 | null => {
    if (!lateral) return v;
    const dotValue = v[0] * lateral[0] + v[1] * lateral[1] + v[2] * lateral[2];
    const projected: Vec3 = [v[0] - lateral[0] * dotValue, v[1] - lateral[1] * dotValue, v[2] - lateral[2] * dotValue];
    const length = Math.sqrt(projected[0] * projected[0] + projected[1] * projected[1] + projected[2] * projected[2]);
    return length < 1e-6 ? null : projected;
  };

  const applyJoint = (bone: HumanoidBoneName, previous: Vec3 | null, next: Vec3 | null, quatOf: (deg: number) => Quat, labelKo: string, project: boolean): void => {
    if (!previous || !next) {
      skipped.push({ bone, reasonKo: `${labelKo} 랜드마크가 겹쳐 굴곡각을 정할 수 없습니다.` });
      return;
    }
    const a = project ? projectOffLateral(previous) : previous;
    const b = project ? projectOffLateral(next) : next;
    if (!a || !b) {
      skipped.push({ bone, reasonKo: `${labelKo} 세그먼트가 손바닥 측면 축과 평행해 굴곡각을 정할 수 없습니다.` });
      return;
    }
    const raw = angleBetweenDeg(a, b);
    const limit = JOINT_LIMITS_DEG[bone].swing;
    let deg = raw;
    if (clamp && raw > limit) {
      deg = limit;
      clampedBones.push(bone);
    }
    curlDeg[bone] = deg;
    pose[bone] = quatOf(deg);
    applied.push(bone);
  };

  // 엄지: 손목→CMC를 기준으로 중수·근위·원위 굴곡
  const thumbSegments = [segment("wrist", THUMB_CHAIN[0]), segment(THUMB_CHAIN[0], THUMB_CHAIN[1]), segment(THUMB_CHAIN[1], THUMB_CHAIN[2]), segment(THUMB_CHAIN[2], THUMB_CHAIN[3])];
  THUMB_JOINTS.forEach((joint, index) => {
    applyJoint(boneName(side, "Thumb", joint.replace("Thumb", "")), thumbSegments[index] ?? null, thumbSegments[index + 1] ?? null, (deg) => thumbCurlQuat(side, deg), `엄지 ${joint}`, false);
  });

  // 검지~소지: 손바닥 축(손목→중지 MCP)을 기준으로 근위·중위·원위 굴곡(측면 축 성분 제거)
  const palmAxis = segment("wrist", "middle_finger_mcp");
  for (const chain of FINGER_CHAINS) {
    const segments = [palmAxis, segment(chain.landmarks[0], chain.landmarks[1]), segment(chain.landmarks[1], chain.landmarks[2]), segment(chain.landmarks[2], chain.landmarks[3])];
    JOINTS.forEach((joint, index) => {
      applyJoint(boneName(side, chain.finger, joint), segments[index] ?? null, segments[index + 1] ?? null, (deg) => fingerCurlQuat(side, deg), `${chain.finger} ${joint}`, true);
    });
  }

  return { side, pose, curlDeg, appliedBones: applied, skippedBones: skipped, clampedBones, notesKo };
}
