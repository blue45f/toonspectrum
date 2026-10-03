// 정밀 3D 모델링 첫 화면의 "예시 결과" 그림. 실제 렌더 캡처가 아니라 흐름(3D 장면 → 컷 선화)을
// 보여 주는 코드 그림이라 화면에서 반드시 "예시"로 표시한다. 색은 테마 토큰만 쓴다.
import { useId } from "react";

const LINE = "var(--color-line-strong)";
const PANEL = "var(--color-panel)";
const CARD = "var(--color-card)";
const ACCENT = "var(--color-accent)";
const ACCENT_SOFT = "var(--color-accent-soft)";
const CYAN = "var(--color-accent-2, var(--color-accent))";
const FG = "var(--color-fg)";
const FG_3 = "var(--color-fg-3)";
const CANVAS = "var(--color-canvas)";

/** 등각 교실: 바닥·두 벽·칠판·창문·책상. 좌표는 손으로 맞춘 등각 격자(2:1)다. */
function IsometricRoom() {
  return (
    <g strokeLinejoin="round">
      <polygon points="30,127 92,96 154,127 92,158" fill={CARD} stroke={LINE} strokeWidth="1.2" />
      <polygon points="30,127 92,96 92,40 30,71" fill={PANEL} stroke={LINE} strokeWidth="1.2" />
      <polygon points="92,96 154,127 154,71 92,40" fill={PANEL} stroke={LINE} strokeWidth="1.2" />
      {/* 칠판 */}
      <polygon points="42.4,100.8 76.5,83.8 76.5,61.8 42.4,78.8" fill={ACCENT_SOFT} stroke={ACCENT} strokeWidth="1.2" />
      {/* 창문 + 창살 */}
      <polygon points="110.6,83.3 138.5,97.3 138.5,75.3 110.6,61.3" fill={CANVAS} stroke={CYAN} strokeWidth="1.2" />
      <path d="M124.6 90.3 V68.3" stroke={CYAN} strokeWidth="1" />
      {/* 책상 */}
      <polygon points="82,121 98,113 114,121 98,129" fill={ACCENT} opacity="0.85" />
      <polygon points="82,121 98,129 98,139 82,131" fill={ACCENT} opacity="0.55" />
      <polygon points="98,129 114,121 114,131 98,139" fill={ACCENT} opacity="0.4" />
      {/* 카메라와 시야 */}
      <path d="M50 170 L84 120 M50 170 L118 140" stroke={FG_3} strokeWidth="1" strokeDasharray="3 3" />
      <rect x="38" y="164" width="16" height="11" rx="2.5" fill={FG} />
      <circle cx="46" cy="169.5" r="3" fill={CANVAS} />
    </g>
  );
}

/** 같은 교실을 카메라 컷에서 본 1점 투시 선화. */
function PanelLineArt() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <rect x="210" y="22" width="140" height="156" rx="6" fill={FG} opacity="0.94" />
      <g stroke={CANVAS} strokeWidth="1.4" fill="none">
        <rect x="248" y="62" width="64" height="50" />
        <path d="M210 22 L248 62 M350 22 L312 62 M210 178 L248 112 M350 178 L312 112" />
        <rect x="258" y="72" width="44" height="24" />
        <polygon points="323.4,70.5 340.5,64.4 340.5,109.7 323.4,99.1" />
        <path d="M332 67.4 V104.4" />
        <polygon points="238,146 298,146 306,158 230,158" />
        <path d="M230 158 V166 H306 V158 M238 166 V176 M298 166 V176" />
      </g>
      <rect x="210" y="22" width="140" height="156" rx="6" fill="none" stroke={ACCENT} strokeWidth="2" />
    </g>
  );
}

export interface StudioHybridDccExampleArtProps {
  /** 보조 기술이 읽는 그림 설명. 화면 언어에 맞춘 문장을 넘긴다. */
  readonly title: string;
  readonly className?: string;
}

export function StudioHybridDccExampleArt({ title, className }: StudioHybridDccExampleArtProps) {
  const titleId = useId();
  return (
    <svg
      viewBox="0 0 360 200"
      className={className}
      role="img"
      aria-labelledby={titleId}
      data-studio-hybrid-dcc-example-art="true"
    >
      <title id={titleId}>{title}</title>
      <rect x="0" y="0" width="360" height="200" rx="14" fill={CANVAS} />
      <IsometricRoom />
      <g stroke={ACCENT} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M172 100 H198" />
        <path d="M191 93 L198 100 L191 107" />
      </g>
      <PanelLineArt />
    </svg>
  );
}
