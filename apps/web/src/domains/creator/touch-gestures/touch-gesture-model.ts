/**
 * touch-gesture-model.ts
 *
 * 모바일 드로잉 제스처의 순수 도메인 모델 (티켓 T1, 벤치마크: Procreate).
 *
 * DOM에 의존하지 않는다. PointerEvent / TouchEvent 는 호출자가 아래 추상 타입으로
 * 변환해서 전달하고, 이 모듈은 판정·설정·스크럽 상태만 순수 함수로 다룬다.
 * 실제 이벤트 바인딩과 undo/redo 실행은 UI 레이어(호스트 훅)가 담당한다.
 */

/** 추상화된 포인터 샘플 1개. PointerEvent 에서 x/y/t/pointerType 만 추출한 값이다. */
export interface TouchSample {
  /** 포인터 식별자 (PointerEvent.pointerId). */
  pointerId: number;
  /** 캔버스(또는 제스처 표면) 기준 X 좌표 (px). */
  x: number;
  /** 캔버스(또는 제스처 표면) 기준 Y 좌표 (px). */
  y: number;
  /** 샘플 시각 (ms, performance.now() 기준 상대 시각이면 된다). */
  t: number;
  /** 포인터 종류. */
  pointerType: "touch" | "pen" | "mouse";
}

/**
 * 한 번의 접촉(터치 다운→업, 또는 홀드 중)에 모은 샘플 묶음.
 * fingerCount 는 접촉 중인 포인터 개수(두 손가락 탭=2, 세 손가락 탭=3)다.
 */
export interface TouchSequence {
  samples: TouchSample[];
  /** 제스처 시작 시각 (ms). samples[0].t 와 같을 수도, 호출자가 정한 다운 시각일 수도 있다. */
  startTime: number;
  /** 접촉 중인 손가락(포인터) 수. */
  fingerCount: number;
}

/** 탭으로 인정되는 최대 이동 거리 (px). 이 이상 움직이면 줌/팬 제스처다. */
export const TAP_MAX_MOVE_PX = 10;
/** 탭으로 인정되는 최대 지속 시간 (ms). 이 이상 누르고 있으면 홀드다. */
export const TAP_MAX_DURATION_MS = 300;
/** 탭 후 홀드 유지 시 연속 undo/redo 가 발생하는 간격 (ms, Procreate식 스크럽). */
export const SCRUB_INTERVAL_MS = 150;

/** 터치 시퀀스 판정 결과. "tap"일 때만 gestureForTap 으로 액션을 매핑한다. */
export type TouchSequenceKind = "tap" | "pan" | "hold";

/** 탭 제스처가 유발하는 액션. "none" 은 제스처가 실행취소/다시실행과 무관함을 뜻한다. */
export type TapGestureAction = "undo" | "redo" | "none";

/**
 * 시퀀스를 "tap" | "pan" | "hold" 로 판별한다.
 *
 * - 이동 거리: 각 포인터가 터치다운 지점에서 가장 멀어진 거리(최대 편위)의, 전 포인터 중 최대값.
 *   손가락 하나라도 기준을 넘으면 탭이 아니다.
 * - 지속 시간: 마지막 샘플 시각 - startTime.
 * - 이동 < TAP_MAX_MOVE_PX && 지속 < TAP_MAX_DURATION_MS → "tap"
 * - 이동 < TAP_MAX_MOVE_PX 이지만 지속이 길면 → "hold" (스크럽 진입 가능 상태)
 * - 이동이 크면 → "pan" (줌/팬)
 * - 샘플이 비어 있으면 판정 불가이므로 보수적으로 "pan" 을 반환한다 (탭이 아님을 보장).
 */
export function classifyTap(seq: TouchSequence): TouchSequenceKind {
  if (seq.samples.length === 0) {
    return "pan";
  }
  const movePx = maxPointerExcursionPx(seq.samples);
  const durationMs = tapDurationMs(seq);
  if (movePx < TAP_MAX_MOVE_PX && durationMs < TAP_MAX_DURATION_MS) {
    return "tap";
  }
  if (movePx < TAP_MAX_MOVE_PX) {
    return "hold";
  }
  return "pan";
}

/**
 * 손가락 수 → 제스처 액션 매핑 (Procreate 관례).
 * - 2손가락 탭 → "undo" (실행 취소)
 * - 3손가락 탭 → "redo" (다시 실행)
 * - 그 외 (1/4손가락 이상 등) → "none"
 */
export function gestureForTap(fingerCount: number): TapGestureAction {
  if (fingerCount === 2) return "undo";
  if (fingerCount === 3) return "redo";
  return "none";
}

/** 터치 제스처 설정. 오작동 대비 on/off 와 접근성/모션 대체를 제공한다. */
export interface TouchGestureSettings {
  /** 전체 터치 제스처 사용 여부. false 면 모든 제스처가 비활성화된다. */
  enabled: boolean;
  /** 두/세 손가락 탭 실행취소·다시실행 제스처 사용 여부. 접근성 대체 버튼은 항상 유지된다. */
  undoRedoGestures: boolean;
  /** 퀵 메뉴 제스처(예약 필드). 생략 시 비활성 취급. */
  quickMenuGesture?: boolean;
  /** true 면 애니메이션/진동 같은 부가 효과 없이 토스트 텍스트만 표시한다 (reduced-motion). */
  reduceMotionToastOnly: boolean;
}

/** 기본 설정: 제스처 전체 켜짐, 실행취소/다시실행 켜짐, 모션 축소 토스트 모드 꺼짐. */
export function defaultTouchGestureSettings(): TouchGestureSettings {
  return {
    enabled: true,
    undoRedoGestures: true,
    reduceMotionToastOnly: false,
  };
}

/**
 * 부분 설정(예: 로컬 스토리지 역직렬화 결과)을 정규화한다.
 * - null/undefined/비객체 → 기본값
 * - boolean 이 아닌 값 → 해당 키의 기본값으로 대체
 * - quickMenuGesture 는 boolean 으로 명시된 경우에만 유지하고, 아니면 생략한다.
 */
export function normalizeTouchGestureSettings(
  input: Partial<TouchGestureSettings> | null | undefined,
): TouchGestureSettings {
  const defaults = defaultTouchGestureSettings();
  if (!input || typeof input !== "object") {
    return defaults;
  }
  const pick = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;
  const normalized: TouchGestureSettings = {
    enabled: pick(input.enabled, defaults.enabled),
    undoRedoGestures: pick(input.undoRedoGestures, defaults.undoRedoGestures),
    reduceMotionToastOnly: pick(input.reduceMotionToastOnly, defaults.reduceMotionToastOnly),
  };
  if (typeof input.quickMenuGesture === "boolean") {
    normalized.quickMenuGesture = input.quickMenuGesture;
  }
  return normalized;
}

/**
 * 탭 후 홀드 스크럽 상태.
 * - active: 홀드 스크럽 진행 중인지
 * - count: 지금까지 발생한 연속 undo/redo 횟수 (토스트 "N단계 실행 취소" 표시용)
 * - lastTickAt: 마지막 틱 시각 (ms)
 */
export interface ScrubState {
  active: boolean;
  count: number;
  lastTickAt: number;
}

/** 홀드 스크럽을 시작한다. 카운트는 0부터, 틱 기준 시각은 nowMs 로 둔다. */
export function beginScrub(nowMs: number): ScrubState {
  return { active: true, count: 0, lastTickAt: nowMs };
}

/** 홀드 스크럽을 종료한다. */
export function stopScrub(): ScrubState {
  return { active: false, count: 0, lastTickAt: 0 };
}

export interface ScrubTickResult {
  /** 이번 호출에서 틱이 발생했는지 (발생 시 호출자는 undo/redo 1회를 실행한다). */
  ticked: boolean;
  /** 틱 반영 후의 새 상태. 입력 상태는 변경하지 않는다 (순수 함수). */
  state: ScrubState;
}

/**
 * 현재 시각 nowMs 에서 스크럽 틱이 발생하는지 판정한다.
 * - 비활성 상태이거나, 마지막 틱에서 SCRUB_INTERVAL_MS(150ms)가 지나지 않았으면 ticked=false
 * - 150ms 이상 경과했으면 ticked=true, count+1, lastTickAt=nowMs 인 새 상태를 반환한다.
 * - 여러 구간을 건너뛴 경우에도 호출당 1틱만 발생한다 (호출자는 프레임/이벤트마다 호출).
 */
export function nextScrubTick(state: ScrubState, nowMs: number): ScrubTickResult {
  if (!state.active) {
    return { ticked: false, state };
  }
  if (nowMs - state.lastTickAt < SCRUB_INTERVAL_MS) {
    return { ticked: false, state };
  }
  return {
    ticked: true,
    state: { ...state, count: state.count + 1, lastTickAt: nowMs },
  };
}

/** 설명 텍스트 로케일. */
export type GestureLocale = "ko" | "en";

/**
 * 제스처 액션의 사람 읽기용 설명. 토스트/설정 화면/접근성 라벨에 사용한다.
 * - "undo" → "실행 취소" / "Undo"
 * - "redo" → "다시 실행" / "Redo"
 * - "none" → "제스처 없음" / "No gesture"
 */
export function describeGestureAction(
  action: TapGestureAction,
  locale: GestureLocale = "ko",
): string {
  if (action === "undo") return locale === "ko" ? "실행 취소" : "Undo";
  if (action === "redo") return locale === "ko" ? "다시 실행" : "Redo";
  return locale === "ko" ? "제스처 없음" : "No gesture";
}

/**
 * 스크럽(연속 undo/redo) 진행 중 토스트 문구.
 * - (undo, 3, ko) → "3단계 실행 취소"
 * - (redo, 2, en) → "Redo 2 steps"
 * reduced-motion 모드(reduceMotionToastOnly)에서는 이 텍스트만 표시한다.
 */
export function describeScrubFeedback(
  action: Extract<TapGestureAction, "undo" | "redo">,
  steps: number,
  locale: GestureLocale = "ko",
): string {
  const safeSteps = Math.max(1, Math.floor(steps));
  if (locale === "ko") {
    return action === "undo"
      ? `${safeSteps}단계 실행 취소`
      : `${safeSteps}단계 다시 실행`;
  }
  return action === "undo" ? `Undo ${safeSteps} steps` : `Redo ${safeSteps} steps`;
}

/* ---------- 내부 헬퍼 (공개 API는 위 함수들) ---------- */

/** 각 포인터의 터치다운 지점 대비 최대 편위 중 전체 최대값 (px). */
function maxPointerExcursionPx(samples: TouchSample[]): number {
  const firstByPointer = new Map<number, TouchSample>();
  let maxExcursion = 0;
  for (const sample of samples) {
    const first = firstByPointer.get(sample.pointerId);
    if (!first) {
      firstByPointer.set(sample.pointerId, sample);
      continue;
    }
    const dx = sample.x - first.x;
    const dy = sample.y - first.y;
    const excursion = Math.hypot(dx, dy);
    if (excursion > maxExcursion) {
      maxExcursion = excursion;
    }
  }
  return maxExcursion;
}

/** 시퀀스 지속 시간 (ms). 마지막 샘플 시각 - startTime, 음수가 되지 않게 보정한다. */
function tapDurationMs(seq: TouchSequence): number {
  let lastT = seq.startTime;
  for (const sample of seq.samples) {
    if (sample.t > lastT) {
      lastT = sample.t;
    }
  }
  return Math.max(0, lastT - seq.startTime);
}
