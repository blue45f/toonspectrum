import { useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export interface SpectacleTiltCardProps {
  children: ReactNode;
  className?: string;
  /** 최대 기울기 (도, 기본 10). */
  maxTilt?: number;
}

/**
 * 3D 틸트 카드.
 *
 * - full 수준 + fine 포인터(마우스)에서만 동작
 * - 터치·reduced-motion·light/none에서는 일반 카드로 폴백
 * - transform만 사용해 GPU 가속
 */
export function SpectacleTiltCard({ children, className, maxTilt = 10 }: SpectacleTiltCardProps) {
  const { heavy } = useSpectacle();
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!element || !heavy) return;
    if (event.pointerType !== "mouse") return;
    const rect = element.getBoundingClientRect();
    // 레이아웃 전(0 크기)에는 Infinity 방지를 위해 스킵
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const rotateX = (-py * maxTilt).toFixed(2);
    const rotateY = (px * maxTilt).toFixed(2);
    element.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    element.style.setProperty("--tilt-glare-x", `${(px + 0.5) * 100}%`);
    element.style.setProperty("--tilt-glare-y", `${(py + 0.5) * 100}%`);
  };

  const handleLeave = () => {
    const element = ref.current;
    if (!element) return;
    element.style.transform = "";
  };

  if (!heavy) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={cn("spectacle-tilt", "relative", className)}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ "--tilt-glare-x": "50%", "--tilt-glare-y": "50%" } as CSSProperties}
    >
      <div className="spectacle-tilt-glare" aria-hidden="true" />
      <div className="spectacle-tilt-inner relative">{children}</div>
    </div>
  );
}
