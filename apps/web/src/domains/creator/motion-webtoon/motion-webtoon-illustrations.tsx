/**
 * 모션 웹툰 도메인 SVG 일러스트.
 *
 * 외부 이미지 없이 인라인 SVG로 그리는 시네마틱 스타일 일러스트.
 * 빈 상태·단계 안내·스플래시에 사용한다. 애니메이션은 CSS 클래스
 * (mw-illus-float / mw-sparkle / mw-ray)로 제어하며 reduced-motion에서 멈춘다.
 */

interface IllustrationProps {
  readonly className?: string;
}

/** 공통 4-point 반짝이. */
function Sparkle({
  x,
  y,
  scale = 1,
  delay = 0,
  color = "#fbbf24",
}: {
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly delay?: number;
  readonly color?: string;
}) {
  return (
    <path
      className="mw-sparkle"
      style={{ "--mw-sparkle-delay": `${delay}s` } as React.CSSProperties}
      d={`M ${x} ${y - 8 * scale} C ${x + 1.5 * scale} ${y - 2 * scale}, ${x + 6 * scale} ${y - 1.5 * scale}, ${x + 8 * scale} ${y} C ${x + 6 * scale} ${y + 1.5 * scale}, ${x + 1.5 * scale} ${y + 2 * scale}, ${x} ${y + 8 * scale} C ${x - 1.5 * scale} ${y + 2 * scale}, ${x - 6 * scale} ${y + 1.5 * scale}, ${x - 8 * scale} ${y} C ${x - 6 * scale} ${y - 1.5 * scale}, ${x - 1.5 * scale} ${y - 2 * scale}, ${x} ${y - 8 * scale} Z`}
      fill={color}
      opacity={0.9}
    />
  );
}

/** 1단계: 컷 올리기 — 쌓인 이미지 카드와 + 배지. */
export function StepCutIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="mw-stepcut-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="mw-stepcut-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#312e81" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      <g className="mw-illus-float">
        <rect x="52" y="38" width="96" height="76" rx="10" fill="url(#mw-stepcut-card)" opacity={0.55} transform="rotate(-8 100 76)" />
        <rect x="52" y="38" width="96" height="76" rx="10" fill="url(#mw-stepcut-card)" opacity={0.8} transform="rotate(6 100 76)" />
        <rect x="52" y="38" width="96" height="76" rx="10" fill="#1e1b4b" stroke="url(#mw-stepcut-bg)" strokeWidth="2.5" />
        <rect x="64" y="50" width="72" height="40" rx="6" fill="url(#mw-stepcut-bg)" opacity={0.35} />
        <circle cx="76" cy="62" r="6" fill="#fbbf24" opacity={0.85} />
        <path d="M64 90 L92 66 L108 80 L120 70 L136 90 Z" fill="url(#mw-stepcut-bg)" opacity={0.6} />
        <rect x="64" y="98" width="44" height="6" rx="3" fill="#a78bfa" opacity={0.5} />
        <g transform="translate(142 112)">
          <circle r="17" fill="#f472b6" />
          <circle r="17" fill="none" stroke="#fff" strokeWidth="2" opacity={0.35} />
          <path d="M0 -8 V8 M-8 0 H8" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>
      <Sparkle x={40} y={34} scale={0.9} />
      <Sparkle x={168} y={52} scale={0.7} delay={0.8} color="#f472b6" />
    </svg>
  );
}

/** 2단계: AI 자동 연출 — 마법 지팡이와 반짝이. */
export function StepDirectIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="mw-stepdirect-wand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <radialGradient id="mw-stepdirect-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="132" cy="48" r="34" fill="url(#mw-stepdirect-glow)" className="mw-ray" />
      <g className="mw-illus-float">
        <rect x="52" y="88" width="88" height="14" rx="7" fill="url(#mw-stepdirect-wand)" transform="rotate(-24 96 95)" />
        <g transform="translate(132 48)">
          <path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" fill="#fde68a" />
          <circle r="5" fill="#fff" opacity={0.9} />
        </g>
        {/* 지팡이 끝에서 퍼지는 궤적 */}
        <path d="M142 62 Q 158 78, 150 100" fill="none" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 8" opacity={0.7} className="mw-dash-flow" />
        <path d="M124 62 Q 112 80, 118 102" fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 8" opacity={0.7} className="mw-dash-flow" />
      </g>
      <Sparkle x={52} y={42} scale={1} />
      <Sparkle x={172} y={92} scale={0.8} delay={0.6} color="#a78bfa" />
      <Sparkle x={88} y={24} scale={0.6} delay={1.2} color="#f472b6" />
    </svg>
  );
}

/** 3단계: 미리보기·공유 — 재생 화면과 타임라인. */
export function StepPreviewIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="mw-steppreview-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#312e81" />
          <stop offset="1" stopColor="#171233" />
        </linearGradient>
        <linearGradient id="mw-steppreview-bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <g className="mw-illus-float">
        <rect x="40" y="26" width="120" height="76" rx="12" fill="url(#mw-steppreview-screen)" stroke="#4c4a8a" strokeWidth="2" />
        <rect x="40" y="26" width="120" height="20" rx="10" fill="#000" opacity={0.25} />
        <circle cx="100" cy="64" r="18" fill="#f472b6" />
        <circle cx="100" cy="64" r="18" fill="none" stroke="#fff" strokeWidth="2" opacity={0.4} className="mw-pulse-ring" />
        <path d="M95 55 L109 64 L95 73 Z" fill="#fff" />
        <rect x="56" y="112" width="88" height="8" rx="4" fill="#2a2763" />
        <rect x="56" y="112" width="52" height="8" rx="4" fill="url(#mw-steppreview-bar)" />
        <circle cx="108" cy="116" r="7" fill="#fff" />
        <rect x="150" y="108" width="14" height="16" rx="4" fill="#38bdf8" opacity={0.85} transform="rotate(12 157 116)" />
        <path d="M157 108 v-8" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
      </g>
      <Sparkle x={30} y={96} scale={0.7} color="#38bdf8" />
      <Sparkle x={176} y={40} scale={0.9} delay={0.9} />
    </svg>
  );
}

/** 빈 회차 상태 — 클래퍼보드와 스포트라이트. */
export function EditorEmptyIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="mw-empty-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mw-empty-board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3670" />
          <stop offset="1" stopColor="#232052" />
        </linearGradient>
      </defs>
      {/* 스포트라이트 */}
      <polygon points="120,0 60,150 180,150" fill="url(#mw-empty-ray)" className="mw-ray" />
      <polygon points="120,0 92,150 148,150" fill="url(#mw-empty-ray)" opacity={0.6} className="mw-ray" />
      <g className="mw-illus-float">
        {/* 클래퍼보드 */}
        <g transform="rotate(-6 120 110)">
          <rect x="62" y="72" width="116" height="72" rx="8" fill="url(#mw-empty-board)" stroke="#4c4a8a" strokeWidth="2" />
          <g transform="rotate(-12 120 72)">
            <rect x="62" y="56" width="116" height="18" rx="6" fill="#171233" stroke="#4c4a8a" strokeWidth="2" />
            {Array.from({ length: 6 }).map((_, i) => (
              <polygon
                key={i}
                points={`${70 + i * 19},56 ${79 + i * 19},56 ${74 + i * 19},74 ${65 + i * 19},74`}
                fill="#e8e6ff"
                opacity={0.9}
              />
            ))}
          </g>
          <rect x="76" y="92" width="60" height="7" rx="3.5" fill="#a78bfa" opacity={0.55} />
          <rect x="76" y="106" width="88" height="7" rx="3.5" fill="#a78bfa" opacity={0.35} />
          <rect x="76" y="120" width="44" height="7" rx="3.5" fill="#f472b6" opacity={0.5} />
        </g>
        {/* 필름 조각 */}
        <g transform="translate(196 128) rotate(14)">
          <rect x="-16" y="-10" width="32" height="20" rx="3" fill="#171233" stroke="#4c4a8a" strokeWidth="1.5" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={-12 + i * 10} y={-6} width={6} height={12} rx="1.5" fill="#38bdf8" opacity={0.5} />
          ))}
        </g>
      </g>
      <Sparkle x={44} y={52} scale={0.9} />
      <Sparkle x={204} y={44} scale={0.7} delay={0.7} color="#f472b6" />
      <Sparkle x={120} y={166} scale={0.6} delay={1.3} color="#38bdf8" />
    </svg>
  );
}

/** 플레이어 스플래시 — 시네마 스크린과 필름 프레임. */
export function PlayerSplashIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 170" className={className} role="img" aria-hidden="true">
      <defs>
        <radialGradient id="mw-splash-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0.5" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mw-splash-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d2a5e" />
          <stop offset="1" stopColor="#141126" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="80" r="78" fill="url(#mw-splash-glow)" className="mw-ray" />
      {/* 커튼 */}
      <path d="M28 22 Q 44 60, 36 138 L 20 138 Q 28 60, 12 22 Z" fill="#f472b6" opacity={0.75} />
      <path d="M212 22 Q 196 60, 204 138 L 220 138 Q 212 60, 228 22 Z" fill="#f472b6" opacity={0.75} />
      <g className="mw-illus-float">
        <rect x="46" y="30" width="148" height="96" rx="10" fill="url(#mw-splash-screen)" stroke="#5b58a8" strokeWidth="2.5" />
        <rect x="46" y="30" width="148" height="96" rx="10" fill="none" stroke="#a78bfa" strokeWidth="1" opacity={0.4} />
        <circle cx="120" cy="78" r="24" fill="#f472b6" />
        <circle cx="120" cy="78" r="24" fill="none" stroke="#fff" strokeWidth="2.5" opacity={0.5} className="mw-pulse-ring" />
        <circle cx="120" cy="78" r="32" fill="none" stroke="#f472b6" strokeWidth="1.5" opacity={0.5} className="mw-pulse-ring" style={{ animationDelay: "0.9s" }} />
        <path d="M113 65 L131 78 L113 91 Z" fill="#fff" />
        {/* 떠다니는 필름 프레임 */}
        <g transform="translate(52 148) rotate(-10)">
          <rect x="-18" y="-9" width="36" height="18" rx="3" fill="#1c1940" stroke="#4c4a8a" strokeWidth="1.5" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={-14 + i * 11} y={-5} width={7} height={10} rx={1.5} fill="#a78bfa" opacity={0.55} />
          ))}
        </g>
        <g transform="translate(192 40) rotate(12)">
          <path d="M0 10 Q -2 2, -8 -2 M0 10 Q 2 2, 8 -2" stroke="#38bdf8" strokeWidth={3} fill="none" strokeLinecap="round" />
          <ellipse cx="0" cy="14" rx="7" ry="5.5" fill="#38bdf8" opacity={0.9} transform="rotate(-12)" />
        </g>
      </g>
      <Sparkle x={70} y={30} scale={0.8} />
      <Sparkle x={178} y={120} scale={0.9} delay={0.8} color="#f472b6" />
    </svg>
  );
}

/** 대사 없음 상태 — 말풍선. */
export function DialogueEmptyIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 200 110" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="mw-dlg-bubble" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34316e" />
          <stop offset="1" stopColor="#232052" />
        </linearGradient>
      </defs>
      <g className="mw-illus-float">
        <rect x="48" y="18" width="104" height="56" rx="16" fill="url(#mw-dlg-bubble)" stroke="#5b58a8" strokeWidth="2" />
        <polygon points="80,74 70,96 96,74" fill="#232052" stroke="#5b58a8" strokeWidth="2" />
        <circle cx="82" cy="46" r="6" fill="#a78bfa" opacity={0.8} className="mw-typing-dot" />
        <circle cx="100" cy="46" r="6" fill="#a78bfa" opacity={0.8} className="mw-typing-dot" style={{ animationDelay: "0.25s" }} />
        <circle cx="118" cy="46" r="6" fill="#a78bfa" opacity={0.8} className="mw-typing-dot" style={{ animationDelay: "0.5s" }} />
      </g>
      <Sparkle x={36} y={30} scale={0.6} color="#38bdf8" />
      <Sparkle x={168} y={70} scale={0.7} delay={0.9} />
    </svg>
  );
}
