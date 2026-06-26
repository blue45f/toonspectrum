/**
 * @toonspectrum/core/fx/hooks — fx 엔진을 React 에 잇는 얇은 훅 모음(웹·토스 공유).
 *
 * audio/particles 본체는 프레임워크 비종속이고, 이 파일만 React 를 **peer** 로 씁니다.
 * - useClickSfx()    : document 에 위임 클릭 리스너 1개를 달아 인터랙티브 요소 탭마다 'tick'.
 * - useAmbientBgm()  : 생성형 앰비언트 BGM opt-in 토글 + 무드 로테이션 제어 + 영속 상태 구독.
 * - useAudioState()  : 오디오 상태(mute/volume/opt-in/무드) 구독(useSyncExternalStore).
 * - useFx()          : playSfx / 파티클 버스트 / 상태를 한 번에 묶은 편의 훅.
 *
 * 모든 훅은 SSR-safe(서버 스냅샷 제공) 합니다.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  BGM_PRESETS,
  type AudioState,
  type BgmPreset,
  type SfxName,
  bgmNext,
  bgmSetMood,
  bgmToggle,
  getAudioState,
  onAudioStateChange,
  playSfx,
  resumeAudio,
  setBgmEnabled,
  setMasterVolume,
  setMuted,
  setSfxEnabled,
} from "./audio";
import {
  type ParticleBurstOptions,
  triggerParticleBurst,
  triggerParticleBurstAtElement,
} from "./particles";

/* ── 상태 구독(useSyncExternalStore) ──────────────────────────────────────── */

// 서버/초기 스냅샷 — onAudioStateChange 가 매번 새 객체를 주므로 안정 참조용 캐시는
// 엔진(getAudioState)에 위임한다. SSR 에서는 getServerSnapshot 으로 동일 스냅샷 사용.
const subscribe = (onStoreChange: () => void): (() => void) => onAudioStateChange(onStoreChange);

/** 오디오 상태(opt-in·mute·volume·현재 무드)를 구독한다. */
export function useAudioState(): AudioState {
  return useSyncExternalStore(subscribe, getAudioState, getAudioState);
}

/* ── useClickSfx — 전역 위임 클릭 'tick' ──────────────────────────────────── */

const SFX_SELECTOR =
  'button, a[href], [role="button"], .pressable, input[type="submit"], input[type="button"], [data-sfx]';

const isElementLike = (value: unknown): value is Element =>
  typeof (value as Element | null)?.matches === "function";

/** 클릭 타겟(또는 조상)이 사운드 대상인지 + 비활성/제외 여부 판정. */
const findSfxTarget = (start: EventTarget | null): Element | null => {
  let node: Element | null = isElementLike(start) ? start : null;
  while (node) {
    if (typeof node.closest === "function" && node.closest("[data-no-sfx]")) return null;
    if (node.matches(SFX_SELECTOR)) {
      if (
        (node as HTMLButtonElement).disabled ||
        node.getAttribute("aria-disabled") === "true"
      ) {
        return null;
      }
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

/** 연타로 소리가 뭉치지 않게 하는 스로틀(ms). */
const CLICK_THROTTLE_MS = 30;

export interface UseClickSfxOptions {
  /** false 면 리스너를 달지 않음(런타임 토글용). 기본 true. */
  enabled?: boolean;
  /** 재생할 효과음(기본 'tick'). */
  sfx?: SfxName;
}

/**
 * document 에 캡처 단계 클릭 리스너 **1개**를 달아 인터랙티브 요소 탭마다 'tick' 을 재생한다.
 * `[data-no-sfx]`·disabled 요소는 제외, 30ms 스로틀. 컴포넌트 트리 루트에서 1회만 호출하세요.
 */
export function useClickSfx(options: UseClickSfxOptions = {}): void {
  const { enabled = true, sfx = "tick" } = options;
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let lastPlayedAt = 0;
    const handler = (event: Event): void => {
      const target = findSfxTarget(event.target);
      if (!target) return;
      const nowMs = Date.now();
      if (nowMs - lastPlayedAt < CLICK_THROTTLE_MS) return;
      lastPlayedAt = nowMs;
      void resumeAudio(); // 첫 제스처 언락.
      playSfx(sfx);
    };
    document.addEventListener("click", handler, { capture: true, passive: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [enabled, sfx]);
}

/* ── useAmbientBgm — opt-in BGM 토글 + 로테이션 제어 ──────────────────────── */

export interface UseAmbientBgm {
  /** BGM opt-in 여부. */
  enabled: boolean;
  /** 현재(또는 다음 시작할) 무드명. */
  mood: string;
  /** 현재 무드 id. */
  moodId: string;
  /** 사용 가능한 무드 프리셋(메타). */
  presets: readonly BgmPreset[];
  /** on↔off 토글(켜졌으면 true 반환). 제스처 핸들러에서 호출하세요. */
  toggle: () => boolean;
  /** 명시적으로 켜기/끄기. */
  setEnabled: (value: boolean) => void;
  /** 다음 무드로 전환. */
  next: () => void;
  /** 특정 무드 id 로 전환. */
  setMood: (moodId: string) => void;
}

/**
 * 생성형 앰비언트 BGM 의 opt-in 토글·무드 로테이션·영속 상태를 React 로 노출한다.
 * 자동재생하지 않으며(autoplay 정책), toggle 은 사용자 제스처 안에서 호출되어야 한다.
 */
export function useAmbientBgm(): UseAmbientBgm {
  const audio = useAudioState();
  const toggle = useCallback(() => bgmToggle(), []);
  const setEnabled = useCallback((value: boolean) => setBgmEnabled(value), []);
  const next = useCallback(() => bgmNext(), []);
  const setMood = useCallback((moodId: string) => bgmSetMood(moodId), []);
  return {
    enabled: audio.bgmEnabled,
    mood: audio.currentMood,
    moodId: audio.currentMoodId,
    presets: BGM_PRESETS,
    toggle,
    setEnabled,
    next,
    setMood,
  };
}

/* ── useFx — 편의 묶음 훅 ─────────────────────────────────────────────────── */

export interface UseFx {
  /** 효과음 재생('tick'|'pop'|'success'|'error'). */
  sfx: (name: SfxName) => void;
  /** (x, y) 뷰포트 좌표에 파티클 버스트. */
  burst: (x: number, y: number, options?: ParticleBurstOptions) => void;
  /** 요소 중심에서 파티클 버스트. */
  burstAt: (el: Element | null | undefined, options?: ParticleBurstOptions) => void;
  /** 효과음 on/off(영속). */
  setSfxEnabled: (value: boolean) => void;
  /** 마스터 음소거 on/off(영속). */
  setMuted: (value: boolean) => void;
  /** 마스터 볼륨(0~1, 영속). */
  setVolume: (value: number) => void;
  /** 오디오 상태 스냅샷(구독). */
  audio: AudioState;
}

/**
 * 효과음·파티클·오디오 설정을 한 번에 묶은 편의 훅. 컴포넌트에서 `const fx = useFx()` 로 쓰세요.
 */
export function useFx(): UseFx {
  const audio = useAudioState();
  const sfx = useCallback((name: SfxName) => playSfx(name), []);
  const burst = useCallback(
    (x: number, y: number, options?: ParticleBurstOptions) => triggerParticleBurst(x, y, options),
    [],
  );
  const burstAt = useCallback(
    (el: Element | null | undefined, options?: ParticleBurstOptions) =>
      triggerParticleBurstAtElement(el, options),
    [],
  );
  return {
    sfx,
    burst,
    burstAt,
    setSfxEnabled,
    setMuted,
    setVolume: setMasterVolume,
    audio,
  };
}

/* ── useReveal — 스크롤-진입 모션(IntersectionObserver, once) ──────────────────── */

export interface UseRevealOptions {
  /** 진입 판정 임계(0~1). 기본 0.01(픽셀 한 줄만 보여도 발화 — 큰 섹션이 늦게 안 뜨도록). */
  threshold?: number;
  /** 루트 마진(IO rootMargin). 기본 "200px 0px 200px 0px"(뷰포트 200px 전부터 미리 발화 — 빠른 플링/앵커 점프에도 공백 방지). */
  rootMargin?: string;
  /** false 면 관찰하지 않고 즉시 보임 처리(런타임 토글용). 기본 true. */
  enabled?: boolean;
}

/**
 * 요소가 처음 뷰포트에 들어오면 한 번만 `revealed=true` 로 전환한다(IntersectionObserver, once).
 * 반환한 ref 를 대상에 달고, `revealed` 가 true 면 fx.css 의 `is-revealed` 클래스를 붙이세요:
 *   const { ref, revealed } = useReveal();
 *   <section ref={ref} className={`reveal ${revealed ? "is-revealed" : ""}`}>…
 *
 * SSR/IO 미지원/비브라우저면 즉시 revealed=true 로 폴백(콘텐츠가 항상 보임 — CLS 0).
 * fx.css 가 reduced-motion 에서 from-state 를 무효화하므로 모션만 빠지고 가시성은 유지됩니다.
 */
export function useReveal<T extends Element = HTMLElement>(
  options: UseRevealOptions = {},
): { ref: (node: T | null) => void; revealed: boolean } {
  const { threshold = 0.01, rootMargin = "200px 0px 200px 0px", enabled = true } = options;
  const [revealed, setRevealed] = useState(false);
  const nodeRef = useRef<T | null>(null);

  // 콜백 ref — 노드 부착 시점에 IO 를 건다(once). 부착 해제 시 정리.
  const ref = useCallback(
    (node: T | null) => {
      nodeRef.current = node;
      if (!node || !enabled) return;
      // IO 미지원·비브라우저면 즉시 보임 처리.
      if (typeof IntersectionObserver === "undefined") {
        setRevealed(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setRevealed(true);
            observer.disconnect(); // once
          }
        },
        { threshold, rootMargin },
      );
      observer.observe(node);
    },
    [enabled, threshold, rootMargin],
  );

  // enabled=false 면(또는 비활성→되면) 즉시 보임 처리.
  useEffect(() => {
    if (!enabled) setRevealed(true);
  }, [enabled]);

  return { ref, revealed };
}
