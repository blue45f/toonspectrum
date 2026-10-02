import { useEffect, useState } from "react";

import { useReducedMotionPreference } from "@/shared/ambient/useAmbientExperience";

import { StudioPageIntroMotif } from "./StudioPageIntroMotif";
import "./studio-page-intro.css";

export type StudioPageIntroMotifKind = "pen" | "spark" | "cube" | "pose" | "leaf" | "cards";

/**
 * 담당 페이지 진입 시 1초 내외로 재생되는 가벼운 인트로 장식.
 *
 * - 풀스크린이 아니라 제목 옆 작은 모티프(120×40)가 그려지듯 등장했다가 사라진다.
 * - 클릭/ESC로 즉시 건너뛸 수 있고, `prefers-reduced-motion`이면 렌더링하지 않는다.
 * - 라이트/다크는 `currentColor`로 테마를 그대로 따른다.
 * - 장식용이므로 스크린리더에서는 숨긴다.
 */
export function StudioPageIntro({
  motif,
  className,
  skipLabel = "인트로 건너뛰기",
}: {
  readonly motif: StudioPageIntroMotifKind;
  readonly className?: string;
  readonly skipLabel?: string;
}) {
  const reduceMotion = useReducedMotionPreference();
  const [leaving, setLeaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    // 그리기(0.75s) → 잠깐 유지 → 페이드아웃 후 부드럽게 접기 (레이아웃 점프 방지)
    const fadeTimer = window.setTimeout(() => setLeaving(true), 950);
    const collapseTimer = window.setTimeout(() => setCollapsed(true), 1300);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLeaving(true);
        setCollapsed(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(collapseTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [reduceMotion]);

  if (reduceMotion) return null;

  const skip = () => {
    setLeaving(true);
    setCollapsed(true);
  };

  return (
    <span
      className={[
        "studio-page-intro",
        leaving ? "studio-page-intro--leaving" : "",
        collapsed ? "studio-page-intro--collapsed" : "",
        className ?? "",
      ].join(" ").trim()}
      data-motif={motif}
      role="presentation"
      aria-hidden="true"
      title={skipLabel}
      onClick={skip}
    >
      <StudioPageIntroMotif kind={motif} />
    </span>
  );
}
