import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

export interface SpectacleGlowButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** 글로우 색상 (기본 인디고→핑크 그라데이션). */
  glowColor?: string;
  ariaLabel?: string;
}

/**
 * 호버 글로우 버튼.
 *
 * - 마우스 위치를 따라다니는 방사형 글로우 (CSS 변수, GPU 합성)
 * - motion 수준에서만 추적 글로우, 그 외에는 정적 스타일
 * - 키보드 포커스(:focus-visible)에서도 글로우 표시 — 접근성 유지
 * - 터치 기기에서는 탭 하이라이트만
 */
export function SpectacleGlowButton({
  children,
  className,
  onClick,
  type = "button",
  disabled = false,
  glowColor = "rgba(129, 140, 248, 0.55)",
  ariaLabel,
}: SpectacleGlowButtonProps) {
  const { motion } = useSpectacle();
  const ref = useRef<HTMLButtonElement | null>(null);

  const trackPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const element = ref.current;
    if (!element || !motion || event.pointerType !== "mouse") return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty("--spectacle-glow-x", `${x.toFixed(1)}%`);
    element.style.setProperty("--spectacle-glow-y", `${y.toFixed(1)}%`);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      onPointerMove={trackPointer}
      aria-label={ariaLabel}
      style={{ "--spectacle-glow-color": glowColor } as CSSProperties}
      className={cn(
        "spectacle-glow-btn",
        motion && "spectacle-motion",
        className,
      )}
    >
      <span className="spectacle-glow-btn-glow" aria-hidden="true" />
      <span className="spectacle-glow-btn-content">{children}</span>
    </button>
  );
}
