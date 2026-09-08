/** Generated full-canvas 2D scene backgrounds. */

import type { BgScene } from "./studio-bg-scenes";
import {
  generatedScene as scene,
  windowGrid,
} from "./studio-generated-2d-foundation";

export const STUDIO_GENERATED_INTERIOR_BG_SCENES: readonly BgScene[] = Object.freeze([
  scene(
    "bg-creator-room",
    "야경이 보이는 창작자 작업실",
    "일상",
    `<rect width="720" height="1080" fill="url(#roomWall)"/>
     <rect x="54" y="92" width="612" height="430" rx="14" fill="#1c2843" stroke="#543f39" stroke-width="18"/>
     <rect x="72" y="110" width="576" height="394" fill="url(#windowNight)"/>
     <path d="M360 110 V504 M72 310 H648" stroke="#5c4b48" stroke-width="12"/>
     <g fill="#ffd86c">${windowGrid(92, 294, 9, 4, 22, 34, 32, 3)}</g>
     <rect x="40" y="536" width="640" height="544" fill="#d6b38c"/>
     <path d="M0 894 H720 V1080 H0Z" fill="#735247"/>
     <g><path d="M112 708 H590 V750 H112Z" fill="#7d4f3b"/><path d="M142 750 V984 M560 750 V984" stroke="#5c3a31" stroke-width="24"/><rect x="228" y="590" width="248" height="154" rx="10" fill="#263346" stroke="#111827" stroke-width="10"/><rect x="248" y="610" width="208" height="114" fill="url(#screen)"/><path d="M322 744 H382 L404 784 H300Z" fill="#2b3444"/></g>
     <g transform="translate(478 602)"><path d="M40 112 C-12 28 20 -34 72 -28 C126 12 108 74 40 112Z" fill="#68b482"/><path d="M42 108 V12" stroke="#416f50" stroke-width="10"/><ellipse cx="42" cy="134" rx="48" ry="20" fill="#8f5b42"/></g>
     <g transform="translate(78 620)"><rect width="104" height="142" rx="12" fill="#f8f0df" stroke="#4a3834" stroke-width="8"/><path d="M20 34 H84 M20 66 H70 M20 98 H78" stroke="#e1876f" stroke-width="8" stroke-linecap="round"/></g>
     <g transform="translate(264 788)"><path d="M28 0 H182 L204 42 H6Z" fill="#e9ecef" stroke="#3f4655" stroke-width="8"/><path d="M34 14 H176" stroke="#9097a4" stroke-width="8" stroke-dasharray="12 8"/></g>
     <g transform="translate(56 784)"><path d="M18 74 Q74 18 130 74 V214 H18Z" fill="#5f7795" stroke="#30394a" stroke-width="12"/><path d="M42 214 V270 M106 214 V270" stroke="#30394a" stroke-width="16" stroke-linecap="round"/></g>
     <circle cx="620" cy="610" r="42" fill="#ffd274" filter="url(#lampGlow)"/><path d="M620 650 V804" stroke="#56463f" stroke-width="14"/><path d="M566 610 H674 L650 550 H590Z" fill="#f0b85b"/>`,
    `<linearGradient id="roomWall" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f1dfc6"/><stop offset="1" stop-color="#c89f7c"/></linearGradient><linearGradient id="windowNight" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#18213d"/><stop offset="1" stop-color="#495d83"/></linearGradient><linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6bcff2"/><stop offset="0.5" stop-color="#746dd4"/><stop offset="1" stop-color="#f18bb4"/></linearGradient><filter id="lampGlow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="22" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  ),
  scene(
    "bg-school-corridor",
    "햇살이 드는 학교 복도",
    "학원",
    `<rect width="720" height="1080" fill="url(#corridorWall)"/>
     <path d="M0 1080 L300 460 H420 L720 1080Z" fill="url(#floor)"/>
     <path d="M0 0 H720 V180 H0Z" fill="#e7e6df"/>
     <path d="M0 180 H280 L300 460 L0 1080Z" fill="#d3d7da"/>
     <path d="M720 180 H440 L420 460 L720 1080Z" fill="#f2eee5"/>
     <g>${Array.from({ length: 5 }, (_, index) => `<g transform="translate(${18 + index * 52} ${238 + index * 52}) scale(${1 - index * 0.1})"><rect width="170" height="240" fill="#8fc5df" stroke="#667d88" stroke-width="10"/><path d="M85 0 V240 M0 120 H170" stroke="#eef8fc" stroke-width="7"/></g>`).join("")}</g>
     <g>${Array.from({ length: 5 }, (_, index) => `<g transform="translate(${526 - index * 32} ${238 + index * 48}) scale(${1 - index * 0.1})"><rect width="174" height="246" fill="#b88962" stroke="#76533d" stroke-width="10"/><circle cx="22" cy="124" r="8" fill="#f2d66e"/></g>`).join("")}</g>
     <path d="M300 460 H420" stroke="#b4b0a7" stroke-width="14"/>
     ${Array.from({ length: 10 }, (_, index) => `<path d="M${index * 72} 1080 L${330 + index * 6} 460" stroke="#b39d86" stroke-width="5" opacity="0.5"/>`).join("")}
     ${Array.from({ length: 8 }, (_, index) => `<path d="M0 ${520 + index * 70} H720" stroke="#f8f3e9" stroke-width="4" opacity="0.45"/>`).join("")}
     <path d="M0 710 L286 494 V774 L0 1016Z" fill="#ffe8a8" opacity="0.42"/>
     <path d="M0 850 L292 560 V656 L0 964Z" fill="#fff4c5" opacity="0.34"/>
     <g transform="translate(320 312)"><rect width="80" height="54" rx="8" fill="#5a715c"/><path d="M20 27 H60" stroke="#f4f0dc" stroke-width="8" stroke-linecap="round"/></g>`,
    `<linearGradient id="corridorWall" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f8f3e9"/><stop offset="1" stop-color="#d3d9dd"/></linearGradient><linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d6c4aa"/><stop offset="1" stop-color="#8c6f5a"/></linearGradient>`,
  ),
]);
