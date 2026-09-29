/**
 * 가상 공간 대형 스크린 오브젝트의 로컬 화면 공유 상태 기계.
 *
 * A-4 스포트라이트(`StudioVirtualSpaceRtcSpotlight`)와 구조가 충돌하지 않도록
 * 화면 공유 상태는 이 모듈의 독립 상태로 분리한다. 이 상태 기계는
 * "로컬 상태 + UI 미리보기" 범위만 다룬다: 실제 RTC/서버 송출은 하지 않으며,
 * `getDisplayMedia` 연동이 필요하면 호출자가 로컬 프리뷰 범위에서만 수행하고
 * 실패 시 이 상태의 `failed` + 에러 코드로 폴백 안내를 표시한다.
 */

export type StudioLocalScreenShareStatus = "idle" | "requesting" | "previewing" | "failed";

export type StudioLocalScreenShareError = "unsupported" | "denied" | "failed";

export interface StudioLocalScreenShareState {
  readonly status: StudioLocalScreenShareStatus;
  /** 미리보기가 바인딩된 대형 스크린 오브젝트 id. */
  readonly screenId: string | null;
  readonly error: StudioLocalScreenShareError | null;
  readonly startedAt: number | null;
}

export const INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE: StudioLocalScreenShareState = Object.freeze({
  status: "idle",
  screenId: null,
  error: null,
  startedAt: null,
});

export type StudioLocalScreenShareEvent =
  | { readonly type: "request" }
  | { readonly type: "preview-ready"; readonly screenId: string; readonly startedAt: number }
  | { readonly type: "fail"; readonly error: StudioLocalScreenShareError }
  | { readonly type: "stop" };

const SCREEN_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;

function cleanScreenId(value: string): string | null {
  return SCREEN_ID_PATTERN.test(value) ? value : null;
}

function next(
  state: StudioLocalScreenShareState,
  patch: Omit<StudioLocalScreenShareState, "status"> & { readonly status: StudioLocalScreenShareStatus },
): StudioLocalScreenShareState {
  return Object.freeze({ ...state, ...patch });
}

/**
 * 순수 리듀서: 허용되지 않은 전이는 현재 상태를 그대로 반환한다.
 * - `request`: idle/failed에서만 화면 선택을 시작한다.
 * - `preview-ready`: requesting에서만 미리보기를 확정한다.
 * - `fail`: requesting에서만 실패로 전환한다.
 * - `stop`: 어떤 활성 상태에서든 idle로 되돌린다.
 */
export function reduceStudioLocalScreenShare(
  state: StudioLocalScreenShareState,
  event: StudioLocalScreenShareEvent,
): StudioLocalScreenShareState {
  if (event.type === "request") {
    if (state.status === "requesting" || state.status === "previewing") return state;
    return next(state, { status: "requesting", screenId: null, error: null, startedAt: null });
  }
  if (event.type === "preview-ready") {
    if (state.status !== "requesting") return state;
    const screenId = cleanScreenId(event.screenId);
    if (!screenId || !Number.isFinite(event.startedAt)) return state;
    return next(state, { status: "previewing", screenId, error: null, startedAt: event.startedAt });
  }
  if (event.type === "fail") {
    if (state.status !== "requesting") return state;
    return next(state, { status: "failed", screenId: null, error: event.error, startedAt: null });
  }
  if (event.type === "stop") {
    if (state.status === "idle") return state;
    return next(state, { status: "idle", screenId: null, error: null, startedAt: null });
  }
  return state;
}
