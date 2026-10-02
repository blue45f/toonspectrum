import { useEffect, useRef, useState } from "react";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import { useMediaQuery } from "@/shared/hooks/use-media-query";

import { ToonStudioWordmark } from "./toonstudio-brand";
import { markEntryIntroSeen, shouldPlayEntryIntro } from "./entry-intro-session";
import styles from "./EntryIntro.module.css";

/** 본 연출 유지 시간(ms). 페이드와 합쳐 총 1.8초를 넘지 않는다. */
export const ENTRY_INTRO_HOLD_MS = 1150;
/** 자연 종료 시 페이드 시간(ms). */
export const ENTRY_INTRO_FADE_MS = 450;
/** 사용자 입력으로 건너뛸 때의 짧은 페이드 시간(ms). */
export const ENTRY_INTRO_SKIP_FADE_MS = 200;
/** reduced-motion 사용자에게 정적 카드를 보여주는 시간(ms). 페이드 없이 끝난다. */
export const ENTRY_INTRO_REDUCED_HOLD_MS = 700;

export interface EntryIntroProps {
  /**
   * 세션당 1회만 노출(sessionStorage). 기본 true.
   * false면 마운트마다 노출한다(스토리·테스트용).
   */
  once?: boolean;
  /** 인트로가 완전히 사라진 뒤 호출된다. */
  onDone?: () => void;
}

type Phase = "show" | "fade" | "gone";

/**
 * EntryIntro — 사이트 진입 브랜드 인트로의 단일 시스템.
 *
 * 과거에는 진입 스플래시가 세 컴포넌트로 흩어져 세션마다 무작위로 하나가
 * 골라졌고, 구 브랜드 표기·2.8초·스킵 불가에 로딩 폴백 화면까지 겹쳤다.
 * 이 컴포넌트로 통합한다:
 *
 * - 연출은 하나만: 홈 히어로와 같은 아트(hero-main) 위에 현행 워드마크와
 *   태그라인 "Stories Come to Life". 사라지면 같은 아트의 홈이 이미 완성돼 있다.
 * - 본문은 아래에서 먼저 그려지고, 오버레이는 pointer-events:none이라 입력을
 *   막지 않는다. 클릭·키 입력 즉시 스킵된다.
 * - 총 길이 1.6초(유지 1150 + 페이드 450). reduced-motion에서는 애니메이션 없는
 *   정적 카드를 700ms만 보여준다.
 * - 소리는 내지 않는다. BGM은 기존 배경음악 시스템 소관이다.
 */
export function EntryIntro({ once, onDone }: EntryIntroProps = {}) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [shouldPlay] = useState(() => shouldPlayEntryIntro(once));
  const [phase, setPhase] = useState<Phase>("show");
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!shouldPlay || phase !== "show") return;
    // 표시가 결정된 시점에 기록한다 — 인트로 도중 새로고침해도 다시 뜨지 않는다.
    if (once !== false) markEntryIntroSeen();

    if (reducedMotion) {
      const removeTimer = setTimeout(() => {
        setPhase("gone");
        onDoneRef.current?.();
      }, ENTRY_INTRO_REDUCED_HOLD_MS);
      return () => clearTimeout(removeTimer);
    }

    const fadeTimer = setTimeout(() => setPhase("fade"), ENTRY_INTRO_HOLD_MS);
    return () => clearTimeout(fadeTimer);
  }, [shouldPlay, once, reducedMotion, phase]);

  useEffect(() => {
    if (!shouldPlay || phase !== "fade") return;
    const removeTimer = setTimeout(
      () => {
        setPhase("gone");
        onDoneRef.current?.();
      },
      skipped ? ENTRY_INTRO_SKIP_FADE_MS : ENTRY_INTRO_FADE_MS,
    );
    return () => clearTimeout(removeTimer);
  }, [shouldPlay, phase, skipped]);

  // 클릭·키 입력 즉시 스킵. 오버레이가 pointer-events:none이라 본문 입력은
  // 인트로 표시 중에도 그대로 동작하고, 이 리스너는 연출만 앞당긴다.
  useEffect(() => {
    if (!shouldPlay || phase !== "show") return;
    const skip = () => {
      if (reducedMotion) {
        setPhase("gone");
        onDoneRef.current?.();
        return;
      }
      setSkipped(true);
      setPhase("fade");
    };
    window.addEventListener("pointerdown", skip, { capture: true });
    window.addEventListener("keydown", skip, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", skip, { capture: true });
      window.removeEventListener("keydown", skip, { capture: true });
    };
  }, [shouldPlay, phase, reducedMotion]);

  if (!shouldPlay || phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className={styles.root}
      data-phase={phase}
      data-skipped={skipped || undefined}
    >
      <img
        src={resolveAssetUrl("/images/hero-main.webp")}
        alt=""
        className={styles.art}
        decoding="async"
      />
      <div className={styles.scrim} />
      <div className={styles.content}>
        <div className={styles.brandRow}>
          {/* 브랜드 마크 컴포넌트는 size-8 고정 계약이라, 인트로의 큰 마크는 같은
              브랜드 에셋을 직접 그린다. 워드마크는 공용 컴포넌트를 그대로 쓴다. */}
          <img
            src={resolveAssetUrl("/brand/spectrum-ribbon-v2/icon-192.png")}
            alt=""
            className={styles.mark}
            decoding="async"
          />
          <span className={styles.wordmark}>
            <ToonStudioWordmark />
          </span>
        </div>
        <div className={styles.line} />
        <p className={styles.tagline} lang="en">
          Stories Come to Life
        </p>
      </div>
    </div>
  );
}

export default EntryIntro;
