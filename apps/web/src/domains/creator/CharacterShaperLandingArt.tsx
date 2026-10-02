import { cn } from "@/shared/lib/utils";

// 캐릭터 셰이퍼 랜딩(/shaper) 전용 인라인 SVG 일러스트.
// 외부 이미지 없이 warm-ink 토큰(var(--color-*))과 currentColor 만 쓴다 — 테마·다크 표면과 항상 맞물리고,
// 실제 3D 렌더 캡처를 기능 완료 증거처럼 내세우지 않는다(스크린샷은 docs/screenshots 가 맡는다).

interface ArtProps {
  className?: string;
}

const LINE = "var(--color-line)";
const LINE_STRONG = "var(--color-line-strong)";
const CARD = "var(--color-card)";
const PANEL = "var(--color-panel)";
const RAISED = "var(--color-raised)";
const ACCENT = "var(--color-accent)";
const ACCENT_SOFT = "var(--color-accent-soft)";
const ON_ACCENT = "var(--color-on-accent)";
const FG_2 = "var(--color-fg-2)";
const FG_3 = "var(--color-fg-3)";

/* -------------------------------------------------------------------------- */
/* 기능 ① — 슬롯 레일 + 프리셋 카드 그리드                                     */
/* -------------------------------------------------------------------------- */

const PRESET_CARDS: readonly { x: number; y: number; hair: string; active?: boolean }[] = [
  { x: 44, y: 10, hair: "M12 20 C12 8 34 8 34 20" },
  { x: 96, y: 10, hair: "M12 22 C10 6 36 6 34 22 M12 22 L11 34 M34 22 L35 34", active: true },
  { x: 148, y: 10, hair: "M13 18 L16 10 L20 16 L24 8 L28 16 L32 10 L33 18" },
  { x: 44, y: 64, hair: "M12 20 C12 8 34 8 34 20 M23 9 a4 4 0 1 0 0.1 0" },
  { x: 96, y: 64, hair: "M12 20 C12 8 34 8 34 20 M10 24 L8 36 M36 24 L38 36" },
  { x: 148, y: 64, hair: "M12 20 C12 8 34 8 34 20 M14 18 L18 13 M22 12 L26 17 M30 12 L32 18" },
];

export function PresetSlotsArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" fill="none" className={className}>
      <rect x="8" y="8" width="26" height="104" rx="8" fill={PANEL} stroke={LINE} />
      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          x="14"
          y={14 + index * 16.5}
          width="14"
          height="12"
          rx="3"
          fill={index === 1 ? ACCENT : RAISED}
        />
      ))}
      {PRESET_CARDS.map((card) => (
        <g key={`${card.x}-${card.y}`} transform={`translate(${card.x} ${card.y})`}>
          <rect
            width="46"
            height="46"
            rx="7"
            fill={CARD}
            stroke={card.active ? ACCENT : LINE}
            strokeWidth={card.active ? 2 : 1}
          />
          <circle cx="23" cy="22" r="11" fill={RAISED} stroke={LINE_STRONG} />
          <path d={card.hair} stroke={FG_2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="19" cy="23" r="1.5" fill={FG_2} />
          <circle cx="27" cy="23" r="1.5" fill={FG_2} />
          <rect x="10" y="38" width="26" height="3" rx="1.5" fill={LINE_STRONG} />
          {card.active && (
            <>
              <circle cx="40" cy="6" r="6" fill={ACCENT} />
              <path
                d="M37 6l2.2 2.2 3.8-4.2"
                stroke={ON_ACCENT}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 기능 ② — 모델 표면 위 드로잉(UV 아틀라스 미니맵 포함)                       */
/* -------------------------------------------------------------------------- */

export function SurfacePaintArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" fill="none" className={cn("font-sans", className)}>
      <ellipse cx="72" cy="62" rx="40" ry="46" fill={CARD} stroke={LINE_STRONG} strokeWidth="1.5" />
      <path d="M40 40 Q72 52 104 40 M36 62 Q72 74 108 62 M40 84 Q72 96 104 84" stroke={LINE} strokeDasharray="3 3" />
      <path d="M60 18 Q52 62 60 106 M84 18 Q92 62 84 106" stroke={LINE} strokeDasharray="3 3" />
      <path
        d="M32 54 C30 22 54 12 72 12 C92 12 114 22 112 54 C104 40 92 34 84 36 C76 44 62 44 54 38 C44 40 36 46 32 54Z"
        fill={RAISED}
        stroke={LINE_STRONG}
        strokeWidth="1.5"
      />
      <path d="M52 64 C56 58 64 58 68 64" stroke={FG_2} strokeWidth="2" strokeLinecap="round" />
      <path d="M78 64 C82 58 90 58 94 64" stroke={FG_2} strokeWidth="2" strokeLinecap="round" />
      {/* 표면에 직접 그린 획 */}
      <path d="M46 78 C56 86 70 86 80 76" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" opacity="0.92" />
      <circle cx="92" cy="80" r="2" fill={ACCENT} />
      <circle cx="98" cy="74" r="1.5" fill={ACCENT} />
      {/* 브러시 */}
      <g transform="translate(118 26) rotate(35)">
        <rect width="10" height="48" rx="4" fill={RAISED} stroke={LINE_STRONG} strokeWidth="1.5" />
        <rect x="1.5" y="48" width="7" height="8" fill={LINE_STRONG} />
        <path d="M1 56 L9 56 L5 70 Z" fill={ACCENT} />
      </g>
      {/* UV 아틀라스 미니맵 — 같은 획이 텍스처에도 남는다 */}
      <g transform="translate(146 66)">
        <text x="23" y="-4" textAnchor="middle" fontSize="7" fontWeight="600" fill={FG_3}>
          UV
        </text>
        <rect width="46" height="46" rx="6" fill={PANEL} stroke={LINE} />
        <path d="M0 15.5 H46 M0 31 H46 M15.5 0 V46 M31 0 V46" stroke={LINE} />
        <path d="M8 30 C16 38 30 38 40 28" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 기능 ③ — 참고 사진 → 포즈·팔레트 추천(기기 내 처리)                         */
/* -------------------------------------------------------------------------- */

const PHOTO_LANDMARKS: readonly (readonly [number, number])[] = [
  [33, 29],
  [33, 34],
  [18, 46],
  [50, 26],
  [33, 52],
  [24, 74],
  [44, 74],
];

const PALETTE_SWATCHES = [RAISED, ACCENT, FG_3, LINE_STRONG, CARD] as const;

export function AiAssistArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" fill="none" className={cn("font-sans", className)}>
      <g transform="translate(10 8)">
        <rect width="66" height="88" rx="7" fill={PANEL} stroke={LINE} />
        <rect x="6" y="6" width="54" height="76" rx="4" fill={CARD} />
        <circle cx="33" cy="22" r="7" stroke={FG_3} strokeWidth="1.5" />
        <path
          d="M33 29 V52 M33 34 L18 46 M33 34 L50 26 M33 52 L24 74 M33 52 L44 74"
          stroke={FG_3}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {PHOTO_LANDMARKS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill={ACCENT} />
        ))}
      </g>
      <path d="M84 52 H112" stroke={LINE_STRONG} strokeWidth="2" strokeLinecap="round" />
      <path d="M106 46 L113 52 L106 58" stroke={LINE_STRONG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M98 26 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill={ACCENT} />
      <g transform="translate(120 8)">
        <rect width="70" height="88" rx="7" fill={CARD} stroke={LINE} />
        <path
          d="M35 31 V54 M35 36 L20 48 M35 36 L52 28 M35 54 L26 76 M35 54 L46 76"
          stroke={RAISED}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M35 33 V54" stroke={ACCENT} strokeWidth="9" strokeLinecap="round" />
        <circle cx="35" cy="22" r="9" fill={RAISED} stroke={LINE_STRONG} strokeWidth="1.5" />
        <path d="M24 20 C24 9 46 9 46 20" stroke={FG_2} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g transform="translate(120 102)">
        {PALETTE_SWATCHES.map((color, index) => (
          <rect key={color} x={index * 14} width="11" height="11" rx="3" fill={color} stroke={LINE} />
        ))}
      </g>
      <g transform="translate(10 102)">
        <rect width="66" height="12" rx="6" fill={PANEL} stroke={LINE} />
        <circle cx="8" cy="6" r="2.5" fill={ACCENT} />
        <text x="14" y="8.6" fontSize="6.5" fontWeight="600" fill={FG_2}>
          기기 내 처리
        </text>
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 기능 ④ — 투명 PNG + 의미 단위 레이어 PSD                                    */
/* -------------------------------------------------------------------------- */

const PSD_LAYER_LABELS = ["주선", "하이라이트", "음영", "표면 드로잉", "밑색"] as const;

export function OutputLayersArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" fill="none" className={cn("font-sans", className)}>
      <defs>
        <pattern id="shaper-landing-checker" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill={CARD} />
          <rect width="4" height="4" fill={RAISED} />
          <rect x="4" y="4" width="4" height="4" fill={RAISED} />
        </pattern>
      </defs>
      <g transform="translate(10 10)">
        <rect width="72" height="100" rx="7" fill="url(#shaper-landing-checker)" stroke={LINE} />
        <path
          d="M36 44 V70 M36 50 L22 62 M36 50 L50 62 M36 70 L28 92 M36 70 L44 92"
          stroke={FG_3}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="36" cy="30" r="13" fill={FG_3} />
        <path d="M23 26 C23 12 49 12 49 26" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" />
        <rect x="46" y="4" width="22" height="9" rx="4.5" fill={PANEL} stroke={LINE} />
        <text x="57" y="10.5" textAnchor="middle" fontSize="5.5" fontWeight="600" fill={FG_2}>
          PNG
        </text>
      </g>
      {PSD_LAYER_LABELS.map((label, index) => (
        <g key={label} transform={`translate(96 ${16 + index * 18})`}>
          <path
            d="M10 0 H50 L40 12 H0 Z"
            fill={index === PSD_LAYER_LABELS.length - 1 ? ACCENT_SOFT : CARD}
            stroke={index === 0 ? ACCENT : LINE_STRONG}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <text x="58" y="9" fontSize="7" fontWeight="600" fill={FG_2}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
