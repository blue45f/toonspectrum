import { useCallback, useEffect, useState } from "react";

import { cn } from "@/shared/lib/utils";

import "./page-intro.css";

export type PageIntroVariant = "unfold" | "chapter" | "restrained";

export interface PageIntroProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * 인트로 연출 종류.
   * - "unfold": 온보딩 단계가 펼쳐지듯
   * - "chapter": 학습 챕터가 펼쳐지듯
   * - "restrained": 로그인/설정용 절제된 페이드
   */
  variant?: PageIntroVariant;
}

/**
 * PageIntro — 페이지 진입 인트로 모션 래퍼.
 *
 * 마운트 시 직계 자식들이 variant 에 맞는 연출로 ~1초에 걸쳐 등장한다.
 * 클릭 또는 ESC 로 스킵할 수 있고, prefers-reduced-motion 에서는
 * 애니메이션 없이 콘텐츠를 즉시 보여준다. 풀스크린 오버레이가 아니라
 * 페이지 콘텐츠 자체의 등장 연출이라 로딩 스켈레톤과 자연스럽게 이어진다.
 */
export function PageIntro({ children, variant = "restrained", className, ...rest }: PageIntroProps) {
  const [skipped, setSkipped] = useState(false);

  const skip = useCallback(() => setSkipped(true), []);

  useEffect(() => {
    if (skipped) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skipped, skip]);

  return (
    <div
      className={cn("page-intro", className)}
      data-variant={variant}
      data-skipped={skipped}
      onClick={skip}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") skip();
      }}
      role="presentation"
      {...rest}
    >
      {children}
    </div>
  );
}

export default PageIntro;
