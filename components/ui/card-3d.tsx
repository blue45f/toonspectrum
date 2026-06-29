import React, { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface Card3DProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** 최대 3D 기울기 각도 (기본값: 10도) */
  maxTilt?: number;
  /** 광택/반사 glare 이펙트 켜기 (기본값: true) */
  glare?: boolean;
  /** 호버 시 확대 비율 (기본값: 1.025) */
  scale?: number;
  /** 추가 클래스 */
  className?: string;
}

/**
 * 3D 입체 카드 래퍼 컴포넌트.
 * 마우스 위치를 실시간 추적하여 rotateX, rotateY, 입체 광택 glare 및 preserve-3d 레이어링을 제공합니다.
 */
export function Card3D({
  children,
  maxTilt = 10,
  glare = true,
  scale = 1.025,
  className,
  style,
  ...props
}: Card3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 터치 포인터이거나 세컨더리 클릭 시엔 3D 틸트를 과도하게 주지 않음
    if (e.pointerType === "touch") return;

    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -maxTilt;
    const rotateY = ((x - centerX) / centerX) * maxTilt;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    card.style.setProperty("--rx", `${rotateX.toFixed(2)}deg`);
    card.style.setProperty("--ry", `${rotateY.toFixed(2)}deg`);
    card.style.setProperty("--scale", `${scale}`);
    card.style.setProperty("--glare-x", `${glareX.toFixed(1)}%`);
    card.style.setProperty("--glare-y", `${glareY.toFixed(1)}%`);
    card.style.setProperty("--glare-opacity", "1");
  };

  const handlePointerEnter = () => {
    setIsHovered(true);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--scale", "1");
    card.style.setProperty("--glare-opacity", "0");
  };

  return (
    <div
      ref={cardRef}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        "group/card3d relative transform-gpu preserve-3d perspective-1000",
        className,
      )}
      style={{
        transform: "perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) scale3d(var(--scale, 1), var(--scale, 1), 1)",
        transition: isHovered
          ? "transform 0.12s ease-out, box-shadow 0.2s ease-out"
          : "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease-out",
        ...style,
      }}
      {...props}
    >
      {children}
      {glare && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 ease-out z-30 overflow-hidden"
          style={{
            background: "radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), oklch(1 0 0 / 0.18) 0%, oklch(1 0 0 / 0) 65%)",
            opacity: "var(--glare-opacity, 0)",
          }}
        />
      )}
    </div>
  );
}
