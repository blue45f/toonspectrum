/** Generated full-canvas 2D scene backgrounds. */

import type { BgScene } from "./studio-bg-scenes";
import {
  blossomCloud,
  generatedScene as scene,
  windowGrid,
} from "./studio-generated-2d-foundation";

export const STUDIO_GENERATED_CITY_BG_SCENES: readonly BgScene[] = Object.freeze([
  scene(
    "bg-cherry-street",
    "벚꽃이 흐드러진 도심 거리",
    "일상",
    `<rect width="720" height="1080" fill="url(#sky)"/>
     <circle cx="576" cy="156" r="74" fill="#fff4b7" opacity="0.9"/>
     <path d="M0 390 C180 330 340 360 720 292 V560 H0Z" fill="#b9d3e8" opacity="0.65"/>
     <g fill="#eaf2f7">${Array.from({ length: 11 }, (_, index) => `<rect x="${index * 72 - 18}" y="${268 + (index % 3) * 44}" width="78" height="${310 - (index % 3) * 30}" rx="4"/>`).join("")}</g>
     <g fill="#8aa8bf">${windowGrid(22, 340, 7, 5, 18, 25, 52, 4)}</g>
     <path d="M258 1080 L330 502 H390 L470 1080Z" fill="#576170"/>
     <path d="M0 1080 L286 498 H330 L258 1080Z" fill="#d9d7d0"/>
     <path d="M720 1080 L434 498 H390 L470 1080Z" fill="#d9d7d0"/>
     <path d="M330 1080 L356 520 H364 L390 1080Z" fill="#eef2f6" opacity="0.85"/>
     ${Array.from({ length: 8 }, (_, index) => `<path d="M${314 - index * 30} ${648 + index * 58} H${406 + index * 30} L${418 + index * 32} ${670 + index * 58} H${302 - index * 32}Z" fill="#fbfbf8" opacity="0.92"/>`).join("")}
     <g stroke="#553b35" stroke-width="18" stroke-linecap="round"><path d="M24 640 C74 438 144 306 258 210"/><path d="M696 646 C648 420 560 304 462 210"/></g>
     <g stroke="#6d4a42" stroke-width="8" stroke-linecap="round"><path d="M82 462 L246 280"/><path d="M638 470 L480 282"/><path d="M92 510 L284 400"/><path d="M624 520 L442 396"/></g>
     ${blossomCloud(11, 0, 162, 286, 360)}
     ${blossomCloud(29, 434, 160, 286, 360)}
     <g fill="#26394f">${Array.from({ length: 6 }, (_, index) => `<g transform="translate(${88 + index * 108} ${520 + (index % 2) * 24})"><rect x="-5" width="10" height="156" rx="5"/><path d="M-22 0 H22 L14 -28 H-14Z" fill="#fff4c1"/><circle cy="156" r="8"/></g>`).join("")}</g>
     <path d="M0 920 C160 860 250 940 354 900 C480 850 570 930 720 872 V1080 H0Z" fill="#a8cbd0" opacity="0.23"/>`,
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#75c8f4"/><stop offset="0.55" stop-color="#d9f1fb"/><stop offset="1" stop-color="#fff5e8"/></linearGradient>`,
  ),
  scene(
    "bg-seaside-terrace",
    "푸른 바다 전망 테라스",
    "힐링",
    `<rect width="720" height="1080" fill="url(#seaSky)"/>
     <circle cx="116" cy="142" r="72" fill="#fff6bd" opacity="0.95"/>
     <path d="M0 400 C100 362 200 422 310 374 C430 322 560 398 720 342 V650 H0Z" fill="#3eabd3"/>
     <path d="M0 470 C180 424 322 502 450 448 C548 406 644 452 720 430 V690 H0Z" fill="#167da9" opacity="0.78"/>
     <g fill="#526f78" opacity="0.72"><path d="M38 438 C100 376 166 382 218 436Z"/><path d="M472 418 C540 344 620 354 694 424Z"/></g>
     <path d="M0 650 H720 V1080 H0Z" fill="url(#deck)"/>
     ${Array.from({ length: 14 }, (_, index) => `<path d="M${index * 62 - 70} 1080 L${index * 40 + 118} 650" stroke="#6e4b38" stroke-width="4" opacity="0.52"/>`).join("")}
     <g><rect x="376" y="92" width="310" height="490" rx="10" fill="#f5efe5"/><rect x="402" y="122" width="258" height="386" fill="url(#glass)"/><path d="M488 122 V508 M574 122 V508 M402 316 H660" stroke="#684f42" stroke-width="10"/><path d="M356 92 H696 L646 40 H414Z" fill="#9a6045"/></g>
     <g transform="translate(80 690)"><ellipse cx="178" cy="242" rx="190" ry="38" fill="#5c473d" opacity="0.18"/><rect x="74" y="70" width="216" height="26" rx="13" fill="#b57a4d"/><path d="M94 96 L66 244 M272 96 L302 244" stroke="#674438" stroke-width="18" stroke-linecap="round"/><path d="M22 124 Q68 82 114 124 V220 H22Z" fill="#e8f0e8" stroke="#314b51" stroke-width="10"/><path d="M250 124 Q296 82 342 124 V220 H250Z" fill="#e8f0e8" stroke="#314b51" stroke-width="10"/><circle cx="180" cy="38" r="34" fill="#ffffff" stroke="#6b5144" stroke-width="8"/><path d="M168 14 C146 -26 194 -26 180 14" fill="none" stroke="#6b5144" stroke-width="8" stroke-linecap="round"/></g>
     <g transform="translate(20 500)"><path d="M58 260 C-18 142 10 52 90 18 C170 70 146 166 58 260Z" fill="#5fbd83"/><path d="M68 258 V78" stroke="#4d7655" stroke-width="12"/><ellipse cx="70" cy="284" rx="62" ry="28" fill="#905f45"/></g>`,
    `<linearGradient id="seaSky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#55b7ef"/><stop offset="0.46" stop-color="#d8f1fb"/><stop offset="0.47" stop-color="#52bdd9"/><stop offset="1" stop-color="#177aa5"/></linearGradient><linearGradient id="deck" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cf9b6b"/><stop offset="1" stop-color="#85553e"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dff7ff" stop-opacity="0.92"/><stop offset="0.58" stop-color="#7ccbe5" stop-opacity="0.58"/><stop offset="1" stop-color="#f9e9c9" stop-opacity="0.72"/></linearGradient>`,
  ),
]);
