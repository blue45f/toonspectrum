/* eslint-disable react-refresh/only-export-components -- 일러스트 레지스트리: 컴포넌트와 이름 상수/조회 함수를 한 파일에 둠 */
import type { JSX } from "react";

import "./motion-assets-effects.css";
import {
  motionAssetClass,
  resolveAssetSize,
  type MotionAssetSize,
} from "./motion-assets-engine";

/**
 * 웹툰 창작 테마 애니메이션 SVG 일러스트 세트 (26종).
 * 전부 currentColor 기반이라 다크/라이트에 자동 대응.
 * idle 애니메이션은 CSS 클래스 — reduced-motion에서 자동 정지.
 */

export const MOTION_ILLUSTRATION_NAMES = [
  "drawing-hand",
  "pen-tool",
  "brush",
  "speech-bubble",
  "thought-bubble",
  "shout-bubble",
  "webtoon-panels",
  "storyboard",
  "color-palette",
  "ink-bottle",
  "sparkles",
  "big-star",
  "hero-silhouette",
  "chibi",
  "lightbulb",
  "rocket",
  "trophy",
  "heart",
  "music-notes",
  "camera",
  "layers",
  "perspective-grid",
  "cloud-upload",
  "magic-wand",
  "scroll",
  "eye",
] as const;

export type MotionIllustrationName = (typeof MOTION_ILLUSTRATION_NAMES)[number];

type Renderer = () => JSX.Element;

const RENDERERS: Record<MotionIllustrationName, Renderer> = {
  "drawing-hand": () => (
    <g>
      <g className="ma-anim-float-soft">
        <rect x="12" y="72" width="96" height="34" rx="7" fill="currentColor" opacity="0.12" />
        <rect x="12" y="72" width="96" height="34" rx="7" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.55" />
        <path d="M24 89 q 18 -11 36 0 t 36 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.7" className="ma-draw-line" style={{ ["--ma-draw-length" as string]: 130 }} />
      </g>
      <g className="ma-anim-bob">
        <rect x="50" y="14" width="30" height="28" rx="11" fill="currentColor" opacity="0.85" />
        <rect x="50" y="14" width="30" height="28" rx="11" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
        <line x1="65" y1="40" x2="79" y2="68" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <polygon points="79,68 74,78 84,72" fill="currentColor" opacity="0.9" />
      </g>
    </g>
  ),
  "pen-tool": () => (
    <g>
      <g className="ma-anim-sway">
        <rect x="46" y="18" width="14" height="62" rx="7" transform="rotate(32 53 49)" fill="currentColor" opacity="0.85" />
        <polygon points="72,84 62,92 78,78" fill="currentColor" opacity="0.9" />
        <rect x="42" y="30" width="22" height="7" rx="3.5" transform="rotate(32 53 33)" fill="currentColor" opacity="0.35" />
      </g>
      <g className="ma-anim-twinkle">
        <path d="M92 22l2.4 6.4 6.4 2.4-6.4 2.4-2.4 6.4-2.4-6.4-6.4-2.4 6.4-2.4z" fill="currentColor" opacity="0.8" />
      </g>
      <g className="ma-anim-twinkle-slow">
        <circle cx="26" cy="88" r="4" fill="currentColor" opacity="0.5" />
      </g>
    </g>
  ),
  brush: () => (
    <g>
      <g className="ma-anim-sway">
        <rect x="52" y="10" width="13" height="52" rx="6.5" transform="rotate(-24 58 36)" fill="currentColor" opacity="0.85" />
        <rect x="50" y="56" width="17" height="14" rx="3" transform="rotate(-24 58 63)" fill="currentColor" opacity="0.4" />
        <path d="M44 78 q 10 16 24 12 q -6 -14 -12 -18 z" fill="currentColor" opacity="0.9" />
      </g>
      <g className="ma-anim-pulse-soft">
        <ellipse cx="62" cy="100" rx="16" ry="6" fill="currentColor" opacity="0.25" />
      </g>
      <g className="ma-anim-rise">
        <circle cx="88" cy="40" r="3.5" fill="currentColor" opacity="0.6" />
        <circle cx="96" cy="58" r="2.5" fill="currentColor" opacity="0.5" />
      </g>
    </g>
  ),
  "speech-bubble": () => (
    <g>
      <g className="ma-anim-float">
        <rect x="18" y="22" width="84" height="54" rx="18" fill="currentColor" opacity="0.12" />
        <rect x="18" y="22" width="84" height="54" rx="18" fill="none" stroke="currentColor" strokeWidth="3.5" opacity="0.8" />
        <polygon points="38,74 30,96 52,76" fill="currentColor" opacity="0.8" />
        <line x1="32" y1="42" x2="88" y2="42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
        <line x1="32" y1="56" x2="70" y2="56" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.4" />
      </g>
    </g>
  ),
  "thought-bubble": () => (
    <g>
      <g className="ma-anim-float">
        <ellipse cx="62" cy="44" rx="38" ry="28" fill="currentColor" opacity="0.12" />
        <ellipse cx="62" cy="44" rx="38" ry="28" fill="none" stroke="currentColor" strokeWidth="3.5" opacity="0.8" />
        <path d="M48 40 q 6 -6 14 0 q 8 -6 14 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      </g>
      <g className="ma-anim-float-delayed">
        <circle cx="34" cy="82" r="7" fill="currentColor" opacity="0.5" />
        <circle cx="22" cy="96" r="4.5" fill="currentColor" opacity="0.4" />
      </g>
    </g>
  ),
  "shout-bubble": () => (
    <g>
      <g className="ma-anim-pulse-soft">
        <polygon
          points="60,12 70,26 86,20 86,36 102,40 94,52 104,62 90,66 90,82 76,76 66,90 58,76 42,80 42,64 28,60 36,48 28,36 44,34 46,18 58,28"
          fill="currentColor"
          opacity="0.14"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <text x="62" y="62" textAnchor="middle" fontSize="26" fontWeight="800" fill="currentColor" opacity="0.85">!</text>
      </g>
      <g className="ma-anim-twinkle">
        <path d="M100 88l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2z" fill="currentColor" opacity="0.7" />
      </g>
    </g>
  ),
  "webtoon-panels": () => (
    <g>
      <g className="ma-anim-float-soft">
        <rect x="30" y="12" width="60" height="28" rx="4" fill="currentColor" opacity="0.16" stroke="currentColor" strokeWidth="3" />
        <circle cx="46" cy="26" r="6" fill="currentColor" opacity="0.55" />
        <line x1="58" y1="22" x2="80" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        <line x1="58" y1="30" x2="74" y2="30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      </g>
      <g className="ma-anim-float-delayed">
        <rect x="24" y="46" width="72" height="28" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="3" />
        <polygon points="48,52 40,68 56,68" fill="currentColor" opacity="0.55" />
        <line x1="62" y1="56" x2="86" y2="56" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        <line x1="62" y1="64" x2="78" y2="64" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      </g>
      <g className="ma-anim-float">
        <rect x="30" y="80" width="60" height="28" rx="4" fill="currentColor" opacity="0.16" stroke="currentColor" strokeWidth="3" />
        <path d="M44 94 q 8 -8 16 0 q 8 -8 16 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      </g>
    </g>
  ),
  storyboard: () => (
    <g>
      <g className="ma-anim-float-soft">
        <rect x="10" y="34" width="100" height="52" rx="6" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="3" />
        {[22, 38, 54, 70, 86, 98].map((x) => (
          <g key={x}>
            <rect x={x} y="38" width="7" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
            <rect x={x} y="76" width="7" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
          </g>
        ))}
        <line x1="46" y1="34" x2="46" y2="86" stroke="currentColor" strokeWidth="2.5" opacity="0.5" />
        <line x1="78" y1="34" x2="78" y2="86" stroke="currentColor" strokeWidth="2.5" opacity="0.5" />
        <circle cx="28" cy="60" r="8" fill="currentColor" opacity="0.45" />
        <polygon points="60,52 54,68 68,68" fill="currentColor" opacity="0.45" />
        <rect x="86" y="54" width="16" height="12" rx="2" fill="currentColor" opacity="0.45" />
      </g>
    </g>
  ),
  "color-palette": () => (
    <g>
      <g className="ma-anim-bob">
        <path
          d="M60 14 C 30 14 16 36 16 58 C 16 82 34 102 60 102 C 68 102 74 98 74 92 C 74 86 68 84 68 78 C 68 72 74 70 80 70 L 92 70 C 102 70 106 62 106 54 C 106 32 86 14 60 14 Z"
          fill="currentColor"
          opacity="0.14"
          stroke="currentColor"
          strokeWidth="3"
        />
        <circle cx="42" cy="42" r="8" fill="#f87171" opacity="0.9" />
        <circle cx="64" cy="36" r="8" fill="#fbbf24" opacity="0.9" />
        <circle cx="86" cy="44" r="8" fill="#34d399" opacity="0.9" />
        <circle cx="40" cy="68" r="8" fill="#60a5fa" opacity="0.9" />
        <circle cx="62" cy="66" r="8" fill="#c084fc" opacity="0.9" />
      </g>
      <g className="ma-anim-twinkle">
        <path d="M104 88l2.4 6.4 6.4 2.4-6.4 2.4-2.4 6.4-2.4-6.4-6.4-2.4 6.4-2.4z" fill="currentColor" opacity="0.7" />
      </g>
    </g>
  ),
  "ink-bottle": () => (
    <g>
      <g className="ma-anim-float-soft">
        <rect x="30" y="52" width="40" height="52" rx="10" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="3" />
        <rect x="30" y="76" width="40" height="28" rx="10" fill="currentColor" opacity="0.45" />
        <rect x="42" y="34" width="16" height="20" rx="4" fill="currentColor" opacity="0.6" />
        <rect x="38" y="26" width="24" height="10" rx="4" fill="currentColor" opacity="0.85" />
      </g>
      <g className="ma-anim-sway">
        <line x1="84" y1="18" x2="76" y2="66" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <polygon points="76,66 71,78 81,72" fill="currentColor" opacity="0.9" />
      </g>
      <g className="ma-anim-rise">
        <circle cx="96" cy="84" r="3" fill="currentColor" opacity="0.55" />
      </g>
    </g>
  ),
  sparkles: () => (
    <g>
      <g className="ma-anim-twinkle">
        <path d="M60 14l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="currentColor" opacity="0.9" />
      </g>
      <g className="ma-anim-twinkle-slow">
        <path d="M26 62l3.6 9.4 9.4 3.6-9.4 3.6-3.6 9.4-3.6-9.4-9.4-3.6 9.4-3.6z" fill="currentColor" opacity="0.75" />
      </g>
      <g className="ma-anim-twinkle" style={{ animationDelay: "-1.1s" }}>
        <path d="M94 66l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor" opacity="0.7" />
      </g>
      <g className="ma-anim-twinkle-slow" style={{ animationDelay: "-2.4s" }}>
        <circle cx="60" cy="96" r="4" fill="currentColor" opacity="0.55" />
        <circle cx="88" cy="30" r="3" fill="currentColor" opacity="0.5" />
      </g>
    </g>
  ),
  "big-star": () => (
    <g>
      <g className="ma-anim-pulse-soft">
        <polygon
          points="60,12 73,44 106,44 79,63 89,96 60,76 31,96 41,63 14,44 47,44"
          fill="currentColor"
          opacity="0.16"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <polygon points="60,28 67,49 89,49 71,61 78,83 60,70 42,83 49,61 31,49 53,49" fill="currentColor" opacity="0.75" />
      </g>
      <g className="ma-anim-twinkle">
        <circle cx="98" cy="24" r="3.5" fill="currentColor" opacity="0.6" />
      </g>
    </g>
  ),
  "hero-silhouette": () => (
    <g>
      <g className="ma-anim-float">
        <circle cx="60" cy="30" r="14" fill="currentColor" opacity="0.85" />
        <path d="M60 48 c -12 0 -18 8 -18 20 l 0 22 l 36 0 l 0 -22 c 0 -12 -6 -20 -18 -20 z" fill="currentColor" opacity="0.85" />
        <path d="M46 52 C 30 60 26 80 30 100 C 40 88 52 82 60 80 Z" fill="currentColor" opacity="0.4" className="ma-anim-sway" />
        <circle cx="55" cy="29" r="2.4" fill="#fff" opacity="0.9" className="ma-anim-blink" />
        <circle cx="65" cy="29" r="2.4" fill="#fff" opacity="0.9" className="ma-anim-blink" />
      </g>
      <ellipse cx="60" cy="106" rx="22" ry="5" fill="currentColor" opacity="0.2" />
    </g>
  ),
  chibi: () => (
    <g>
      <g className="ma-anim-bob">
        <circle cx="60" cy="46" r="26" fill="currentColor" opacity="0.85" />
        <circle cx="50" cy="44" r="4.5" fill="#fff" opacity="0.95" className="ma-anim-blink" />
        <circle cx="70" cy="44" r="4.5" fill="#fff" opacity="0.95" className="ma-anim-blink" />
        <path d="M54 58 q 6 5 12 0" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        <path d="M36 30 q -6 -8 -2 -16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
        <path d="M84 30 q 6 -8 2 -16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      </g>
      <g className="ma-anim-float-soft">
        <rect x="46" y="72" width="28" height="24" rx="10" fill="currentColor" opacity="0.6" />
      </g>
      <ellipse cx="60" cy="102" rx="20" ry="4.5" fill="currentColor" opacity="0.18" />
    </g>
  ),
  lightbulb: () => (
    <g>
      <g className="ma-anim-pulse-soft">
        <circle cx="60" cy="46" r="24" fill="currentColor" opacity="0.16" stroke="currentColor" strokeWidth="3.5" />
        <path d="M52 62 L 56 74 L 64 74 L 68 62" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
        <rect x="52" y="76" width="16" height="7" rx="3" fill="currentColor" opacity="0.7" />
        <rect x="54" y="85" width="12" height="7" rx="3" fill="currentColor" opacity="0.55" />
      </g>
      <g className="ma-anim-twinkle">
        <line x1="60" y1="8" x2="60" y2="16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
        <line x1="30" y1="22" x2="36" y2="28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
        <line x1="90" y1="22" x2="84" y2="28" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
      </g>
    </g>
  ),
  rocket: () => (
    <g>
      <g className="ma-anim-float">
        <path d="M60 8 C 72 20 76 38 72 58 L 48 58 C 44 38 48 20 60 8 Z" fill="currentColor" opacity="0.85" />
        <circle cx="60" cy="36" r="8" fill="currentColor" opacity="0.25" stroke="#fff" strokeWidth="2.5" />
        <path d="M48 52 L 36 68 L 48 64 Z" fill="currentColor" opacity="0.7" />
        <path d="M72 52 L 84 68 L 72 64 Z" fill="currentColor" opacity="0.7" />
      </g>
      <g className="ma-anim-pulse-soft">
        <path d="M54 64 q 6 14 6 22 q 0 -8 6 -22 q -6 4 -12 0" fill="currentColor" opacity="0.65" />
      </g>
      <g className="ma-anim-rise">
        <circle cx="44" cy="86" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="76" cy="88" r="2.4" fill="currentColor" opacity="0.45" />
      </g>
    </g>
  ),
  trophy: () => (
    <g>
      <g className="ma-anim-float-soft">
        <path d="M40 18 L 80 18 L 76 48 C 74 58 68 62 60 62 C 52 62 46 58 44 48 Z" fill="currentColor" opacity="0.16" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M40 24 C 28 24 26 36 36 42" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
        <path d="M80 24 C 92 24 94 36 84 42" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
        <rect x="55" y="62" width="10" height="16" fill="currentColor" opacity="0.7" />
        <rect x="44" y="78" width="32" height="10" rx="4" fill="currentColor" opacity="0.85" />
      </g>
      <g className="ma-anim-twinkle">
        <path d="M92 78l2.4 6.4 6.4 2.4-6.4 2.4-2.4 6.4-2.4-6.4-6.4-2.4 6.4-2.4z" fill="currentColor" opacity="0.75" />
      </g>
    </g>
  ),
  heart: () => (
    <g>
      <g className="ma-anim-pulse-soft">
        <path
          d="M60 96 C 36 76 22 62 22 46 C 22 34 30 26 40 26 C 48 26 55 31 60 38 C 65 31 72 26 80 26 C 90 26 98 34 98 46 C 98 62 84 76 60 96 Z"
          fill="currentColor"
          opacity="0.85"
        />
        <path d="M38 44 c -3 -6 2 -11 7 -9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      </g>
    </g>
  ),
  "music-notes": () => (
    <g>
      <g className="ma-anim-float">
        <ellipse cx="38" cy="88" rx="10" ry="8" fill="currentColor" opacity="0.85" />
        <rect x="44" y="34" width="5" height="56" fill="currentColor" opacity="0.85" />
        <path d="M49 34 q 18 4 24 18 l -6 2 q -6 -12 -18 -14 z" fill="currentColor" opacity="0.85" />
      </g>
      <g className="ma-anim-float-delayed">
        <ellipse cx="84" cy="94" rx="8" ry="6.5" fill="currentColor" opacity="0.6" />
        <rect x="89" y="50" width="4.5" height="46" fill="currentColor" opacity="0.6" />
        <path d="M93 50 q 12 3 16 12 l -5 2 q -4 -8 -11 -10 z" fill="currentColor" opacity="0.6" />
      </g>
    </g>
  ),
  camera: () => (
    <g>
      <g className="ma-anim-float-soft">
        <rect x="22" y="40" width="76" height="52" rx="12" fill="currentColor" opacity="0.14" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="60" cy="66" r="16" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.8" />
        <circle cx="60" cy="66" r="8" fill="currentColor" opacity="0.5" />
        <rect x="44" y="30" width="22" height="12" rx="4" fill="currentColor" opacity="0.7" />
        <circle cx="86" cy="52" r="4" fill="currentColor" opacity="0.8" className="ma-anim-blink" />
      </g>
      <g className="ma-anim-twinkle">
        <path d="M104 24l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2z" fill="currentColor" opacity="0.7" />
      </g>
    </g>
  ),
  layers: () => (
    <g>
      <g className="ma-anim-float-delayed">
        <polygon points="60,18 100,40 60,62 20,40" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </g>
      <g className="ma-anim-float-soft">
        <polygon points="60,44 100,66 60,88 20,66" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </g>
      <g className="ma-anim-float">
        <polygon points="60,70 100,92 60,114 20,92" fill="currentColor" opacity="0.45" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </g>
    </g>
  ),
  "perspective-grid": () => (
    <g>
      <g className="ma-anim-pulse-soft">
        <line x1="10" y1="60" x2="110" y2="60" stroke="currentColor" strokeWidth="2.5" opacity="0.6" />
        <line x1="60" y1="60" x2="10" y2="110" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        <line x1="60" y1="60" x2="110" y2="110" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        <line x1="60" y1="60" x2="60" y2="110" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        <line x1="60" y1="60" x2="30" y2="110" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="60" y1="60" x2="90" y2="110" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="60" y1="60" x2="60" y2="14" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        <circle cx="60" cy="60" r="6" fill="currentColor" opacity="0.9" />
        <circle cx="60" cy="60" r="11" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      </g>
    </g>
  ),
  "cloud-upload": () => (
    <g>
      <g className="ma-anim-float">
        <path
          d="M36 78 C 24 78 18 68 24 60 C 28 54 36 52 42 55 C 46 44 56 38 66 42 C 74 34 88 36 92 46 C 100 48 102 58 96 64 C 92 70 86 72 80 72 Z"
          fill="currentColor"
          opacity="0.16"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </g>
      <g className="ma-anim-float-delayed">
        <line x1="60" y1="92" x2="60" y2="66" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity="0.85" />
        <polygon points="60,58 50,70 70,70" fill="currentColor" opacity="0.85" />
      </g>
    </g>
  ),
  "magic-wand": () => (
    <g>
      <g className="ma-anim-sway">
        <line x1="30" y1="90" x2="72" y2="44" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
        <path d="M78 26l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="currentColor" opacity="0.9" />
      </g>
      <g className="ma-anim-twinkle">
        <path d="M96 56l2.4 6.4 6.4 2.4-6.4 2.4-2.4 6.4-2.4-6.4-6.4-2.4 6.4-2.4z" fill="currentColor" opacity="0.75" />
        <circle cx="52" cy="30" r="3.5" fill="currentColor" opacity="0.6" />
      </g>
      <g className="ma-anim-twinkle-slow">
        <circle cx="92" cy="88" r="3" fill="currentColor" opacity="0.55" />
      </g>
    </g>
  ),
  scroll: () => (
    <g>
      <g className="ma-anim-float-soft">
        <rect x="26" y="30" width="68" height="60" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="3" />
        <ellipse cx="26" cy="36" rx="8" ry="12" fill="currentColor" opacity="0.5" />
        <ellipse cx="94" cy="36" rx="8" ry="12" fill="currentColor" opacity="0.5" />
        <line x1="40" y1="50" x2="80" y2="50" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
        <line x1="40" y1="62" x2="72" y2="62" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.4" />
        <line x1="40" y1="74" x2="76" y2="74" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.3" />
      </g>
    </g>
  ),
  eye: () => (
    <g>
      <g className="ma-anim-float-soft">
        <path
          d="M14 60 C 30 38 48 30 60 30 C 72 30 90 38 106 60 C 90 82 72 90 60 90 C 48 90 30 82 14 60 Z"
          fill="currentColor"
          opacity="0.12"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <circle cx="60" cy="60" r="16" fill="currentColor" opacity="0.7" />
        <circle cx="60" cy="60" r="7" fill="#fff" opacity="0.85" className="ma-anim-blink" />
        <circle cx="65" cy="55" r="3" fill="#fff" opacity="0.9" />
      </g>
    </g>
  ),
};

export interface MotionIllustrationProps {
  /** 일러스트 이름. */
  name: MotionIllustrationName;
  /** 크기 프리셋 또는 px. 기본 md(96). */
  size?: MotionAssetSize;
  /** 추가 클래스. */
  className?: string;
  /** 접근성 라벨 (없으면 aria-hidden). */
  title?: string;
  /** idle 애니메이션 재생 여부. 기본 true. */
  animated?: boolean;
}

/**
 * 공용 일러스트 렌더러.
 *
 * @example
 * <MotionIllustration name="speech-bubble" size="lg" />
 * <MotionIllustration name="rocket" size={64} title="런칭" />
 */
export function MotionIllustration({
  name,
  size = "md",
  className,
  title,
  animated = true,
}: MotionIllustrationProps): JSX.Element {
  const px = resolveAssetSize(size);
  const Renderer = RENDERERS[name];
  return (
    <span
      className={motionAssetClass(className)}
      style={{ width: px, height: px }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-motion-illustration={name}
      data-animated={animated ? "true" : "false"}
    >
      <svg viewBox="0 0 120 120" className={animated ? undefined : "ma-static"}>
        {title ? <title>{title}</title> : null}
        <Renderer />
      </svg>
    </span>
  );
}

/** 등록된 일러스트 이름 목록 (문서·셀렉터용). */
export function listMotionIllustrations(): readonly MotionIllustrationName[] {
  return MOTION_ILLUSTRATION_NAMES;
}
