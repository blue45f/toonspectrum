import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { prefersReducedMotion } from "./ambient-engine";

export interface AmbientRevealProps {
  children: ReactNode;
  className?: string;
  /** 형제 요소 간 스태거 딜레이 (ms). */
  delay?: number;
  /** 부드러운 페이드만 (위로 솟구침 없음). */
  soft?: boolean;
  as?: "div" | "section" | "article" | "li";
}

/**
 * 스크롤 진입 리빌 래퍼.
 *
 * @toonstudio/core/fx 의 .reveal/.reveal-soft 클래스를 사용한다.
 * - IntersectionObserver로 .is-revealed 부여
 * - IO 미지원·reduced-motion이어도 콘텐츠는 그대로 보임 (CLS 0)
 */
export function AmbientReveal({
  children,
  className,
  delay = 0,
  soft = false,
  as = "div",
}: AmbientRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion()) {
      element.classList.add("is-revealed");
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      element.classList.add("is-revealed");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const Tag = as as "div";
  const style = delay > 0 ? ({ "--reveal-delay": delay } as CSSProperties) : undefined;

  return (
    <Tag
      ref={ref}
      className={cn(soft ? "reveal-soft" : "reveal", className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
