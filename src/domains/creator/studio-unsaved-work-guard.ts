/**
 * 탭 종료 경고 — "닫기 전에 물어보기"가 없던 마지막 조용한 실패를 막는다.
 *
 * 감사 항목: 스튜디오는 `pagehide` 에서 복구 사이드카를 동기 기록하지만, **탭을 닫기 전에
 * 사용자에게 묻는 표면이 0건**이었다. 복구 스냅샷이 있다는 것과 사용자가 그 사실을 안다는
 * 것은 다르다. 다음 방문에 복구 배너로 되찾을 수 있더라도, 지금 닫으면 **서버 원고는 뒤처진
 * 상태로 남는다** — 다른 기기에서 열면 방금 그린 것이 없다.
 *
 * 배선 규율:
 *  - **미저장일 때만** 경고한다. 항상 띄우면 사용자가 학습해서 무시하고, 그러면 정말 위험한
 *    순간에도 무시된다(경고의 조용한 실패).
 *  - 판정은 새 상태를 만들지 않고 **이미 있는 저장 권위 신호**를 읽는다: 편집 세대
 *    (`studioRevisionProjectGenerationRef`)가 내구 저장 세대
 *    (`studioLifecycleDurableGenerationRef`)를 앞서거나, 아직 페이지에 커밋되지 않은 획
 *    지문이 마지막으로 저장된 지문과 다르면 미저장이다.
 *  - 순수 모듈. React·DOM 전역 없음(리스너 대상은 주입받는다).
 */

export interface StudioPendingStrokeBatchLike {
  readonly pageId: string;
  readonly strokes: readonly { readonly id: string }[];
}

/**
 * 아직 페이지에 커밋되지 않은 획 배치의 지문.
 *
 * 자동저장 이펙트와 종료 경고가 **같은 문자열**을 봐야 한다. 두 곳이 각자 지문을 만들면
 * 한쪽만 규칙이 바뀌었을 때 "저장됐다고 보는데 실제로는 아닌" 상태가 조용히 생긴다.
 */
export function studioPendingStrokeFingerprint(
  batch: StudioPendingStrokeBatchLike | null | undefined,
): string {
  if (!batch) return "";
  return `${batch.pageId}:${batch.strokes.map((stroke) => stroke.id).join(",")}`;
}

export interface StudioUnsavedWorkSignals {
  /** 하이드레이션 완료 여부. 아직이면 사용자가 잃을 편집 자체가 없다. */
  readonly hydrated: boolean;
  /** 현재 편집 세대. */
  readonly editGeneration: number;
  /** 내구 저장소가 마지막으로 받아들인 세대. */
  readonly durableGeneration: number;
  /** 아직 페이지에 커밋되지 않은 획 배치의 지문(없으면 ""). */
  readonly pendingStrokeFingerprint: string;
  /** 내구 저장소가 마지막으로 받아들인 획 지문. */
  readonly durablePendingStrokeFingerprint: string;
}

export function hasUnsavedStudioWork(signals: StudioUnsavedWorkSignals): boolean {
  if (!signals.hydrated) return false;
  if (signals.editGeneration > signals.durableGeneration) return true;
  return (
    signals.pendingStrokeFingerprint !== signals.durablePendingStrokeFingerprint
  );
}

export interface StudioUnloadGuardTarget {
  addEventListener(
    type: "beforeunload",
    listener: (event: BeforeUnloadEvent) => void,
  ): void;
  removeEventListener(
    type: "beforeunload",
    listener: (event: BeforeUnloadEvent) => void,
  ): void;
}

export interface StudioUnloadGuardOptions {
  readonly target: StudioUnloadGuardTarget;
  /** 호출 시점의 미저장 여부. 매 이벤트마다 새로 읽는다(저장 뒤에는 조용히 닫혀야 한다). */
  readonly hasUnsavedWork: () => boolean;
}

/**
 * `beforeunload` 를 설치하고 해제 함수를 돌려준다.
 *
 * 브라우저는 문구를 무시하고 자체 확인 창을 띄운다. 우리가 통제할 수 있는 것은 **띄울지
 * 말지** 하나뿐이므로, 판정을 정확히 하는 것이 이 함수의 전부다.
 */
export function installStudioUnloadGuard(
  options: StudioUnloadGuardOptions,
): () => void {
  const listener = (event: BeforeUnloadEvent): void => {
    if (!options.hasUnsavedWork()) return;
    event.preventDefault();
    // 구형 브라우저 호환 — 최신 브라우저는 preventDefault 만으로 확인 창을 띄운다.
    event.returnValue = "";
  };
  options.target.addEventListener("beforeunload", listener);
  return () => {
    options.target.removeEventListener("beforeunload", listener);
  };
}
