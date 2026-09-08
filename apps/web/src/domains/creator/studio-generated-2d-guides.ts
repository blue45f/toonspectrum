/** Generated drawing-structure and anatomy reference vectors. */

import type { StudioElementItem } from "./studio-elements-catalog";
import {
  BLUE,
  generatedElement as element,
  INK,
  PAPER,
  PINK,
  SKIN,
  SOFT_INK,
} from "./studio-generated-2d-foundation";

export const STUDIO_GENERATED_GUIDE_ITEMS: readonly StudioElementItem[] = Object.freeze([
  element(
    "guide-body-proportions",
    "8등신 인체 비례 가이드",
    "panel",
    ["구조", "드로잉", "인체", "비례", "전신", "body proportion", "anatomy"],
    560,
    760,
    `<rect x="10" y="10" width="540" height="740" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
     <path d="M86 92 H500 M86 172 H500 M86 252 H500 M86 332 H500 M86 412 H500 M86 492 H500 M86 572 H500 M86 652 H500" stroke="#9fb0c0" stroke-width="3" stroke-dasharray="12 10"/>
     ${Array.from({ length: 8 }, (_, index) => `<text x="48" y="${126 + index * 80}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="${SOFT_INK}">${index + 1}</text>`).join("")}
     <g fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="294" cy="96" rx="48" ry="60"/><path d="M294 156 V374 M294 214 L202 330 M294 214 L386 330 M294 374 L226 652 M294 374 L362 652"/><path d="M240 190 Q294 164 348 190 L366 372 Q294 412 222 372Z"/><path d="M226 652 L196 704 M362 652 L392 704"/></g>
     <path d="M294 38 V710" stroke="${PINK}" stroke-width="3" stroke-dasharray="10 10"/>
     <g fill="${BLUE}"><circle cx="294" cy="214" r="9"/><circle cx="294" cy="374" r="9"/><circle cx="202" cy="330" r="8"/><circle cx="386" cy="330" r="8"/><circle cx="226" cy="652" r="8"/><circle cx="362" cy="652" r="8"/></g>
     <text x="294" y="732" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" font-weight="800" fill="${INK}">8등신 인체 비례</text>`,
  ),
  element(
    "guide-face-turnaround",
    "얼굴 각도 턴어라운드",
    "panel",
    ["구조", "드로잉", "얼굴", "각도", "정면", "측면", "face turnaround"],
    820,
    360,
    `<rect x="10" y="10" width="800" height="340" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
     ${[
       { x: 110, turn: -22, label: "좌측 3/4" },
       { x: 310, turn: 0, label: "정면" },
       { x: 510, turn: 22, label: "우측 3/4" },
       { x: 710, turn: 48, label: "측면" },
     ].map(({ x, turn, label }, index) => `<g transform="translate(${x} 40)"><ellipse cx="0" cy="92" rx="${index === 3 ? 60 : 68}" ry="82" fill="#fff" stroke="${INK}" stroke-width="7"/><path d="M${turn} 18 V174" stroke="${PINK}" stroke-width="3" stroke-dasharray="8 7"/><path d="M-54 88 Q0 ${72 + Math.abs(turn) * 0.12} 54 88" fill="none" stroke="#9aaabd" stroke-width="3"/><path d="M${-34 + turn * 0.38} 82 Q${-18 + turn * 0.42} 68 ${-4 + turn * 0.45} 82 M${10 + turn * 0.32} 82 Q${28 + turn * 0.32} 68 ${42 + turn * 0.25} 82" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M${turn * 0.6} 94 L${turn * 0.8 - 4} 116 L${turn * 0.64 + 8} 118" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M${-18 + turn * 0.28} 138 Q${turn * 0.55} 148 ${18 + turn * 0.24} 138" fill="none" stroke="#a65363" stroke-width="5"/><text x="0" y="226" text-anchor="middle" font-family="system-ui,sans-serif" font-size="21" font-weight="700" fill="${SOFT_INK}">${label}</text></g>`).join("")}`,
  ),
  element(
    "guide-hand-poses",
    "손 포즈 레퍼런스 4종",
    "panel",
    ["구조", "드로잉", "손", "포즈", "손가락", "hand pose", "anatomy"],
    820,
    420,
    `<rect x="10" y="10" width="800" height="400" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
     <g fill="${SKIN}" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
       <g transform="translate(58 64)"><path d="M78 250 C38 214 30 160 54 122 L48 44 Q50 20 68 26 L82 112 L86 24 Q90 2 106 12 L112 108 L122 28 Q130 8 144 20 L138 116 L158 54 Q170 38 182 54 L154 160 C170 206 142 250 78 250Z"/></g>
       <g transform="translate(254 76)"><path d="M52 238 C22 196 32 146 68 120 L126 48 Q144 30 156 48 L112 114 L170 66 Q190 54 198 72 L142 128 L198 100 Q218 94 222 114 L154 154 C170 204 132 242 52 238Z"/></g>
       <g transform="translate(468 68)"><path d="M60 248 C28 208 36 156 70 126 L82 40 Q88 18 104 28 L104 116 L130 54 Q140 34 156 46 L128 128 L174 86 Q190 72 202 88 L150 146 C166 204 128 250 60 248Z"/></g>
       <g transform="translate(662 74)"><path d="M26 230 C12 186 26 142 62 118 L114 50 Q130 34 144 48 L108 108 L158 70 Q176 60 186 78 L126 134 L178 124 Q198 122 202 142 L132 164 C140 212 98 242 26 230Z"/></g>
     </g>
     <g font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="${SOFT_INK}" text-anchor="middle"><text x="150" y="372">펼친 손</text><text x="350" y="372">잡는 손</text><text x="550" y="372">가리키기</text><text x="718" y="372">섬세한 손짓</text></g>`,
  ),
  element(
    "guide-expressions",
    "표정 시트 8종",
    "panel",
    ["구조", "드로잉", "표정", "감정", "얼굴", "expression sheet", "emotion"],
    860,
    460,
    `<rect x="10" y="10" width="840" height="440" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
     ${[
       ["기쁨", "M-24 0 Q0 -18 24 0", "M-30 38 Q0 70 30 38"],
       ["슬픔", "M-24 4 Q0 -12 24 4", "M-28 58 Q0 34 28 58"],
       ["화남", "M-30 -8 L-4 2 M30 -8 L4 2", "M-28 58 Q0 34 28 58"],
       ["놀람", "M-22 0 Q0 -14 22 0", "M0 42 m-16 0 a16 22 0 1 0 32 0 a16 22 0 1 0 -32 0"],
       ["수줍음", "M-24 0 Q0 -12 24 0", "M-20 48 Q0 58 20 48"],
       ["의심", "M-30 0 L-4 -8 M30 -10 L4 -2", "M-20 48 H20"],
       ["집중", "M-28 -4 L-4 2 M28 -4 L4 2", "M-16 50 H16"],
       ["웃음", "M-26 -2 Q0 -20 26 -2", "M-34 34 Q0 78 34 34Z"],
     ].map(([label, eyes, mouth], index) => {
       const x = 108 + (index % 4) * 212;
       const y = 96 + Math.floor(index / 4) * 198;
       return `<g transform="translate(${x} ${y})"><circle r="70" fill="${SKIN}" stroke="${INK}" stroke-width="7"/><path d="${eyes}" transform="translate(-18 -8)" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="${eyes}" transform="translate(18 -8) scale(-1 1)" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="${mouth}" fill="${label === "웃음" ? "#d76572" : "none"}" stroke="#a74d5b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><text x="0" y="104" text-anchor="middle" font-family="system-ui,sans-serif" font-size="19" font-weight="700" fill="${SOFT_INK}">${label}</text></g>`;
     }).join("")}`,
  ),
]);
