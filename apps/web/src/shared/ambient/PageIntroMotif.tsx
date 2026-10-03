import { useEffect, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { resolvePageIntroMotif, type PageIntroMotifKind } from "./page-intro-motif";
import { useAmbientPreferences, useReducedMotionPreference } from "./useAmbientExperience";

import "./ambient-effects.css";

export interface PageIntroMotifProps {
  pathname: string;
}

/** 모티프별 장식 요소 개수. */
const MOTIF_PARTS: Record<PageIntroMotifKind, number> = {
  pipeline: 5,
  frames: 4,
  gather: 5,
  workspace: 6,
  bubbles: 3,
};

/**
 * 페이지 진입 인트로 모티프 (프로덕션·협업 담당 영역 전용).
 *
 * - 풀스크린이 아니라 화면 중앙 위쪽에 뜨는 작은 칩 하나다.
 * - 클릭 또는 ESC로 건너뛸 수 있고, 1.1초 뒤 자동으로 사라진다.
 * - 움직임 줄이기(prefers-reduced-motion)나 앰비언트 끔에서는 렌더링하지 않는다.
 * - BGM/내레이션과는 겹치지 않는다 (이쪽은 소리 관련 UI를 추가하지 않음).
 */
export function PageIntroMotif({ pathname }: PageIntroMotifProps) {
  const motif = resolvePageIntroMotif(pathname);
  const { intensity } = useAmbientPreferences();
  const reducedMotion = useReducedMotionPreference();
  const lang = useI18n((state) => state.lang);
  const [dismissed, setDismissed] = useState(false);

  // 경로가 바뀌면 새 진입으로 보고 다시 보여 준다.
  useEffect(() => {
    setDismissed(false);
  }, [pathname, motif]);

  useEffect(() => {
    if (!motif || dismissed || reducedMotion || intensity === "off") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => setDismissed(true), 1100);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [motif, dismissed, reducedMotion, intensity]);

  if (!motif || dismissed || reducedMotion || intensity === "off") return null;

  const skipLabel = lang.startsWith("ko") ? "인트로 건너뛰기" : "Skip intro";
  const parts = Array.from({ length: MOTIF_PARTS[motif] }, (_, index) => index);

  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => setDismissed(true)}
      aria-label={skipLabel}
      title={skipLabel}
      data-page-intro-motif={motif}
      data-route-chrome=""
      className={cn("route-intro-chip", `route-intro-chip--${motif}`)}
    >
      <span aria-hidden="true" className={cn("route-intro-chip__stage", `route-intro-chip__stage--${motif}`)}>
        {parts.map((index) => (
          <i key={index} style={{ ["--i" as string]: index }} />
        ))}
      </span>
    </button>
  );
}
