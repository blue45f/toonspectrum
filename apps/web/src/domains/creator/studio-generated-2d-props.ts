/** Generated placeable 2D prop vectors. */

import type { StudioElementItem } from "./studio-elements-catalog";
import {
  furnitureShadow,
  generatedElement as element,
  GOLD,
  GREEN,
  INK,
  PROP_DEFS,
} from "./studio-generated-2d-foundation";

export const STUDIO_GENERATED_PROP_ITEMS: readonly StudioElementItem[] = Object.freeze([
  element(
    "prop-desk-chair",
    "모던 데스크와 의자",
    "decor",
    ["소품", "가구", "책상", "의자", "오피스", "desk", "chair"],
    620,
    440,
    `${furnitureShadow(310, 396, 260, 28)}
     <g><path d="M72 144 H548 L520 206 H98Z" fill="url(#wood)" stroke="${INK}" stroke-width="10"/><path d="M122 202 L96 380 M498 202 L524 380" stroke="#5c3a31" stroke-width="22" stroke-linecap="round"/><rect x="380" y="210" width="122" height="94" rx="8" fill="#b77950" stroke="${INK}" stroke-width="9"/><circle cx="476" cy="258" r="8" fill="${GOLD}"/></g>
     <g transform="translate(224 216)"><path d="M30 72 Q98 12 166 72 V190 H30Z" fill="#6f82a0" stroke="${INK}" stroke-width="11"/><path d="M46 190 V332 M150 190 V332" stroke="${INK}" stroke-width="18" stroke-linecap="round"/><path d="M14 218 H182" stroke="${INK}" stroke-width="18" stroke-linecap="round"/></g>`,
    PROP_DEFS,
  ),
  element(
    "prop-laptop",
    "크리에이터 노트북",
    "decor",
    ["소품", "전자기기", "노트북", "작업", "laptop", "computer"],
    500,
    340,
    `${furnitureShadow(250, 306, 198, 22)}
     <g><rect x="92" y="34" width="316" height="212" rx="18" fill="#202b3f" stroke="${INK}" stroke-width="12"/><rect x="116" y="58" width="268" height="164" rx="8" fill="url(#laptopScreen)"/><path d="M54 250 H446 L414 302 H86Z" fill="url(#metal)" stroke="${INK}" stroke-width="11"/><rect x="190" y="264" width="120" height="20" rx="10" fill="#768797"/></g>
     <g fill="#fff" opacity="0.8"><circle cx="154" cy="100" r="8"/><rect x="178" y="92" width="82" height="16" rx="8"/><rect x="146" y="132" width="206" height="12" rx="6"/><rect x="146" y="158" width="150" height="12" rx="6"/></g>`,
    `<linearGradient id="laptopScreen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5bd4e8"/><stop offset="0.52" stop-color="#6577dd"/><stop offset="1" stop-color="#f28aac"/></linearGradient>${PROP_DEFS}`,
  ),
  element(
    "prop-plant",
    "잎이 풍성한 실내 화분",
    "decor",
    ["소품", "식물", "화분", "인테리어", "plant", "nature"],
    320,
    500,
    `${furnitureShadow(160, 466, 116, 22)}
     <path d="M160 394 C124 280 116 176 164 74 M160 394 C198 286 236 198 264 122 M160 394 C102 324 62 238 42 154 M160 394 C194 340 206 264 204 200" fill="none" stroke="#436a4a" stroke-width="16" stroke-linecap="round"/>
     <g fill="url(#leaf)"><path d="M164 80 C112 4 62 52 90 118 C114 166 154 138 164 80Z"/><path d="M260 126 C312 54 326 128 292 176 C260 218 222 176 260 126Z"/><path d="M44 158 C-10 92 0 196 42 236 C84 274 100 204 44 158Z"/><path d="M204 202 C238 126 286 170 266 238 C250 294 202 270 204 202Z"/><path d="M102 250 C42 206 30 282 80 324 C124 360 150 300 102 250Z"/><path d="M206 304 C262 250 290 326 246 370 C208 408 176 350 206 304Z"/></g>
     <path d="M86 364 H234 L210 474 H110Z" fill="#bd704e" stroke="${INK}" stroke-width="11"/><path d="M74 350 H246 V382 H74Z" fill="#df916a" stroke="${INK}" stroke-width="10"/>`,
    `<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8bd09b"/><stop offset="0.5" stop-color="#55a874"/><stop offset="1" stop-color="#2e7657"/></linearGradient>`,
  ),
  element(
    "prop-bicycle",
    "시티 바이시클",
    "decor",
    ["소품", "탈것", "자전거", "도시", "bicycle", "bike"],
    620,
    420,
    `${furnitureShadow(310, 382, 272, 22)}
     <g fill="none" stroke="${INK}" stroke-width="13"><circle cx="150" cy="286" r="102"/><circle cx="476" cy="286" r="102"/></g>
     <g fill="none" stroke="#cf5f49" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="M150 286 L260 120 L338 286 H150 L272 286 L410 154 L476 286"/><path d="M260 120 H368"/></g>
     <circle cx="338" cy="286" r="26" fill="${GOLD}" stroke="${INK}" stroke-width="10"/>
     <path d="M406 154 L392 92 M366 92 H442 M258 120 L224 92 M202 92 H256" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
     <path d="M232 78 H284 Q296 94 278 106 H226Z" fill="#3a4657" stroke="${INK}" stroke-width="8"/>`,
  ),
  element(
    "prop-vending-machine",
    "레트로 음료 자판기",
    "decor",
    ["소품", "자판기", "음료", "거리", "vending machine", "retro"],
    340,
    540,
    `${furnitureShadow(170, 510, 136, 22)}
     <g><rect x="54" y="24" width="232" height="470" rx="24" fill="url(#vending)" stroke="${INK}" stroke-width="12"/><rect x="82" y="66" width="176" height="206" rx="10" fill="#eef6f2" stroke="${INK}" stroke-width="9"/>
     ${Array.from({ length: 12 }, (_, index) => {
       const column = index % 4;
       const row = Math.floor(index / 4);
       const colors = ["#f1666d", "#5bbde3", "#f3c75b", "#70bd8c"];
       return `<g transform="translate(${96 + column * 40} ${84 + row * 58})"><rect width="24" height="42" rx="7" fill="${colors[column]}" stroke="${INK}" stroke-width="4"/><rect x="5" y="8" width="14" height="6" rx="3" fill="#fff" opacity="0.75"/></g>`;
     }).join("")}
     <rect x="82" y="302" width="96" height="62" rx="9" fill="#253249"/><rect x="194" y="302" width="64" height="62" rx="9" fill="#d9e3e8"/><circle cx="226" cy="332" r="12" fill="${GOLD}"/><rect x="86" y="396" width="168" height="58" rx="12" fill="#2f3949"/><path d="M112 425 H226" stroke="#e7edf0" stroke-width="12" stroke-linecap="round"/></g>`,
    `<linearGradient id="vending" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ea5e58"/><stop offset="0.55" stop-color="#c84252"/><stop offset="1" stop-color="#8f2e46"/></linearGradient>`,
  ),
  element(
    "prop-bookshelf",
    "책과 오브제가 있는 책장",
    "decor",
    ["소품", "가구", "책장", "책", "인테리어", "bookshelf", "book"],
    440,
    540,
    `${furnitureShadow(220, 514, 180, 22)}
     <rect x="50" y="30" width="340" height="454" rx="14" fill="url(#wood)" stroke="${INK}" stroke-width="12"/>
     <path d="M64 176 H376 M64 322 H376" stroke="#59392f" stroke-width="14"/>
     ${Array.from({ length: 18 }, (_, index) => {
       const row = Math.floor(index / 6);
       const column = index % 6;
       const heights = [82, 98, 72, 106, 88, 94];
       const colors = ["#e86f66", "#5f8ed7", "#f2c55d", "#69af83", "#8a6bc3", "#d88951"];
       const x = 82 + column * 47;
       const y = 164 + row * 146 - heights[(index + row) % heights.length];
       return `<rect x="${x}" y="${y}" width="${28 + (index % 2) * 5}" height="${heights[(index + row) % heights.length]}" rx="4" fill="${colors[(index + column) % colors.length]}" stroke="${INK}" stroke-width="5"/>`;
     }).join("")}
     <g transform="translate(288 334)"><path d="M32 92 C-10 30 20 -8 58 10 C96 46 74 82 32 92Z" fill="${GREEN}"/><path d="M34 92 V34" stroke="#426d4c" stroke-width="7"/><path d="M4 88 H66 L56 130 H14Z" fill="#d9825f" stroke="${INK}" stroke-width="6"/></g>`,
    PROP_DEFS,
  ),
  element(
    "prop-cafe-set",
    "카페 테이블 세트",
    "decor",
    ["소품", "가구", "카페", "테이블", "의자", "coffee", "table"],
    620,
    420,
    `${furnitureShadow(310, 386, 264, 24)}
     <ellipse cx="310" cy="128" rx="152" ry="54" fill="url(#wood)" stroke="${INK}" stroke-width="11"/><path d="M310 178 V344 M246 356 H374" stroke="${INK}" stroke-width="20" stroke-linecap="round"/>
     <g transform="translate(72 146)"><path d="M24 48 Q88 -6 152 48 V176 H24Z" fill="#7188a7" stroke="${INK}" stroke-width="11"/><path d="M42 176 V240 M134 176 V240" stroke="${INK}" stroke-width="16" stroke-linecap="round"/></g>
     <g transform="translate(372 146)"><path d="M24 48 Q88 -6 152 48 V176 H24Z" fill="#d88a73" stroke="${INK}" stroke-width="11"/><path d="M42 176 V240 M134 176 V240" stroke="${INK}" stroke-width="16" stroke-linecap="round"/></g>
     <g transform="translate(252 64)"><ellipse cx="42" cy="48" rx="38" ry="16" fill="#fff" stroke="${INK}" stroke-width="7"/><path d="M8 48 V92 Q42 116 76 92 V48" fill="#f8f3e9" stroke="${INK}" stroke-width="7"/><path d="M76 60 Q116 58 102 92 Q90 106 72 94" fill="none" stroke="${INK}" stroke-width="8"/></g>
     <g transform="translate(334 64)"><ellipse cx="24" cy="30" rx="32" ry="12" fill="#f2dfbf" stroke="${INK}" stroke-width="6"/><path d="M-6 30 H54 L46 72 H2Z" fill="#e4c99e" stroke="${INK}" stroke-width="6"/></g>`,
    PROP_DEFS,
  ),
  element(
    "prop-bench-lamp",
    "공원 벤치와 가로등",
    "decor",
    ["소품", "공원", "벤치", "가로등", "street lamp", "bench"],
    620,
    500,
    `${furnitureShadow(310, 464, 260, 24)}
     <g transform="translate(44 190)"><path d="M28 44 H342 V104 H28Z M38 122 H332 V178 H38Z" fill="url(#wood)" stroke="${INK}" stroke-width="10"/><path d="M70 178 L44 258 M300 178 L326 258" stroke="${INK}" stroke-width="18" stroke-linecap="round"/><path d="M20 42 V194 M350 42 V194" stroke="#4d5967" stroke-width="15"/></g>
     <g transform="translate(452 34)"><path d="M62 110 V406" stroke="#364251" stroke-width="20" stroke-linecap="round"/><path d="M22 406 H102" stroke="#364251" stroke-width="20" stroke-linecap="round"/><path d="M8 110 H116 L94 32 H30Z" fill="#40505e" stroke="${INK}" stroke-width="10"/><path d="M30 110 H94 L82 54 H42Z" fill="#fff1a6" filter="url(#lampGlow)"/></g>`,
    `<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c98959"/><stop offset="1" stop-color="#774735"/></linearGradient><filter id="lampGlow" x="-140%" y="-140%" width="380%" height="380%"><feGaussianBlur stdDeviation="16" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  ),
]);
