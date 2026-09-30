import {
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cn } from "@/shared/lib/utils";

import { prefersReducedMotion } from "./ambient-engine";

import "./ambient-effects.css";

export interface MagneticGlowProps {
  children: ReactNode;
  className?: string;
  /** 마그네틱 끌림 강도 (0~1, 기본 0.25). */
  strength?: number;
  /** reduced-motion·터치에서는 비활성화. */
  disabled?: boolean;
}

/**
 * 마그네틱 호버 버튼 래퍼.
 *
 * - 마우스가 다가가면 버튼이 살짝 끌려오고 글로우가 마우스를 따라다님
 * - 터치 기기·reduced-motion에서는 효과 없음 (그냥 children 렌더)
 */
export function MagneticGlow({
  children,
  className,
  strength = 0.25,
  disabled = false,
}: MagneticGlowProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const inactive =
    disabled ||
    prefersReducedMotion() ||
    (typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches);

  const handleMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const element = ref.current;
      if (!element || inactive) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const dx = x - rect.width / 2;
        const dy = y - rect.height / 2;
        element.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
        element.style.setProperty("--magnetic-x", `${(x / rect.width) * 100}%`);
        element.style.setProperty("--magnetic-y", `${(y / rect.height) * 100}%`);
      });
    },
    [inactive, strength],
  );

  const handleLeave = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    element.style.transform = "";
  }, []);

  if (inactive) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={cn("ambient-magnetic", className)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ transition: "transform 0.18s ease-out" } as CSSProperties}
    >
      {children}
    </div>
  );
}
