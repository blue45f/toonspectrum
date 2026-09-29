import { cn } from "@/shared/lib/utils";

import "./spectacle-effects.css";

export type SpectacleArtKind = "celebration" | "growth" | "magic";

export interface SpectacleArtProps {
  kind: SpectacleArtKind;
  className?: string;
  /** 장식용이므로 기본 aria-hidden. */
  title?: string;
}

/**
 * 스펙터클 전용 SVG 일러스트.
 *
 * - 빈 상태 일러스트와 같은 시각 언어 (단순 도형 + currentColor)
 * - 둥실 떠다니기/반짝임 애니메이션은 스펙터클 모션 시스템과 연동
 * - 기능 소개 카드·섹션 헤더의 "보는 재미"용
 */
export function SpectacleArt({ kind, className, title }: SpectacleArtProps) {
  return (
    <svg
      viewBox="0 0 200 140"
      className={cn("h-auto w-full", className)}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {kind === "celebration" && <CelebrationArt />}
      {kind === "growth" && <GrowthArt />}
      {kind === "magic" && <MagicArt />}
    </svg>
  );
}

function CelebrationArt() {
  return (
    <g>
      <defs>
        <radialGradient id="spectacle-art-burst" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="spectacle-empty-float">
        <circle cx="100" cy="62" r="46" fill="url(#spectacle-art-burst)" />
        {/* 폭죽 방사선 */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const x1 = 100 + Math.cos(angle) * 18;
          const y1 = 62 + Math.sin(angle) * 18;
          const x2 = 100 + Math.cos(angle) * 38;
          const y2 = 62 + Math.sin(angle) * 38;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.65"
            />
          );
        })}
        <circle cx="100" cy="62" r="7" fill="currentColor" opacity="0.8" />
      </g>
      {/* 떨어지는 컨페티 조각 */}
      <g className="spectacle-empty-float-delayed" fill="currentColor">
        <rect x="52" y="100" width="10" height="6" rx="1.5" opacity="0.55" transform="rotate(24 57 103)" />
        <rect x="138" y="104" width="10" height="6" rx="1.5" opacity="0.45" transform="rotate(-18 143 107)" />
        <circle cx="72" cy="116" r="3.5" opacity="0.5" />
        <circle cx="128" cy="120" r="3" opacity="0.4" />
      </g>
      <g className="spectacle-empty-twinkle">
        <path d="M160 22l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor" opacity="0.7" />
        <path d="M38 30l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="currentColor" opacity="0.6" />
      </g>
    </g>
  );
}

function GrowthArt() {
  const bars = [34, 58, 44, 78, 96];
  return (
    <g>
      <g className="spectacle-empty-float">
        {bars.map((h, i) => (
          <rect
            key={i}
            x={48 + i * 24}
            y={110 - h}
            width="14"
            height={h}
            rx="4"
            fill="currentColor"
            opacity={0.3 + (i / bars.length) * 0.5}
          />
        ))}
        {/* 상승 화살표 */}
        <path
          d="M44 84 L84 62 L104 70 L148 34"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        <path
          d="M132 32h18v18"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
      </g>
      <g className="spectacle-empty-twinkle">
        <path d="M162 92l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="currentColor" opacity="0.6" />
        <circle cx="36" cy="46" r="3.5" fill="currentColor" opacity="0.5" />
      </g>
    </g>
  );
}

function MagicArt() {
  return (
    <g>
      <g className="spectacle-empty-float">
        {/* 마법봉 */}
        <rect
          x="96"
          y="52"
          width="8"
          height="56"
          rx="4"
          fill="currentColor"
          opacity="0.55"
          transform="rotate(24 100 80)"
        />
        {/* 봉 끝 별 */}
        <path
          d="M122 30l4.5 11 11 4.5-11 4.5-4.5 11-4.5-11-11-4.5 11-4.5z"
          fill="currentColor"
          opacity="0.85"
          className="spectacle-empty-twinkle"
        />
      </g>
      {/* 흩어지는 반짝이 */}
      <g className="spectacle-empty-float-delayed" fill="currentColor">
        <path d="M60 44l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" opacity="0.6" />
        <path d="M152 74l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity="0.5" />
        <circle cx="70" cy="96" r="3" opacity="0.45" />
        <circle cx="146" cy="104" r="4" opacity="0.4" />
        <circle cx="104" cy="116" r="2.5" opacity="0.5" />
      </g>
      {/* 마법 궤적 */}
      <path
        d="M40 110 Q80 92 110 100 T170 84"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="1 7"
        strokeLinecap="round"
        opacity="0.5"
      />
    </g>
  );
}
