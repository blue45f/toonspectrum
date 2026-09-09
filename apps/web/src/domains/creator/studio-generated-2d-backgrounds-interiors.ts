/** Generated full-canvas 2D scene backgrounds. */

import type { BgScene } from "./studio-bg-scenes";
import {
  deterministicPoints,
  generatedScene as scene,
  GLOW_FILTER,
  windowGrid,
} from "./studio-generated-2d-foundation";

export const STUDIO_GENERATED_GENRE_BG_SCENES: readonly BgScene[] = Object.freeze([
  scene(
    "bg-magic-castle",
    "구름 위 마법 성",
    "판타지",
    `<rect width="720" height="1080" fill="url(#fantasySky)"/>
     ${deterministicPoints(34, 44, 720, 430).map(([x, y, scale]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.2 * scale).toFixed(1)}" fill="#fff6d8" opacity="${(0.5 + scale * 0.28).toFixed(2)}"/>`).join("")}
     <circle cx="566" cy="170" r="106" fill="url(#moon)" filter="url(#glow)"/>
     <g fill="#f5f1ff" opacity="0.92"><ellipse cx="148" cy="470" rx="174" ry="74"/><ellipse cx="320" cy="438" rx="188" ry="88"/><ellipse cx="560" cy="488" rx="214" ry="92"/></g>
     <path d="M104 742 C150 610 248 584 314 642 C362 536 492 520 558 630 C632 634 678 686 684 754 C592 826 166 838 74 756Z" fill="#59627e"/>
     <path d="M218 742 V420 H502 V742Z" fill="url(#stone)" stroke="#303552" stroke-width="12"/>
     <path d="M182 742 V514 H270 V742Z M450 742 V514 H538 V742Z" fill="#7a7699" stroke="#303552" stroke-width="12"/>
     <path d="M202 514 L226 404 L250 514Z M470 514 L494 394 L518 514Z M300 420 L360 284 L420 420Z" fill="#405a88" stroke="#303552" stroke-width="12"/>
     <path d="M322 742 V610 Q360 548 398 610 V742Z" fill="#1d2646" stroke="#303552" stroke-width="10"/>
     <g fill="#ffe783" filter="url(#glow)">${Array.from({ length: 12 }, (_, index) => `<rect x="${250 + (index % 4) * 70}" y="${456 + Math.floor(index / 4) * 70}" width="24" height="36" rx="12"/>`).join("")}</g>
     <path d="M332 748 C320 854 300 948 286 1080 H434 C420 946 398 850 388 748Z" fill="url(#waterfall)" opacity="0.88"/>
     <g fill="#efeaff" opacity="0.82"><ellipse cx="100" cy="890" rx="168" ry="76"/><ellipse cx="630" cy="920" rx="190" ry="84"/><ellipse cx="348" cy="1032" rx="250" ry="76"/></g>`,
    `<linearGradient id="fantasySky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#15183d"/><stop offset="0.5" stop-color="#5453a8"/><stop offset="1" stop-color="#e1b8f1"/></linearGradient><radialGradient id="moon"><stop stop-color="#fffbd5"/><stop offset="0.7" stop-color="#e8dcff"/><stop offset="1" stop-color="#a989df"/></radialGradient><linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b9b3d2"/><stop offset="0.5" stop-color="#7f7a9f"/><stop offset="1" stop-color="#5a587d"/></linearGradient><linearGradient id="waterfall" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b9f5ff"/><stop offset="1" stop-color="#759ee8" stop-opacity="0.2"/></linearGradient>${GLOW_FILTER}`,
  ),
  scene(
    "bg-neon-alley",
    "비 내리는 네온 골목",
    "드라마",
    `<rect width="720" height="1080" fill="url(#night)"/>
     <path d="M0 0 H246 L300 1080 H0Z" fill="#162032"/><path d="M720 0 H474 L420 1080 H720Z" fill="#1a2336"/>
     ${windowGrid(26, 80, 3, 9, 42, 56, 24, 4)}
     ${windowGrid(530, 58, 3, 10, 42, 52, 22, 5)}
     <path d="M290 1080 L342 390 H378 L430 1080Z" fill="url(#wetRoad)"/>
     <g filter="url(#neonGlow)"><rect x="34" y="210" width="174" height="104" rx="12" fill="#ff4fa3"/><path d="M58 244 H184 M58 278 H154" stroke="#fff" stroke-width="12" stroke-linecap="round"/><rect x="514" y="322" width="168" height="118" rx="12" fill="#4ce0ee"/><circle cx="558" cy="380" r="24" fill="none" stroke="#fff" stroke-width="10"/><path d="M602 354 V406 M628 354 V406" stroke="#fff" stroke-width="10" stroke-linecap="round"/></g>
     <g stroke="#84ecff" stroke-width="4" opacity="0.64">${deterministicPoints(72, 91, 720, 1080).map(([x, y, scale]) => `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 14 * scale).toFixed(1)}" y2="${(y + 42 * scale).toFixed(1)}"/>`).join("")}</g>
     <g fill="#2e3a4d">${Array.from({ length: 8 }, (_, index) => `<g transform="translate(${42 + index * 90} ${560 + (index % 2) * 50})"><rect x="-5" width="10" height="174" rx="4"/><path d="M-26 0 H26 L16 -38 H-16Z" fill="${index % 2 ? "#58e9f2" : "#ff72b8"}" filter="url(#neonGlow)"/></g>`).join("")}</g>
     <g opacity="0.65"><path d="M280 820 L318 524 H344 L320 886Z" fill="#ff4fa3"/><path d="M440 860 L396 544 H372 L408 924Z" fill="#4ce0ee"/></g>
     <ellipse cx="354" cy="974" rx="208" ry="54" fill="#7183aa" opacity="0.22"/>
     <path d="M118 878 Q176 780 234 878Z" fill="#0f1522"/><path d="M486 900 Q548 790 610 900Z" fill="#111827"/>`,
    `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#090d1f"/><stop offset="0.65" stop-color="#202845"/><stop offset="1" stop-color="#3c486b"/></linearGradient><linearGradient id="wetRoad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#22283a"/><stop offset="1" stop-color="#596581"/></linearGradient><filter id="neonGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  ),
]);
