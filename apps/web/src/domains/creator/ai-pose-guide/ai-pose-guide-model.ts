/**
 * AI 포즈/선화 가이드 도메인 모델 (티켓 A1 [P0])
 *
 * 목적:
 * - 스틱피겨 포즈 또는 러프 선화를 입력으로 받아, AI가 선화를 유지하면서
 *   채색/디테일이 포함된 이미지를 생성하도록 요청하는 도메인 모델을 정의한다.
 * - 실제 AI 추론은 외부 서비스(예: Stable Diffusion + ControlNet
 *   lineart_anime / MistoLine)가 수행하므로, 이 파일은 순수 TypeScript
 *   (DOM/Canvas 의존 금지)로 요청/파라미터/작업 상태/결과 비교 계약만 다룬다.
 *
 * ControlNet 선화 준수도(Adherence):
 * - "low"    → 0.35: 선화를 느슨하게 참고, AI 재해석 비중이 큼
 * - "medium" → 0.65: 기본 균형값
 * - "high"   → 0.90: 선화 준수를 최우선
 */

/** 2D 포즈를 구성하는 조인트 식별자 (Stick Figure 기준). */
export type PoseJointId =
  | "head"
  | "neck"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "handL"
  | "handR"
  | "hipL"
  | "hipR"
  | "kneeL"
  | "kneeR"
  | "footL"
  | "footR";

/** 포즈 조인트 목록 — 검증·순회 시 순서가 고정되어야 하는 경우 사용. */
export const POSE_JOINT_IDS: readonly PoseJointId[] = [
  "head",
  "neck",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "handL",
  "handR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
  "footL",
  "footR",
];

/** 정규화된 2D 좌표 (0..1). x: 왼쪽 0 → 오른쪽 1, y: 위 0 → 아래 1. */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** 2D 스틱피겨 포즈 — 모든 조인트가 0..1 범위의 정규화 좌표를 갖는다. */
export interface Pose2D {
  joints: Record<PoseJointId, NormalizedPoint>;
}

/**
 * T자 기본 포즈를 생성한다.
 * - 머리 상단 중앙, 양팔 수평으로 뻗음, 다리는 약간 벌린 직립 자세.
 */
export function createDefaultPose(): Pose2D {
  const joints: Record<PoseJointId, NormalizedPoint> = {
    head: { x: 0.5, y: 0.05 },
    neck: { x: 0.5, y: 0.16 },
    shoulderL: { x: 0.3, y: 0.18 },
    shoulderR: { x: 0.7, y: 0.18 },
    elbowL: { x: 0.18, y: 0.18 },
    elbowR: { x: 0.82, y: 0.18 },
    handL: { x: 0.06, y: 0.18 },
    handR: { x: 0.94, y: 0.18 },
    hipL: { x: 0.44, y: 0.52 },
    hipR: { x: 0.56, y: 0.52 },
    kneeL: { x: 0.42, y: 0.75 },
    kneeR: { x: 0.58, y: 0.75 },
    footL: { x: 0.4, y: 0.98 },
    footR: { x: 0.6, y: 0.98 },
  };
  return { joints };
}

/** 선화 준수도(ControlNet 가중치) 3단계. */
export type LineartAdherence = "low" | "medium" | "high";

/** 준수도 단계 → ControlNet 가중치(0..1) 매핑. */
const ADHERENCE_WEIGHTS: Record<LineartAdherence, number> = {
  low: 0.35,
  medium: 0.65,
  high: 0.9,
};

/** 선화 준수도 3단계를 ControlNet 가중치(0..1)로 변환한다. */
export function adherenceToWeight(adherence: LineartAdherence): number {
  return ADHERENCE_WEIGHTS[adherence];
}

/** ControlNet 가중치 슬라이더 값(0..100)을 클램프한다. */
export function normalizeControlWeight(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** AI 포즈/선화 가이드 생성 요청 — 외부 추론 서비스로 전달되는 파라미터 계약. */
export interface PoseGuideRequest {
  /** 입력 포즈 (스틱피겨). */
  pose: Pose2D;
  /** 참고할 러프 선화 에셋 ID (없으면 포즈만 사용). */
  lineartRefId?: string;
  /** ControlNet 가중치 0..100. */
  controlWeight: number;
  /** 생성 프롬프트. */
  prompt: string;
  /** 네거티브 프롬프트 (선택). */
  negativePrompt?: string;
  /** 시드 (선택, 미지정 시 서버가 랜덤 할당). */
  seed?: number;
}

/** 요청 검증 오류 코드. */
export type PoseGuideValidationError =
  | { code: "MISSING_JOINTS"; joints: PoseJointId[] }
  | { code: "JOINT_OUT_OF_RANGE"; joints: PoseJointId[] }
  | { code: "CONTROL_WEIGHT_OUT_OF_RANGE"; value: number }
  | { code: "PROMPT_EMPTY" }
  | { code: "SEED_NOT_INTEGER"; value: number };

function isValidCoordinate(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * 생성 요청을 검증한다.
 * - 조인트 누락/좌표 범위(0..1), controlWeight 범위(0..100), prompt 비어 있음 여부, seed 정수 여부를 검사한다.
 * - 에러 목록을 반환하며, 빈 배열이면 유효한 요청이다.
 */
export function validatePoseGuideRequest(
  request: PoseGuideRequest
): PoseGuideValidationError[] {
  const errors: PoseGuideValidationError[] = [];

  const joints = request.pose?.joints ?? ({} as Record<PoseJointId, NormalizedPoint>);
  const missing = POSE_JOINT_IDS.filter((id) => joints[id] == null);
  if (missing.length > 0) {
    errors.push({ code: "MISSING_JOINTS", joints: missing });
  }
  const outOfRange = POSE_JOINT_IDS.filter(
    (id) =>
      joints[id] != null &&
      (!isValidCoordinate(joints[id].x) || !isValidCoordinate(joints[id].y))
  );
  if (outOfRange.length > 0) {
    errors.push({ code: "JOINT_OUT_OF_RANGE", joints: outOfRange });
  }

  if (
    !Number.isFinite(request.controlWeight) ||
    request.controlWeight < 0 ||
    request.controlWeight > 100
  ) {
    errors.push({ code: "CONTROL_WEIGHT_OUT_OF_RANGE", value: request.controlWeight });
  }

  if (request.prompt == null || request.prompt.trim().length === 0) {
    errors.push({ code: "PROMPT_EMPTY" });
  }

  if (request.seed !== undefined && !Number.isInteger(request.seed)) {
    errors.push({ code: "SEED_NOT_INTEGER", value: request.seed });
  }

  return errors;
}

/** 포즈 가이드 생성 작업 상태. */
export type PoseGuideJobStatus = "pending" | "running" | "done" | "failed";

/** 포즈 가이드 생성 작업 — 상태머신: pending → running → done | failed. */
export interface PoseGuideJob {
  id: string;
  status: PoseGuideJobStatus;
  request: PoseGuideRequest;
  /** done 상태에서의 생성 결과 (선택). */
  resultImageId?: string;
  /** failed 상태에서의 실패 사유 (선택). */
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

/** 허용된 상태 전이표. */
const ALLOWED_TRANSITIONS: Record<PoseGuideJobStatus, readonly PoseGuideJobStatus[]> = {
  pending: ["running", "failed"],
  running: ["done", "failed"],
  done: [],
  failed: [],
};

/**
 * 작업 상태를 전이시킨다.
 * - 허용되지 않은 전이(예: done → running, pending → done)는 Error를 던진다.
 * - 전이 성공 시 updatedAt을 갱신하고 done/failed에는 각각 resultImageId/errorMessage를 기록한다.
 */
export function transitionJobState(
  job: PoseGuideJob,
  next: PoseGuideJobStatus,
  now: number = Date.now(),
  detail?: { resultImageId?: string; errorMessage?: string }
): PoseGuideJob {
  if (!ALLOWED_TRANSITIONS[job.status].includes(next)) {
    throw new Error(
      `허용되지 않은 작업 상태 전이: ${job.status} → ${next}`
    );
  }
  const updated: PoseGuideJob = {
    ...job,
    status: next,
    updatedAt: now,
  };
  if (next === "done") {
    updated.resultImageId = detail?.resultImageId;
    updated.errorMessage = undefined;
  } else if (next === "failed") {
    updated.errorMessage = detail?.errorMessage ?? "알 수 없는 오류";
    updated.resultImageId = undefined;
  }
  return updated;
}

/** 결과 비교에 쓰이는 원본/생성 이미지 메타데이터. */
export interface PoseGuideResultMeta {
  imageId: string;
  /** 입력 종류: 포즈에서 생성되었는지, 선화+포즈에서 생성되었는지. */
  source: "pose" | "lineart+pose";
  controlWeight: number;
  seed?: number;
  width: number;
  height: number;
}

/** 원본 vs 생성 결과 diff 요약 한 항목. */
export interface PoseGuideDiffEntry {
  field: string;
  original: string | number | undefined;
  generated: string | number | undefined;
  changed: boolean;
}

/**
 * 원본 선화/포즈 참조와 AI 생성 결과를 비교해 diff 요약을 만든다.
 * - seed가 다르면 "재생성 불가능(다른 시드)" 주의가 포함된다.
 * - controlWeight 변화량도 기록한다.
 */
export function compareResults(
  original: PoseGuideResultMeta,
  generated: PoseGuideResultMeta
): PoseGuideDiffEntry[] {
  const fields: Array<keyof PoseGuideResultMeta> = [
    "source",
    "controlWeight",
    "seed",
    "width",
    "height",
  ];
  const entries: PoseGuideDiffEntry[] = fields.map((field) => ({
    field,
    original: original[field],
    generated: generated[field],
    changed: original[field] !== generated[field],
  }));

  const weightDelta = (generated.controlWeight ?? 0) - (original.controlWeight ?? 0);
  entries.push({
    field: "controlWeightDelta",
    original: 0,
    generated: weightDelta,
    changed: weightDelta !== 0,
  });

  entries.push({
    field: "seedMatch",
    original: original.seed,
    generated: generated.seed,
    changed: original.seed !== undefined && original.seed !== generated.seed,
  });

  return entries;
}
