import { useEffect, useRef } from "react";

/**
 * 페이지 로드당 BGM 자동 시작 시도 여부 (모듈 전역).
 * - 사용자가 일시정지한 뒤 다음 인터랙에서 다시 켜지지 않도록 1회만 시도한다.
 */
let autoStartAttempted = false;

/** 테스트에서만 사용: 모듈 전역 시도 플래그를 초기화한다. */
export function resetBgmAutoStartForTest(): void {
  autoStartAttempted = false;
}

export interface BgmFirstInteractionStartOptions {
  /** 브라우저가 Web Audio BGM을 지원하는지. */
  readonly supported: boolean;
  /** BGM 마스터 on/off (사용자 설정). */
  readonly enabled: boolean;
  /** `prefers-reduced-motion` 사용자인지. */
  readonly reducedMotion: boolean;
  /** BGM 시작 — 사용자 제스처 컨텍스트에서 호출된다. */
  readonly start: () => boolean;
}

/**
 * 첫 사용자 인터랙(클릭/탭/키 입력)에서 BGM을 자동 시작한다.
 *
 * - 리스너 콜백 자체가 사용자 제스처 컨텍스트이므로 AudioContext 생성이
 *   브라우저 자동재생 정책을 만족한다.
 * - 사용자가 BGM을 끈 상태(`enabled === false`)이거나 움직임 줄이기
 *   설정이면 자동 시작하지 않는다 (수동 시작 버튼은 그대로 노출된다).
 * - 페이지 로드당 최대 1회만 시도한다. 시작에 실패하면 다음 인터랙에서
 *   다시 시도한다.
 */
export function useBgmFirstInteractionStart({
  supported,
  enabled,
  reducedMotion,
  start,
}: BgmFirstInteractionStartOptions): void {
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!supported || autoStartAttempted) return;
    if (!enabled || reducedMotion) return;

    const onFirstInteraction = () => {
      if (autoStartAttempted) return;
      // 시작에 성공하면 리스너를 떼고, 실패하면 다음 인터랙에서 재시도한다.
      if (startRef.current()) {
        autoStartAttempted = true;
        window.removeEventListener("pointerdown", onFirstInteraction);
        window.removeEventListener("keydown", onFirstInteraction);
      }
    };
    window.addEventListener("pointerdown", onFirstInteraction);
    window.addEventListener("keydown", onFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, [supported, enabled, reducedMotion]);
}
