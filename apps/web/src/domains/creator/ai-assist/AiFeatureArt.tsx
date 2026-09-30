import type { ReactNode } from "react";

import type { AiFeatureId } from "./AiAssistDock";

/**
 * 기능별 SVG 일러스트 — 카드 상단의 "보는 재미".
 * 텍스트 설명 대신 시각으로 기능을 전달한다.
 * 모든 애니메이션은 CSS로 제어하며 reduced-motion에서 정지.
 */

function ColorArt() {
  return (
    <svg viewBox="0 0 200 120" className="ai-art" aria-hidden="true">
      <defs>
        <linearGradient id="ai-art-color-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="100%" stopColor="#ffa94d" />
        </linearGradient>
        <clipPath id="ai-art-face-clip">
          <circle cx="100" cy="58" r="31" />
        </clipPath>
      </defs>
      {/* 선화 얼굴 */}
      <circle cx="100" cy="58" r="34" fill="none" stroke="#1a1a2e" strokeWidth="4" />
      <circle cx="88" cy="52" r="4" fill="#1a1a2e" />
      <circle cx="112" cy="52" r="4" fill="#1a1a2e" />
      <path d="M88 70 Q100 78 112 70" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" />
      {/* 채워지는 색 — 왼쪽에서 차오르는 애니메이션 */}
      <g clipPath="url(#ai-art-face-clip)">
        <rect x="69" y="27" width="62" height="62" fill="url(#ai-art-color-fill)" className="ai-art__fill-wipe" />
        {/* 물감 방울 */}
        <circle cx="140" cy="30" r="7" fill="#7c5cff" className="ai-art__blob ai-art__blob--1" />
        <circle cx="156" cy="44" r="5" fill="#00d4ff" className="ai-art__blob ai-art__blob--2" />
        <circle cx="52" cy="34" r="6" fill="#ff5d8f" className="ai-art__blob ai-art__blob--3" />
      </g>
      {/* 매직완드 */}
      <g className="ai-art__wand" transform="translate(150 78)">
        <rect x="-3" y="-22" width="6" height="30" rx="3" fill="#7c5cff" transform="rotate(24)" />
        <path d="M0 0l-8 -8M0 0l8 -8M0 0l0 -11" stroke="#ffd43b" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="-8" cy="-8" r="2" fill="#ffd43b" className="ai-art__spark" />
        <circle cx="8" cy="-8" r="2" fill="#ffd43b" className="ai-art__spark ai-art__spark--d2" />
        <circle cx="0" cy="-11" r="2" fill="#ffd43b" className="ai-art__spark ai-art__spark--d3" />
      </g>
    </svg>
  );
}

function StrokeArt() {
  return (
    <svg viewBox="0 0 200 120" className="ai-art" aria-hidden="true">
      {/* 떨리는 원본 선 (점선, 흐릿) */}
      <path
        d="M20 80 C 50 20, 60 100, 90 55 S 140 90, 180 40"
        fill="none"
        stroke="#adb5bd"
        strokeWidth="3"
        strokeDasharray="6 4"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* 정리된 선 — 그려지는 애니메이션 */}
      <path
        d="M20 80 C 50 20, 60 100, 90 55 S 140 90, 180 40"
        fill="none"
        stroke="#7c5cff"
        strokeWidth="4.5"
        strokeLinecap="round"
        className="ai-art__draw-line"
      />
      {/* 손떨림 보정 파티클 */}
      <circle cx="90" cy="55" r="10" fill="none" stroke="#00d4ff" strokeWidth="2" className="ai-art__ping" />
    </svg>
  );
}

function PerspectiveArt() {
  const rays: ReactNode[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const angle = -70 + i * 17.5;
    const rad = (angle * Math.PI) / 180;
    const x2 = 100 + Math.cos(rad) * 120;
    const y2 = 60 + Math.sin(rad) * 120;
    rays.push(
      <line
        key={i}
        x1="100"
        y1="60"
        x2={x2}
        y2={y2}
        stroke="#7c5cff"
        strokeWidth="1.6"
        opacity="0.55"
        className="ai-art__ray"
        style={{ animationDelay: `${i * 0.12}s` }}
      />,
    );
  }
  return (
    <svg viewBox="0 0 200 120" className="ai-art" aria-hidden="true">
      {rays}
      <line x1="0" y1="60" x2="200" y2="60" stroke="#1a1a2e" strokeWidth="2.5" />
      {/* 건물 박스 */}
      <g className="ai-art__box">
        <polygon points="60,60 100,60 100,95 60,95" fill="#ffd43b" opacity="0.85" stroke="#1a1a2e" strokeWidth="2.5" />
        <polygon points="100,60 140,60 140,95 100,95" fill="#ffa94d" opacity="0.85" stroke="#1a1a2e" strokeWidth="2.5" />
        <polygon points="60,60 100,60 100,38 60,38" fill="#ffe066" stroke="#1a1a2e" strokeWidth="2.5" />
        <polygon points="100,60 140,60 100,38" fill="#ff922b" stroke="#1a1a2e" strokeWidth="2.5" />
      </g>
      <circle cx="100" cy="60" r="5" fill="#ff5d8f" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function BalloonArt() {
  return (
    <svg viewBox="0 0 200 120" className="ai-art" aria-hidden="true">
      {/* 말풍선 */}
      <g className="ai-art__balloon-pop">
        <ellipse cx="100" cy="48" rx="58" ry="34" fill="#fff" stroke="#1a1a2e" strokeWidth="4" />
        <path d="M84 78 L74 104 L100 80" fill="#fff" stroke="#1a1a2e" strokeWidth="4" strokeLinejoin="round" />
        {/* 대사 텍스트 행 — 타이핑 애니메이션 */}
        <rect x="62" y="38" width="56" height="8" rx="4" fill="#7c5cff" className="ai-art__type ai-art__type--1" />
        <rect x="72" y="52" width="56" height="8" rx="4" fill="#adb5bd" className="ai-art__type ai-art__type--2" />
      </g>
      {/* 화자 */}
      <circle cx="74" cy="104" r="10" fill="none" stroke="#1a1a2e" strokeWidth="3.5" />
      <circle cx="70" cy="102" r="1.8" fill="#1a1a2e" />
      <circle cx="78" cy="102" r="1.8" fill="#1a1a2e" />
    </svg>
  );
}

const ART: Record<AiFeatureId, () => ReactNode> = {
  color: ColorArt,
  stroke: StrokeArt,
  perspective: PerspectiveArt,
  balloon: BalloonArt,
};

export function AiFeatureArt({ feature }: { readonly feature: AiFeatureId }) {
  const Art = ART[feature];
  return (
    <div className="ai-art__frame" aria-hidden="true">
      <Art />
    </div>
  );
}

/**
 * 채색 스튜디오 빈 상태용 대형 일러스트 —
 * "선화에 색을 입히는" 장면을 한눈에 보여준다.
 */
export function AiEmptyStateArt() {
  return (
    <svg viewBox="0 0 180 130" className="ai-studio__empty-art" aria-hidden="true">
      <defs>
        <linearGradient id="ai-empty-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
        <clipPath id="ai-empty-clip">
          <circle cx="90" cy="60" r="36" />
        </clipPath>
      </defs>
      <g className="ai-empty__art-bob">
        <circle cx="90" cy="60" r="40" fill="none" stroke="#1a1a2e" strokeWidth="4" />
        <g clipPath="url(#ai-empty-clip)">
          <rect x="54" y="24" width="72" height="72" fill="url(#ai-empty-fill)" className="ai-art__fill-wipe" />
        </g>
        <circle cx="76" cy="54" r="4.5" fill="#1a1a2e" />
        <circle cx="104" cy="54" r="4.5" fill="#1a1a2e" />
        <path d="M76 74 Q90 84 104 74" fill="none" stroke="#1a1a2e" strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* 터치 포인트 */}
      <circle cx="126" cy="34" r="9" fill="none" stroke="#ff5d8f" strokeWidth="3" className="ai-empty__art-spark" />
      <circle cx="126" cy="34" r="3.5" fill="#ff5d8f" />
      <circle cx="48" cy="100" r="5" fill="#ffd43b" className="ai-empty__art-spark ai-empty__art-spark--d2" />
      <circle cx="140" cy="98" r="4" fill="#00d4ff" className="ai-empty__art-spark ai-empty__art-spark--d3" />
    </svg>
  );
}
