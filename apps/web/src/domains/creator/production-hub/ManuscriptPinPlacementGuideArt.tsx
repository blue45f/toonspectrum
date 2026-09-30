/**
 * 원고 뷰어 핀 피드백 — 배치 가이드 도식.
 *
 * 처음 핀을 꽂는 사용자를 위한 "클릭 → 핀 꽂기 → 코멘트" 3단계 일러스트.
 * 코드 생성 SVG, 장식용(aria-hidden).
 */

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** "클릭 → 핀 꽂힘 → 코멘트" 3단계 도식 (코드 생성 SVG, 장식용) */
export function ManuscriptPinPlacementGuideArt() {
  const bt = useBilingual("ManuscriptPinFeedback");
  const steps = [
    { ko: "클릭", en: "Click" },
    { ko: "핀 꽂기", en: "Pin" },
    { ko: "코멘트", en: "Comment" },
  ];
  return (
    <div className="manuscript-pin-place-guide" aria-hidden="true">
      <svg viewBox="0 0 320 96" role="presentation">
        <defs>
          <linearGradient id="mpg-pin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fbbf24" />
            <stop offset="0.6" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
        </defs>
        {/* 단계 1: 커서 클릭 */}
        <circle cx="40" cy="34" r="22" fill="rgb(245 158 11 / 0.12)" />
        <path
          d="M34 22 L34 42 L40 37 L44 44 L47 42 L43 35 L49 35 Z"
          fill="#f59e0b"
        />
        <circle cx="56" cy="48" r="4" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.7" />
        <circle cx="56" cy="48" r="9" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.35" />
        {/* 단계 2: 핀 */}
        <circle cx="160" cy="34" r="22" fill="rgb(245 158 11 / 0.12)" />
        <g transform="translate(160 30)">
          <path
            d="M0 16 C -10 5 -12 -1 -12 -6 A 12 12 0 1 1 12 -6 C 12 -1 10 5 0 16 Z"
            fill="url(#mpg-pin)"
          />
          <circle cx="0" cy="-6" r="4.2" fill="#fff" />
        </g>
        {/* 단계 3: 말풍선 */}
        <circle cx="280" cy="34" r="22" fill="rgb(245 158 11 / 0.12)" />
        <rect x="264" y="20" width="32" height="22" rx="7" fill="#f59e0b" />
        <path d="M272 42 L270 50 L278 42 Z" fill="#f59e0b" />
        <circle cx="274" cy="31" r="2.2" fill="#fff" />
        <circle cx="281" cy="31" r="2.2" fill="#fff" />
        <circle cx="288" cy="31" r="2.2" fill="#fff" />
        {/* 연결 화살표 */}
        <path d="M68 34 H128" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
        <path d="M122 30 L130 34 L122 38" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.6" />
        <path d="M188 34 H248" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
        <path d="M242 30 L250 34 L242 38" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.6" />
        {/* 단계 라벨 */}
        {steps.map((step, index) => (
          <text
            key={step.en}
            x={40 + index * 120}
            y="80"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#a8a29e"
          >
            {index + 1}. {bt(step.ko, step.en)}
          </text>
        ))}
      </svg>
    </div>
  );
}
