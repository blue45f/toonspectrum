
// MediaPipe HandLandmarker(손 21개 랜드마크) → VRM 손가락 본 회전(Euler) 솔버.
//
// 각 관절의 굽힘(curl) 각도를 인접 분절 사이 각으로 구해, 스튜디오의 기존 손가락 컬 규약과
// 동일하게 [0, 0, sign*각도](Z축 회전, sign=좌-1/우+1)로 매핑한다. 엄지는 Y·Z 복합.
// → 수동 "주먹" 프리셋과 같은 축이라 손가락이 올바른 방향으로 말린다.
//
// 순수 함수라 단위 테스트가 가능하다(MediaPipe 의존 없음).

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export type FingerEulerMap = Record<string, readonly [number, number, number]>;

/** MediaPipe Hand 랜드마크 인덱스. */
export const HAND_LM = {
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleDip: 11,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringDip: 15,
  ringTip: 16,
  littleMcp: 17,
  littlePip: 18,
  littleDip: 19,
  littleTip: 20,
} as const;

const FINGERS = [
  { name: "Index", mcp: 5, pip: 6, dip: 7, tip: 8 },
  { name: "Middle", mcp: 9, pip: 10, dip: 11, tip: 12 },
  { name: "Ring", mcp: 13, pip: 14, dip: 15, tip: 16 },
  { name: "Little", mcp: 17, pip: 18, dip: 19, tip: 20 },
] as const;

const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;

/** 손가락 최대 컬(rad). 약 110°. */
const MAX_CURL = 1.95;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Vec3 = readonly [number, number, number];

function between(a: HandLandmark, b: HandLandmark): Vec3 {
  return [b.x - a.x, b.y - a.y, b.z - a.z];
}

function normalize(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(length) || length < 1e-8) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function projectedOnPlane(v: Vec3, normal: Vec3): Vec3 | null {
  const alongNormal = dot(v, normal);
  return normalize([
    v[0] - normal[0] * alongNormal,
    v[1] - normal[1] * alongNormal,
    v[2] - normal[2] * alongNormal,
  ]);
}

function angleBetween(a: Vec3, b: Vec3): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  return Math.acos(clamp(dot(na, nb), -1, 1));
}

type PalmFrame = Readonly<{ forward: Vec3; across: Vec3; normal: Vec3 }>;

/** Stable palm plane. It lets MCP flexion/spread be separated instead of treating both as curl. */
function buildPalmFrame(lm: readonly HandLandmark[]): PalmFrame | null {
  const forward = normalize(between(lm[HAND_LM.wrist], lm[HAND_LM.middleMcp]));
  const across = normalize(between(lm[HAND_LM.littleMcp], lm[HAND_LM.indexMcp]));
  if (!forward || !across) return null;
  const normal = normalize(cross(across, forward));
  if (!normal) return null;
  const orthogonalAcross = normalize(cross(forward, normal));
  if (!orthogonalAcross) return null;
  return { forward, across: orthogonalAcross, normal };
}

/** 관절 p1 에서 분절 (p0→p1)과 (p1→p2) 사이 각(rad). 곧게 펴면 0. */
function jointAngle(lm: readonly HandLandmark[], i0: number, i1: number, i2: number): number {
  return angleBetween(between(lm[i0], lm[i1]), between(lm[i1], lm[i2]));
}

function mcpFlexion(lm: readonly HandLandmark[], mcp: number, pip: number, palm: PalmFrame | null): number {
  if (!palm) return jointAngle(lm, HAND_LM.wrist, mcp, pip);
  const direction = normalize(between(lm[mcp], lm[pip]));
  if (!direction) return 0;
  // Flexion is the component leaving the palm plane. This avoids interpreting natural finger
  // fan/spread as a bent knuckle.
  return Math.asin(clamp(Math.abs(dot(direction, palm.normal)), 0, 1));
}

const MAX_SPREAD = 25 * Math.PI / 180;

function fingerSpread(
  lm: readonly HandLandmark[],
  fingerIndex: number,
  mcp: number,
  pip: number,
  palm: PalmFrame | null,
): number {
  if (!palm || fingerIndex === 1) return 0;
  const direction = projectedOnPlane(between(lm[mcp], lm[pip]), palm.normal);
  const middle = projectedOnPlane(
    between(lm[HAND_LM.middleMcp], lm[HAND_LM.middlePip]),
    palm.normal,
  );
  if (!direction || !middle) return 0;
  const magnitude = clamp(angleBetween(middle, direction), 0, MAX_SPREAD);
  // VRM hand-pose convention: index fans positive, ring/little negative. Geometry decides how
  // much; anatomy decides the sign so noisy landmark depth cannot flip a finger across its neighbour.
  return magnitude * (fingerIndex === 0 ? 1 : -1);
}

/**
 * 한 손의 21개 랜드마크 → 지정한 아바타 측(left/right)의 VRM 손가락 본 Euler 맵.
 * sign 은 아바타 측에서 결정되므로, 미러는 호출부가 avatarSide 를 스왑하는 것으로 처리된다.
 */
export function solveHandToFingerBones(
  landmarks: readonly HandLandmark[] | undefined,
  avatarSide: "left" | "right"
): FingerEulerMap {
  const out: Record<string, readonly [number, number, number]> = {};
  if (!landmarks || landmarks.length < 21) return out;
  const sign = avatarSide === "left" ? -1 : 1;
  const palm = buildPalmFrame(landmarks);

  FINGERS.forEach((f, fingerIndex) => {
    const curls = [
      mcpFlexion(landmarks, f.mcp, f.pip, palm),
      jointAngle(landmarks, f.mcp, f.pip, f.dip),
      jointAngle(landmarks, f.pip, f.dip, f.tip),
    ];
    const spread = fingerSpread(landmarks, fingerIndex, f.mcp, f.pip, palm);
    SEGMENTS.forEach((seg, i) => {
      const c = clamp(curls[i], 0, MAX_CURL);
      out[`${avatarSide}${f.name}${seg}`] = [0, i === 0 ? sign * spread : 0, sign * c];
    });
  });

  // 엄지는 CMC(opposition)를 반드시 출력한다. 이전 솔버는 metacarpal을 건드리지 않아 사진의
  // 엄지가 손바닥 옆에 납작하게 붙은 채 MCP/IP만 꺾이는 "집게발" 형태가 됐다.
  const thumbProx = clamp(jointAngle(landmarks, HAND_LM.thumbCmc, HAND_LM.thumbMcp, HAND_LM.thumbIp), 0, MAX_CURL);
  const thumbDist = clamp(jointAngle(landmarks, HAND_LM.thumbMcp, HAND_LM.thumbIp, HAND_LM.thumbTip), 0, MAX_CURL);
  const thumbDirection = normalize(between(landmarks[HAND_LM.thumbCmc], landmarks[HAND_LM.thumbMcp]));
  let thumbOpposition = 0;
  let thumbOutOfPlane = 0;
  if (palm && thumbDirection) {
    const projected = projectedOnPlane(thumbDirection, palm.normal);
    if (projected) {
      // Thumb naturally starts lateral to the palm; measure only the useful opposition toward the
      // palm-forward direction and keep it inside conservative VRM limits.
      const angle = angleBetween(projected, palm.forward);
      thumbOpposition = clamp((Math.PI / 2 - angle) * 0.85, -0.7, 0.7);
    }
    thumbOutOfPlane = clamp(Math.asin(clamp(dot(thumbDirection, palm.normal), -1, 1)), -0.45, 0.45);
  }
  out[`${avatarSide}ThumbMetacarpal`] = [
    thumbOutOfPlane * 0.72,
    sign * (0.28 + thumbOpposition),
    sign * thumbProx * 0.12,
  ];
  out[`${avatarSide}ThumbProximal`] = [0, sign * thumbProx * 0.48, sign * thumbProx * 0.58];
  out[`${avatarSide}ThumbDistal`] = [0, 0, sign * thumbDist];

  return out;
}

/**
 * MediaPipe HandLandmarker handedness("Left"/"Right") + 미러 → 아바타 측.
 *
 * 주의: HandLandmarker 의 handedness 는 "셀카(미러)" 입력을 가정해 분류된다 — 즉
 * PoseLandmarker 의 해부학적 left/right 랜드마크 라벨과 반대다(같은 물리적 손인데 라벨이 뒤집힘).
 * 손가락은 팔(pose 솔버)이 올려놓은 아바타 손에 얹혀야 손바닥 방향이 팔과 일치한다.
 * pose 솔버는 미러 시 좌우를 스왑해 "거울 따라하기"를 만들므로, 손가락도 같은 측을 골라야 한다:
 *   - mirror(셀카 거울): HandLandmarker 라벨을 그대로 사용(이미 미러 기준이라 스왑하면 이중반전 → 손바닥 반대).
 *   - non-mirror: 라벨을 스왑해 해부학적 측으로 되돌린다.
 */
export function avatarSideForHand(handedness: string, mirror: boolean): "left" | "right" {
  const labelSide = handedness.toLowerCase().startsWith("l") ? "left" : "right";
  if (mirror) return labelSide;
  return labelSide === "left" ? "right" : "left";
}
