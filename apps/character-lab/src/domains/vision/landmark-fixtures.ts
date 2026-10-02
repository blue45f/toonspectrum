/**
 * 결정적 랜드마크 픽스처(테스트·패널 데모용). 모델 공간(미터, 정면 +Z, 왼쪽 +X)에서 사람을 정의하고
 * MediaPipe 월드 좌표(x 유지, y·z 반전) 또는 이미지 정규화 좌표로 내보낸다. 모든 가시성은 1.
 */
import { HAND_LANDMARK_NAMES, POSE_LANDMARK_NAMES } from "../../contracts";

import type { HandLandmarkName, PoseLandmark, PoseLandmarkName } from "../../contracts";

type Vec3 = readonly [number, number, number];

type PoseBody = Readonly<Record<PoseLandmarkName, Vec3>>;

function mirrorX(point: Vec3): Vec3 {
  return [-point[0], point[1], point[2]];
}

/** 왼쪽 반신을 주면 오른쪽을 X 대칭으로 채운다. */
function symmetric(center: Partial<Record<PoseLandmarkName, Vec3>>, left: Partial<Record<PoseLandmarkName, Vec3>>): PoseBody {
  const body: Partial<Record<PoseLandmarkName, Vec3>> = { ...center };
  for (const [name, point] of Object.entries(left) as Array<[PoseLandmarkName, Vec3]>) {
    body[name] = point;
    const right = name.replace("left_", "right_") as PoseLandmarkName;
    body[right] = mirrorX(point);
  }
  for (const name of POSE_LANDMARK_NAMES) {
    if (!body[name]) throw new Error(`픽스처에 ${name}이(가) 없습니다.`);
  }
  return body as PoseBody;
}

/** 코끝은 귀 중점(y 1.63)보다 10 cm 앞·tan(6°)×10 cm ≈ 1.05 cm 아래(HEAD_FORWARD_REST_PITCH_DEG 기준 중립) */
const HEAD_CENTER: Partial<Record<PoseLandmarkName, Vec3>> = { nose: [0, 1.63 - 0.1 * Math.tan((6 * Math.PI) / 180), 0.1] };
const HEAD_LEFT: Partial<Record<PoseLandmarkName, Vec3>> = {
  left_eye_inner: [0.02, 1.65, 0.08],
  left_eye: [0.03, 1.65, 0.08],
  left_eye_outer: [0.045, 1.65, 0.07],
  left_ear: [0.07, 1.63, 0],
  mouth_left: [0.02, 1.58, 0.09],
};
const LOWER_LEFT: Partial<Record<PoseLandmarkName, Vec3>> = {
  left_hip: [0.09, 0.95, 0],
  left_knee: [0.09, 0.53, 0],
  left_ankle: [0.09, 0.13, 0],
  left_heel: [0.09, 0.1, -0.03],
  left_foot_index: [0.09, 0.07, 0.13],
};

/** mouth_right는 mouth_left의 대칭이지만 이름 규칙이 달라 따로 넣는다. */
function withMouthRight(body: Partial<Record<PoseLandmarkName, Vec3>>): Partial<Record<PoseLandmarkName, Vec3>> {
  const left = body.mouth_left;
  return left ? { ...body, mouth_right: mirrorX(left) } : body;
}

/** T-pose: 팔 수평(±X), 다리 수직, 정면. 모든 세그먼트가 rest 방향과 일치한다. */
export function tPoseBody(): PoseBody {
  return symmetric(withMouthRight({ ...HEAD_CENTER, ...HEAD_LEFT }), {
    ...HEAD_LEFT,
    left_shoulder: [0.18, 1.45, 0],
    left_elbow: [0.45, 1.45, 0],
    left_wrist: [0.7, 1.45, 0],
    left_pinky: [0.78, 1.45, -0.02],
    left_index: [0.78, 1.45, 0.02],
    left_thumb: [0.74, 1.45, 0.04],
    ...LOWER_LEFT,
  });
}

/** 팔을 몸통 옆으로 내린 자세(상완 -Y). */
export function armsDownBody(): PoseBody {
  return symmetric(withMouthRight({ ...HEAD_CENTER, ...HEAD_LEFT }), {
    ...HEAD_LEFT,
    left_shoulder: [0.18, 1.45, 0],
    left_elbow: [0.18, 1.18, 0],
    left_wrist: [0.18, 0.93, 0],
    left_pinky: [0.18, 0.85, -0.02],
    left_index: [0.18, 0.85, 0.02],
    left_thumb: [0.2, 0.88, 0.04],
    ...LOWER_LEFT,
  });
}

/** 왼팔만 앞(+Z)으로 뻗은 자세(오른팔은 T). */
export function leftArmForwardBody(): PoseBody {
  const base = tPoseBody();
  return {
    ...base,
    left_elbow: [0.18, 1.45, 0.27],
    left_wrist: [0.18, 1.45, 0.52],
    left_pinky: [0.16, 1.45, 0.6],
    left_index: [0.2, 1.45, 0.6],
    left_thumb: [0.22, 1.47, 0.56],
  };
}

export interface ExportOptions {
  readonly visibility?: number;
  /** 가시성을 덮어쓸 랜드마크 */
  readonly visibilityOverrides?: Partial<Record<PoseLandmarkName, number>>;
}

/** 모델 공간 → MediaPipe 월드 좌표(y·z 반전) */
export function toWorldLandmarks(body: PoseBody, options: ExportOptions = {}): PoseLandmark[] {
  return POSE_LANDMARK_NAMES.map((name) => {
    const point = body[name];
    return { x: point[0], y: -point[1], z: -point[2], visibility: options.visibilityOverrides?.[name] ?? options.visibility ?? 1 };
  });
}

/** 모델 공간 → 이미지 정규화 좌표(가로/세로 비 aspect, 신장 1.8 m를 세로 1로 봄, 중심 (0.5, 0.5)) */
export function toImageLandmarks(body: PoseBody, aspectRatio = 1, options: ExportOptions = {}): PoseLandmark[] {
  const scale = 1 / 1.8;
  return POSE_LANDMARK_NAMES.map((name) => {
    const point = body[name];
    return {
      x: 0.5 + (point[0] * scale) / aspectRatio,
      y: 0.5 - (point[1] - 0.9) * scale,
      z: (-point[2] * scale) / aspectRatio,
      visibility: options.visibilityOverrides?.[name] ?? options.visibility ?? 1,
    };
  });
}

type HandPoints = Readonly<Record<HandLandmarkName, Vec3>>;

/** 손목이 아래, 손가락이 위(-y 이미지 방향)를 향하는 펼친 손(이미지 정규화 좌표, 손가락 세그먼트 모두 일직선). */
export function openHandLandmarks(): PoseLandmark[] {
  const column = (x: number, yStart: number, step: number): [Vec3, Vec3, Vec3, Vec3] => [
    [x, yStart, 0],
    [x, yStart - step, 0],
    [x, yStart - step * 1.7, 0],
    [x, yStart - step * 2.3, 0],
  ];
  const [imcp, ipip, idip, itip] = column(0.45, 0.6, 0.1);
  const [mmcp, mpip, mdip, mtip] = column(0.5, 0.58, 0.11);
  const [rmcp, rpip, rdip, rtip] = column(0.55, 0.6, 0.1);
  const [pmcp, ppip, pdip, ptip] = column(0.6, 0.63, 0.08);
  const points: HandPoints = {
    wrist: [0.5, 0.8, 0],
    // 엄지는 손목→CMC 선 위에 일직선(굴곡 0)
    thumb_cmc: [0.42, 0.74, 0],
    thumb_mcp: [0.356, 0.692, 0],
    thumb_ip: [0.308, 0.656, 0],
    thumb_tip: [0.268, 0.626, 0],
    index_finger_mcp: imcp,
    index_finger_pip: ipip,
    index_finger_dip: idip,
    index_finger_tip: itip,
    middle_finger_mcp: mmcp,
    middle_finger_pip: mpip,
    middle_finger_dip: mdip,
    middle_finger_tip: mtip,
    ring_finger_mcp: rmcp,
    ring_finger_pip: rpip,
    ring_finger_dip: rdip,
    ring_finger_tip: rtip,
    pinky_mcp: pmcp,
    pinky_pip: ppip,
    pinky_dip: pdip,
    pinky_tip: ptip,
  };
  return HAND_LANDMARK_NAMES.map((name) => ({ x: points[name][0], y: points[name][1], z: points[name][2], visibility: 1 }));
}

/** 검지~소지를 90°·90°로 굽힌 주먹(엄지는 펼친 손과 같음). z를 써서 굽힘을 표현한다. */
export function fistHandLandmarks(): PoseLandmark[] {
  const open = openHandLandmarks();
  const curl = (mcpName: HandLandmarkName, pipName: HandLandmarkName, dipName: HandLandmarkName, tipName: HandLandmarkName): void => {
    const mcp = open[HAND_LANDMARK_NAMES.indexOf(mcpName)];
    if (!mcp) return;
    open[HAND_LANDMARK_NAMES.indexOf(pipName)] = { x: mcp.x, y: mcp.y - 0.1, z: 0, visibility: 1 };
    open[HAND_LANDMARK_NAMES.indexOf(dipName)] = { x: mcp.x, y: mcp.y - 0.1, z: 0.1, visibility: 1 };
    open[HAND_LANDMARK_NAMES.indexOf(tipName)] = { x: mcp.x, y: mcp.y, z: 0.1, visibility: 1 };
  };
  curl("index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip");
  curl("middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip");
  curl("ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip");
  curl("pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip");
  return open;
}
