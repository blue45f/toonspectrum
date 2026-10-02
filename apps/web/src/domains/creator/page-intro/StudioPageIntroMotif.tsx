import type { StudioPageIntroMotifKind } from "./StudioPageIntro";

/**
 * 페이지 분위기에 맞춘 6종 인트로 모티프 (120×40, stroke 기반 그리기 애니메이션).
 * 색은 바깥의 `color`를 그대로 따른다(`currentColor`).
 */
export function StudioPageIntroMotif({ kind }: { readonly kind: StudioPageIntroMotifKind }) {
  return (
    <svg
      className="studio-page-intro__art"
      viewBox="0 0 120 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "pen" ? (
        <g>
          <path className="spi-draw" pathLength={100} d="M6 30 C 28 30, 38 10, 58 18 S 96 32, 112 12" />
          <circle className="spi-pop spi-pop--d1" cx="112" cy="12" r="3" fill="currentColor" stroke="none" />
        </g>
      ) : null}
      {kind === "spark" ? (
        <g>
          <path className="spi-draw" pathLength={100} d="M22 20 L 58 12" />
          <path className="spi-draw spi-draw--d1" pathLength={100} d="M58 12 L 98 24" />
          <path className="spi-draw spi-draw--d2" pathLength={100} d="M22 20 L 98 24" opacity={0.45} />
          <circle className="spi-pop" cx="22" cy="20" r="4" fill="currentColor" stroke="none" />
          <circle className="spi-pop spi-pop--d1" cx="58" cy="12" r="4" fill="currentColor" stroke="none" />
          <circle className="spi-pop spi-pop--d2" cx="98" cy="24" r="4" fill="currentColor" stroke="none" />
        </g>
      ) : null}
      {kind === "cube" ? (
        <g className="spi-tilt">
          <path className="spi-draw" pathLength={100} d="M60 5 L104 20 L60 35 L16 20 Z" />
          <path className="spi-draw spi-draw--d1" pathLength={100} d="M60 5 V 35 M16 20 H 104" opacity={0.55} />
        </g>
      ) : null}
      {kind === "pose" ? (
        <g>
          <circle className="spi-pop" cx="60" cy="9" r="5" />
          <path className="spi-draw" pathLength={100} d="M60 15 V 28" />
          <path className="spi-draw spi-draw--d1" pathLength={100} d="M60 19 L 42 13" />
          <path className="spi-draw spi-draw--d1" pathLength={100} d="M60 19 L 79 25" />
          <path className="spi-draw spi-draw--d2" pathLength={100} d="M60 28 L 46 38" />
          <path className="spi-draw spi-draw--d2" pathLength={100} d="M60 28 L 75 36" />
        </g>
      ) : null}
      {kind === "leaf" ? (
        <g>
          <path className="spi-draw" pathLength={100} d="M18 23 L 46 34 L 102 8" />
          <path className="spi-draw spi-draw--d1" pathLength={100} d="M78 30 C 88 30, 96 24, 98 14 C 88 16, 80 22, 78 30 Z" opacity={0.7} />
        </g>
      ) : null}
      {kind === "cards" ? (
        <g>
          <rect className="spi-rise" x="8" y="14" width="28" height="20" rx="4" />
          <rect className="spi-rise spi-rise--d1" x="46" y="8" width="28" height="26" rx="4" />
          <rect className="spi-rise spi-rise--d2" x="84" y="16" width="28" height="18" rx="4" />
        </g>
      ) : null}
    </svg>
  );
}
