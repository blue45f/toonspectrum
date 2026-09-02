/**
 * StrokeBudget — the memory/time envelope a stroke pipeline runs inside.
 *
 * 2026-09-02 아키텍처 리뷰의 처방: 획 길이를 고정 dab 상한(4,096 → 32,768 …)으로 자르는 대신
 * "상주 바이트 / 프레임 샘플 / 더티 타일 / 커밋 작업시간" 예산을 두고, 예산을 넘으면 획을
 * 자르는 게 아니라 **수락된 접두(accepted prefix)** 를 청크 단위로 플러시한다. 그러면 획은
 * 사실상 무제한이 되고 메모리·시간만 유계로 남는다.
 *
 * 이 모듈은 예산 모델과 순수 헬퍼만 제공한다. 기존 플래너의 dab 상한은 여기서 파생되며
 * (`resolveStrokeDabCapacity`), 현재 숫자(32,768)는 한 자리도 바뀌지 않는다 — 즉 이번 도입은
 * 동작 중립 리팩터링이고, 실제 청크 플러시 배선은 후속 레인이 담당한다.
 */

const MiB = 1_024 * 1_024;

/**
 * 예산을 초과했을 때의 처리 정책.
 *
 * - `chunk`     — 수락된 접두를 capacity 단위로 나눠 순차 플러시한다(획은 무제한).
 * - `checkpoint`— `chunk` 와 같은 분할이되, 청크 경계마다 내구 체크포인트를 남긴다.
 * - `degrade`   — 분할 없이 capacity 까지만 유지하고 나머지는 품질을 떨어뜨려 버린다
 *                 (레퍼런스/저사양 경로 전용 최후 수단).
 */
export type StrokeSpillPolicy = "chunk" | "checkpoint" | "degrade";

export interface StrokeBudget {
  /** 한 획의 계획/중간 산출물이 동시에 점유해도 되는 최대 바이트. */
  readonly maxResidentBytes: number;
  /** 한 프레임에 소비해도 되는 최대 입력 샘플 수. */
  readonly maxSamplesPerFrame: number;
  /** 한 프레임에 더럽혀도 되는 최대 타일 수. */
  readonly maxDirtyTiles: number;
  /** 한 커밋이 점유해도 되는 최대 작업 시간(ms). */
  readonly maxCommitWorkMs: number;
  readonly spillPolicy: StrokeSpillPolicy;
}

export type StudioStrokeBudgetProfileId =
  | "pro-webgpu-worker"
  | "webgpu-worker-lite"
  | "webgl2-compat"
  | "cpu-reference";

/**
 * 백엔드 티어별 기본 예산.
 *
 * `maxResidentBytes` 는 "한 획의 dab 계획이 점유해도 되는 바이트"를 뜻하고, dab 상한은
 * 여기서 `resolveStrokeDabCapacity` 로 파생된다(아래 per-dab 상수 주석의 산술 참고).
 */
export const STUDIO_STROKE_BUDGET_PROFILES: Record<
  StudioStrokeBudgetProfileId,
  StrokeBudget
> = {
  /** 워커 + WebGPU 풀 티어. 16 MiB / 128 B = 131,072 dab. */
  "pro-webgpu-worker": {
    maxResidentBytes: 16 * MiB,
    maxSamplesPerFrame: 2_048,
    maxDirtyTiles: 512,
    maxCommitWorkMs: 8,
    spillPolicy: "chunk",
  },
  /** 기본 티어(모바일 포함). 4 MiB / 128 B = 32,768 dab — 현재 출하 중인 상한과 동일하다. */
  "webgpu-worker-lite": {
    maxResidentBytes: 4 * MiB,
    maxSamplesPerFrame: 1_024,
    maxDirtyTiles: 256,
    maxCommitWorkMs: 6,
    spillPolicy: "chunk",
  },
  /** WebGL2 폴백. 업로드 비용이 커서 더 자주 체크포인트를 남긴다. */
  "webgl2-compat": {
    maxResidentBytes: 2 * MiB,
    maxSamplesPerFrame: 512,
    maxDirtyTiles: 128,
    maxCommitWorkMs: 5,
    spillPolicy: "checkpoint",
  },
  /** CPU 레퍼런스/테스트 경로. 유일하게 품질 저하를 허용한다. */
  "cpu-reference": {
    maxResidentBytes: 1 * MiB,
    maxSamplesPerFrame: 256,
    maxDirtyTiles: 64,
    maxCommitWorkMs: 12,
    spillPolicy: "degrade",
  },
};

/** 프로파일을 명시하지 않은 호출자가 받는 예산(= lite 프로파일). */
export const DEFAULT_STUDIO_STROKE_BUDGET: StrokeBudget =
  STUDIO_STROKE_BUDGET_PROFILES["webgpu-worker-lite"];

/**
 * 동적 브러시 dab 하나가 점유하는 것으로 과금하는 바이트.
 *
 * `StudioDynamicBrushDab` 는 필수 6개 + 선택 10개 안팎의 숫자 필드를 가진 단형(monomorphic)
 * 객체다. V8 기준 대략 "16 B 헤더 + 필드당 8 B + 배열 슬롯 8 B" 이므로 채워진 dab 이
 * 130 B 근처가 된다. 예산 라인은 이를 128 B 로 잡는다.
 *
 *   4 MiB (4,194,304 B) / 128 B = 32,768 dab  ← 현재 STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.max
 */
export const STUDIO_DYNAMIC_BRUSH_DAB_RESIDENT_BYTES = 128;

/**
 * 인과(causal) 수채 플래너 dab 하나가 점유하는 것으로 과금하는 바이트.
 *
 * `WatercolorBrushDab` 자체는 4 숫자 + 1 문자열로 60 B 남짓이지만, 인과 플래너는 dab 을
 * core/diffuse 쌍으로 내보내면서 스테이션 커서·안료 노이즈 상태를 함께 유지한다. 실측 전까지는
 * 동적 브러시와 같은 128 B 라인으로 과금한다. 상수를 따로 두는 이유는 나중에 한쪽만 실측값으로
 * 옮길 수 있게 하기 위해서다.
 *
 *   4 MiB (4,194,304 B) / 128 B = 32,768 dab  ← 현재 STUDIO_CAUSAL_WATERCOLOR_DAB_CAP_RANGE.max
 */
export const STUDIO_CAUSAL_WATERCOLOR_DAB_RESIDENT_BYTES = 128;

export interface StrokeDabCapacityInput {
  readonly budget: StrokeBudget;
  /** dab 하나에 과금할 상주 바이트. 0 이하/비유한이면 1 로 취급한다. */
  readonly bytesPerDab: number;
}

/**
 * 예산에서 dab 상한을 파생한다. 순수·무할당(floor 나눗셈 한 번).
 *
 * 최소 1 을 보장하므로, 예산이 아무리 작아도 "한 dab 도 못 찍는 플래너"는 나오지 않는다.
 */
export function resolveStrokeDabCapacity(input: StrokeDabCapacityInput): number {
  const { budget, bytesPerDab } = input;
  const bytes = Number.isFinite(bytesPerDab) && bytesPerDab > 0 ? bytesPerDab : 1;
  const resident = Number.isFinite(budget.maxResidentBytes)
    ? budget.maxResidentBytes
    : 0;
  return Math.max(1, Math.floor(resident / bytes));
}

export interface StrokeAcceptedPrefixInput {
  /** 지금까지 수락된 접두의 총 샘플(또는 dab) 수. */
  readonly totalSamples: number;
  /** 한 청크가 담을 수 있는 최대 개수(보통 `resolveStrokeDabCapacity` 결과). */
  readonly capacity: number;
  readonly policy: StrokeSpillPolicy;
}

export interface StrokeAcceptedPrefixPlan {
  readonly chunkCount: number;
  readonly chunkSizes: readonly number[];
  /** `degrade` 정책에서 capacity 를 넘겨 잘라낸 경우에만 true. */
  readonly degraded: boolean;
  /** `checkpoint` 정책에서 내구 체크포인트 간격(샘플 수). 다른 정책에서는 없다. */
  readonly checkpointEvery?: number;
}

/**
 * 수락된 접두를 정책에 따라 청크로 나눈다.
 *
 * `chunk`/`checkpoint` 는 획을 자르지 않는다 — 총합은 항상 `totalSamples` 와 같다.
 * `degrade` 만 유일하게 손실적이며, 그 사실을 `degraded` 로 표시한다.
 */
export function planStrokeAcceptedPrefixChunks(
  input: StrokeAcceptedPrefixInput,
): StrokeAcceptedPrefixPlan {
  const { policy } = input;
  const capacity = Math.max(
    1,
    Number.isFinite(input.capacity) ? Math.floor(input.capacity) : 1,
  );
  const total = Number.isFinite(input.totalSamples)
    ? Math.max(0, Math.floor(input.totalSamples))
    : 0;

  if (total === 0) {
    return { chunkCount: 0, chunkSizes: [], degraded: false };
  }

  if (policy === "degrade") {
    const kept = Math.min(total, capacity);
    return { chunkCount: 1, chunkSizes: [kept], degraded: total > capacity };
  }

  const chunkCount = Math.ceil(total / capacity);
  const chunkSizes: number[] = [];
  let remaining = total;
  for (let index = 0; index < chunkCount; index += 1) {
    const size = Math.min(capacity, remaining);
    chunkSizes.push(size);
    remaining -= size;
  }

  return policy === "checkpoint"
    ? { chunkCount, chunkSizes, degraded: false, checkpointEvery: capacity }
    : { chunkCount, chunkSizes, degraded: false };
}

export interface StrokeFrameBudgetInput {
  readonly budget: StrokeBudget;
  readonly samplesThisFrame: number;
  readonly dirtyTiles: number;
  readonly elapsedMs: number;
}

/**
 * 이번 프레임 작업량이 예산 안인지 판정한다. 순수·무할당.
 *
 * 비유한 입력은 "예산 초과"로 간주해 fail-closed 한다.
 */
export function isWithinStrokeFrameBudget(input: StrokeFrameBudgetInput): boolean {
  const { budget, samplesThisFrame, dirtyTiles, elapsedMs } = input;
  if (
    !Number.isFinite(samplesThisFrame)
    || !Number.isFinite(dirtyTiles)
    || !Number.isFinite(elapsedMs)
  ) {
    return false;
  }
  return (
    samplesThisFrame <= budget.maxSamplesPerFrame
    && dirtyTiles <= budget.maxDirtyTiles
    && elapsedMs <= budget.maxCommitWorkMs
  );
}
