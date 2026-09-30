import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";
import { backdropLayerClass } from "./spectacle-backdrop-layer";

import "./spectacle-effects.css";

export interface SpectacleBackdropProps {
  children: ReactNode;
  className?: string;
  /** 배경 변형 (여러 개 조합 가능). */
  variants?: readonly SpectacleBackdropVariant[];
  as?: "div" | "section";
}

/**
 * 섹션별 앰비언트 배경.
 *
 * - aurora: 움직이는 오로라 그라데이션 (다크모드에서 강화)
 * - beams: sweeping 빛줄기
 * - grid: 도트 그리드 (정적)
 * - noise: 필름 그레인 질감 (정적)
 * - full 수준에서만 애니메이션, 그 외에는 정적 배경
 */
export function SpectacleBackdrop({
  children,
  className,
  variants = ["aurora"],
  as = "div",
}: SpectacleBackdropProps) {
  const { level } = useSpectacle();
  const Tag = as as "div";

  return (
    <Tag
      className={cn(
        "spectacle-backdrop",
        level === "full" && "spectacle-full",
        level !== "none" && "spectacle-motion",
        className,
      )}
    >
      {level !== "none" &&
        variants.map((variant) => (
          <div
            key={variant}
            className={cn("spectacle-backdrop-layer", backdropLayerClass(variant))}
            aria-hidden="true"
          />
        ))}
      {children}
    </Tag>
  );
}
