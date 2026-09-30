import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export type SpectacleRevealDirection = "up" | "down" | "left" | "right" | "fade" | "zoom";

export interface SpectacleRevealProps {
  children: ReactNode;
  className?: string;
  /** 등장 방향 (기본 up). */
  direction?: SpectacleRevealDirection;
  /** 지연 ms — stagger 시퀀스용 (기본 0). */
  delay?: number;
  /** 자식이 여러 개일 때 자동 stagger 간격 ms (기본 0 = 끔). */
  stagger?: number;
  /** 한 번만 등장할지 (기본 true). */
  once?: boolean;
  as?: "div" | "section" | "li" | "span";
}

/**
 * 스크롤 리빌: 화면에 들어오면 등장하는 시퀀스 애니메이션.
 *
 * - IntersectionObserver로 한 번만 트리거 (once=false면 나갔다 들어올 때마다)
 * - motion 꺼져 있으면 즉시 표시 (애니메이션 없음)
 * - stagger로 자식들을 순차 등장시킬 수 있음
 */
export function SpectacleReveal({
  children,
  className,
  direction = "up",
  delay = 0,
  stagger = 0,
  once = true,
  as = "div",
}: SpectacleRevealProps) {
  const { motion } = useSpectacle();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !motion) return;
    if (typeof IntersectionObserver === "undefined") {
      element.dataset.spectacleVisible = "true";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.dataset.spectacleVisible = "true";
            if (once) observer.disconnect();
          } else if (!once) {
            delete element.dataset.spectacleVisible;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [motion, once]);

  if (!motion) {
    const Tag = as as "div";
    return <Tag className={className}>{children}</Tag>;
  }

  const Tag = as as "div";
  const style = {
    "--spectacle-reveal-delay": `${delay}ms`,
    "--spectacle-reveal-stagger": `${stagger}ms`,
  } as CSSProperties;

  return (
    <Tag
      ref={ref}
      style={style}
      className={cn(
        "spectacle-reveal",
        `spectacle-reveal-${direction}`,
        stagger > 0 && "spectacle-reveal-stagger",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
