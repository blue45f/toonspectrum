import { useEffect, useState } from "react";

const JUMP_NAV_ROOT_MARGIN = "-38% 0px -55% 0px";

/** 점프 내비 활성 섹션 추적. data-active-section과 함께 CSS로 활성 링크를 표시한다. */
export function useCinematicJumpNavActive(sectionIds: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash.replace(/^#/u, "");
    return sectionIds.includes(hash) ? hash : null;
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: JUMP_NAV_ROOT_MARGIN },
    );
    const targets = sectionIds
      .map((sectionId) => document.getElementById(sectionId))
      .filter((element): element is HTMLElement => element !== null);
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [sectionIds]);

  return active;
}
