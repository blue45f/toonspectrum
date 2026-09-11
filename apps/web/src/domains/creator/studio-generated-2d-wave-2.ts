/**
 * ToonStudio generated 2D library — wave 2.
 * Deterministic project-native SVG assets with no remote resources.
 */

import type { BgScene } from "./studio-bg-scenes";
import type { StudioElementItem } from "./studio-elements-catalog";
import {
  BLUE,
  characterBust,
  CYAN,
  deterministicPoints,
  generatedElement,
  generatedScene,
  GOLD,
  GREEN,
  INK,
  PAPER,
  PINK,
  PROP_DEFS,
  SKIN,
  SOFT_INK,
} from "./studio-generated-2d-foundation";

const svgText = (x: number, y: number, value: string, size = 22) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${size}" font-weight="750" fill="${SOFT_INK}">${value}</text>`;

function particles(seed: number, count: number, color: string, width = 720, height = 1080): string {
  return deterministicPoints(count, seed, width, height)
    .map(([x, y, scale], index) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.3 + scale * 2.8).toFixed(1)}" fill="${color}" opacity="${(0.32 + (index % 5) * 0.11).toFixed(2)}"/>`)
    .join("");
}

function windows(x: number, y: number, columns: number, rows: number, stepX: number, stepY: number, warm = GOLD): string {
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const lit = (index * 7 + row * 3) % 5 !== 0;
    return `<rect x="${x + column * stepX}" y="${y + row * stepY}" width="${Math.max(5, stepX - 8)}" height="${Math.max(7, stepY - 10)}" rx="2" fill="${lit ? warm : "#6681a6"}" opacity="${lit ? "0.88" : "0.36"}"/>`;
  }).join("");
}

const sceneDefs = (top: string, bottom: string, accent = "#fff4b8") =>
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="floor" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bottom}"/><stop offset="1" stop-color="#252b3b"/></linearGradient><filter id="glow" x="-180%" y="-180%" width="460%" height="460%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="halo"><stop stop-color="${accent}" stop-opacity="0.8"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`;

const platform = generatedScene(
  "bg-rain-platform",
  "비 내리는 도시 전철 승강장",
  "daily",
  `<rect width="720" height="1080" fill="url(#sky)"/><path d="M0 438 H86 V260 H166 V438 H222 V198 H310 V438 H374 V286 H458 V438 H520 V236 H610 V438 H720 V530 H0Z" fill="#26364e"/>${windows(24, 286, 3, 5, 22, 27)}${windows(242, 238, 3, 6, 23, 27)}${windows(542, 272, 3, 6, 21, 26)}<path d="M0 496 H720 V1080 H0Z" fill="url(#floor)"/><path d="M0 686 L720 598 V658 L0 756Z" fill="#f2c74f"/><path d="M0 736 L720 646" stroke="#fff2b3" stroke-width="10" stroke-dasharray="14 15"/><path d="M0 878 L720 722 M0 1018 L720 790" stroke="#151e2d" stroke-width="22"/><path d="M0 910 L720 754 M0 1050 L720 822" stroke="#aab5c4" stroke-width="8"/>${[76, 244, 412, 580].map((x) => `<g><path d="M${x} 128 V690" stroke="#34485f" stroke-width="26"/><circle cx="${x}" cy="238" r="24" fill="#fff1ad" filter="url(#glow)"/><path d="M${x - 48} 238 H${x + 48}" stroke="#f5f8ff" stroke-width="8" opacity=".72"/></g>`).join("")}<g transform="translate(104 554)"><path d="M0 44 H224 V98 H0Z M18 114 H206 V160 H18Z" fill="#627993" stroke="${INK}" stroke-width="8"/><path d="M36 160 L24 226 M188 160 L202 226" stroke="${INK}" stroke-width="14"/></g>${deterministicPoints(80, 91, 720, 1080).map(([x,y,s]) => `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x-10).toFixed(0)}" y2="${(y+28+s*20).toFixed(0)}" stroke="#d7efff" stroke-width="2" opacity=".48"/>`).join("")}`,
  sceneDefs("#233a59", "#879bb2"),
);

const rooftop = generatedScene(
  "bg-rooftop-garden",
  "노을빛 루프탑 정원",
  "romance",
  `<rect width="720" height="1080" fill="url(#sky)"/><circle cx="554" cy="286" r="104" fill="#ffe6a2"/><path d="M0 560 V410 H86 V560 H132 V360 H214 V560 H248 V444 H318 V560 H370 V324 H456 V560 H512 V396 H592 V560 H640 V342 H720 V560Z" fill="#535a78"/><path d="M0 552 H720 V1080 H0Z" fill="url(#floor)"/><path d="M0 548 V360 M72 548 V360 M144 548 V360 M216 548 V360 M288 548 V360 M360 548 V360 M432 548 V360 M504 548 V360 M576 548 V360 M648 548 V360 M720 548 V360 M0 390 H720 M0 476 H720" stroke="#45506a" stroke-width="9"/><g transform="translate(72 626)"><path d="M0 0 H258 V76 H0Z" fill="#9b6244" stroke="${INK}" stroke-width="10"/><path d="M18 76 H240 L216 192 H42Z" fill="#704c3b" stroke="${INK}" stroke-width="9"/>${[36,92,148,204].map((x,i)=>`<g transform="translate(${x} -34)"><path d="M0 58 C-28 18 -4 -28 22 8 C44 -24 68 22 36 60 C24 78 10 74 0 58Z" fill="${i%2?"#6ebb8c":"#4e9a72"}"/><path d="M18 62 V16" stroke="#37694f" stroke-width="6"/></g>`).join("")}</g><g transform="translate(388 664)"><ellipse cx="106" cy="38" rx="108" ry="34" fill="#b98059" stroke="${INK}" stroke-width="10"/><path d="M106 72 V218 M56 228 H156" stroke="${INK}" stroke-width="18"/><g transform="translate(-72 70)"><path d="M18 44 Q72 -2 126 44 V142 H18Z" fill="#748aa8" stroke="${INK}" stroke-width="9"/></g><g transform="translate(154 70)"><path d="M18 44 Q72 -2 126 44 V142 H18Z" fill="#d98f77" stroke="${INK}" stroke-width="9"/></g></g><path d="M54 254 C220 326 492 294 674 224" fill="none" stroke="#2f374c" stroke-width="7"/>${Array.from({length:12},(_,i)=>`<circle cx="${72+i*52}" cy="${300+Math.sin(i*.7)*28}" r="13" fill="${i%3===0?GOLD:i%2?PINK:CYAN}" filter="url(#glow)"/>`).join("")}`,
  sceneDefs("#5969a8", "#efb27f", "#ffb6d0"),
);

const kitchen = generatedScene(
  "bg-cozy-kitchen",
  "아침 햇살이 드는 코지 키친",
  "daily",
  `<rect width="720" height="1080" fill="url(#sky)"/><path d="M0 770 H720 V1080 H0Z" fill="#c8a47e"/>${Array.from({length:9},(_,i)=>`<path d="M${i*92-24} 770 L${i*92+46} 1080" stroke="#a78163" stroke-width="5" opacity=".58"/>`).join("")}<g transform="translate(72 120)"><rect width="286" height="306" rx="12" fill="#dfeaf2" stroke="${INK}" stroke-width="12"/><path d="M143 0 V306 M0 153 H286" stroke="#6d849a" stroke-width="9"/><circle cx="218" cy="76" r="42" fill="#fff2ad"/><path d="M0 246 Q86 180 156 234 T286 224 V306 H0Z" fill="#81a978"/></g><g transform="translate(400 110)">${[0,138].map(x=>`<rect x="${x}" width="120" height="202" rx="12" fill="#f4efe5" stroke="${INK}" stroke-width="10"/><circle cx="${x+96}" cy="104" r="7" fill="#c99655"/>`).join("")}<path d="M-12 234 H274" stroke="#8a6750" stroke-width="20"/>${[0,58,116,174].map((x,i)=>`<rect x="${x}" y="254" width="42" height="${70+i*8}" rx="6" fill="${["#ee8c78","#78a9d8","#edc76e","#78b991"][i]}" stroke="${INK}" stroke-width="5"/>`).join("")}</g><g transform="translate(52 500)"><path d="M0 0 H616 V98 H0Z" fill="#e5c29c" stroke="${INK}" stroke-width="12"/><path d="M14 98 H602 V302 H14Z" fill="#e9e3d7" stroke="${INK}" stroke-width="10"/>${[36,194,352].map(x=>`<rect x="${x}" y="126" width="126" height="142" rx="9" fill="#f7f3ea" stroke="#7c6b5b" stroke-width="6"/>`).join("")}<rect x="492" y="112" width="92" height="176" rx="14" fill="#9badb7" stroke="${INK}" stroke-width="8"/></g><g transform="translate(190 842)"><ellipse cx="168" cy="56" rx="184" ry="56" fill="#b77b50" stroke="${INK}" stroke-width="11"/><path d="M168 112 V240 M98 250 H238" stroke="${INK}" stroke-width="19"/><g transform="translate(92 6)"><ellipse cx="38" cy="28" rx="36" ry="14" fill="#fff" stroke="${INK}" stroke-width="6"/><path d="M4 28 V72 Q38 94 72 72 V28" fill="#f7f1e5" stroke="${INK}" stroke-width="6"/></g></g><path d="M358 150 L546 516" stroke="#fff8cf" stroke-width="78" opacity=".20"/>`,
  sceneDefs("#fff8eb", "#dbc2b6"),
);

const detective = generatedScene(
  "bg-detective-office",
  "심야의 탐정 사무실",
  "mystery",
  `<rect width="720" height="1080" fill="url(#sky)"/><path d="M0 768 H720 V1080 H0Z" fill="#433a38"/><g transform="translate(402 78)"><rect width="256" height="344" fill="#1b2638" stroke="${INK}" stroke-width="12"/><circle cx="190" cy="82" r="48" fill="#e9eef6"/><path d="M0 246 L256 186 V344 H0Z" fill="#374960"/>${windows(30,214,4,4,50,28)}</g><g transform="translate(64 102)"><rect width="284" height="382" fill="#8a6b55" stroke="${INK}" stroke-width="12"/>${[[32,38,84,104,"#d6c4a5"],[158,32,92,122,"#b8cad3"],[48,194,112,132,"#d9b9a8"],[184,208,62,94,"#c9d3a2"]].map(([x,y,w,h,c],i)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" stroke="#56483e" stroke-width="5"/><circle cx="${Number(x)+12}" cy="${Number(y)+12}" r="5" fill="${i%2?"#e6696d":"#e5bb50"}"/>`).join("")}<path d="M54 84 C150 136 186 54 242 98 M92 246 C150 188 190 260 224 236 M108 136 L208 228" fill="none" stroke="#b94d58" stroke-width="5"/></g><g transform="translate(68 570)"><path d="M0 0 H490 L444 88 H42Z" fill="#8b5c43" stroke="${INK}" stroke-width="12"/><path d="M70 86 L42 390 M418 86 L454 390" stroke="#3b2a27" stroke-width="22"/><g transform="translate(294 -84)"><path d="M38 86 C14 8 82 -8 104 64" fill="none" stroke="${INK}" stroke-width="13"/><path d="M64 54 L136 104 L92 164 L18 112Z" fill="#d39d4c" stroke="${INK}" stroke-width="9"/><circle cx="70" cy="106" r="24" fill="#fff1a8" filter="url(#glow)"/></g></g><g transform="translate(566 528)"><rect width="112" height="332" rx="10" fill="#596273" stroke="${INK}" stroke-width="10"/>${[34,126,218].map(y=>`<rect x="16" y="${y}" width="80" height="64" rx="7" fill="#707b8e" stroke="#313a48" stroke-width="5"/>`).join("")}</g>` ,
  sceneDefs("#4b4a55", "#202631"),
);

const library = generatedScene(
  "bg-royal-library",
  "황금빛 왕실 대도서관",
  "fantasy",
  `<rect width="720" height="1080" fill="url(#sky)"/><path d="M0 858 H720 V1080 H0Z" fill="url(#floor)"/>${[30,472].map(x=>`<g transform="translate(${x} 176)"><rect width="218" height="668" rx="12" fill="#704737" stroke="${INK}" stroke-width="12"/>${[0,1,2,3].map(row=>`<path d="M14 ${146+row*130} H204" stroke="#4f302a" stroke-width="12"/>`).join("")}${Array.from({length:28},(_,i)=>{const c=i%7,r=Math.floor(i/7),h=72+(i*13)%42;return `<rect x="${22+c*26}" y="${142+r*130-h}" width="${18+(i%2)*4}" height="${h}" rx="3" fill="${["#9f3f47","#466c9f","#d0a451","#4f8767","#7b5a9b"][i%5]}"/>`;}).join("")}</g>`).join("")}<g transform="translate(254 128)"><path d="M0 250 V140 C0 -48 212 -48 212 140 V250Z" fill="#405176" stroke="${INK}" stroke-width="12"/><path d="M26 246 V142 C26 4 186 4 186 142 V246Z" fill="#a26b8e"/><circle cx="106" cy="92" r="44" fill="#fff4c0"/></g><g transform="translate(172 722)"><ellipse cx="188" cy="58" rx="202" ry="62" fill="#aa7147" stroke="${INK}" stroke-width="12"/><path d="M188 120 V272 M104 282 H272" stroke="${INK}" stroke-width="20"/><path d="M112 22 Q188 -22 264 22 L246 84 Q188 116 130 84Z" fill="#f1dfb9" stroke="${INK}" stroke-width="8"/></g><g transform="translate(258 32)"><path d="M102 0 V66" stroke="#66523f" stroke-width="12"/><path d="M28 82 H176 L144 136 H60Z" fill="#d5a63f" stroke="${INK}" stroke-width="9"/>${[54,102,150].map(x=>`<circle cx="${x}" cy="202" r="22" fill="#fff0a3" filter="url(#glow)"/>`).join("")}</g>` ,
  sceneDefs("#6c5060", "#292d45"),
);

const snow = generatedScene(
  "bg-snow-village",
  "별빛 아래 설원 마을",
  "winter",
  `<rect width="720" height="1080" fill="url(#sky)"/>${particles(202,48,"#fff",720,390)}<circle cx="564" cy="164" r="68" fill="#f4f7ff"/><circle cx="540" cy="144" r="68" fill="#46648d"/><path d="M0 508 L128 330 L236 494 L356 280 L492 500 L606 356 L720 522 V724 H0Z" fill="#89a2c2"/><path d="M0 522 L128 358 L164 416 L236 500 L356 304 L414 396 L492 508 L606 380 L720 534 V750 H0Z" fill="#d7e5f2"/><path d="M0 644 Q110 592 224 648 T450 638 T720 654 V1080 H0Z" fill="#f5f8fb"/>${[[70,600,150,"#a95d52"],[280,630,176,"#5d7796"],[512,590,164,"#7a5a88"]].map(([x,y,w,c],i)=>`<g transform="translate(${x} ${y})"><path d="M0 118 L${Number(w)/2} 28 L${w} 118 V276 H0Z" fill="${c}" stroke="${INK}" stroke-width="10"/><path d="M-14 116 L${Number(w)/2} 8 L${Number(w)+14} 116Z" fill="#f4f7fb" stroke="${INK}" stroke-width="8"/><rect x="${Number(w)*.18}" y="154" width="42" height="58" fill="#ffd982" filter="url(#glow)"/><rect x="${Number(w)*.64}" y="154" width="42" height="58" fill="#ffd982" filter="url(#glow)"/>${i===1?`<path d="M${Number(w)-20} 66 V-64" stroke="#4a5364" stroke-width="22"/><path d="M${Number(w)-36} -62 H${Number(w)-4}" stroke="#4a5364" stroke-width="20"/>`:""}</g>`).join("")}<path d="M0 862 Q148 804 300 868 T584 844 T720 870 V1080 H0Z" fill="#dfeaf2"/>`,
  sceneDefs("#172846", "#5b78a3"),
);

const canyon = generatedScene(
  "bg-sunset-canyon",
  "석양의 거대 협곡",
  "adventure",
  `<rect width="720" height="1080" fill="url(#sky)"/><circle cx="178" cy="250" r="96" fill="#ffd37b"/><path d="M0 570 L138 366 L250 500 L392 284 L520 510 L642 348 L720 438 V750 H0Z" fill="#9d5670"/><path d="M0 624 L118 468 L222 590 L360 404 L486 590 L626 452 L720 540 V780 H0Z" fill="#c8755b"/><path d="M0 570 C96 608 132 734 98 846 C68 946 82 1034 150 1080 H0Z" fill="#673b3e"/><path d="M720 540 C620 606 590 730 620 856 C644 960 622 1036 570 1080 H720Z" fill="#5c3540"/><path d="M150 1080 C226 954 292 854 360 772 C428 854 494 956 570 1080Z" fill="#b36b4f"/><path d="M360 770 C320 840 290 912 274 1080 H446 C430 912 400 840 360 770Z" fill="#5d4b53"/><path d="M70 914 C178 834 274 836 360 884 C446 832 548 828 650 906" fill="none" stroke="#dca46c" stroke-width="10" opacity=".65"/>${particles(34,26,"#ffe5a0",720,520)}`,
  sceneDefs("#78609e", "#f1a06f"),
);

const hangar = generatedScene(
  "bg-orbital-hangar",
  "행성 궤도의 SF 격납고",
  "sf",
  `<rect width="720" height="1080" fill="url(#sky)"/><circle cx="360" cy="286" r="226" fill="url(#halo)"/><circle cx="360" cy="286" r="146" fill="#77a9cc"/><path d="M232 300 Q360 222 488 300 Q412 414 232 300Z" fill="#d5e9f0" opacity=".68"/><path d="M0 0 H720 V162 H0Z M0 0 H116 V1080 H0Z M604 0 H720 V1080 H604Z" fill="#1d293b"/><path d="M116 162 H604 V636 H116Z" fill="none" stroke="#7186a3" stroke-width="18"/><path d="M0 620 H720 V1080 H0Z" fill="url(#floor)"/><path d="M360 620 V1080 M116 620 L40 1080 M604 620 L680 1080 M116 740 H604 M76 864 H644 M38 998 H682" stroke="#68cce3" stroke-width="6" opacity=".74"/><g transform="translate(182 668)"><path d="M0 120 L176 24 L356 120 L286 188 H72Z" fill="#536982" stroke="${INK}" stroke-width="12"/><path d="M126 112 L176 52 L230 112Z" fill="#b9dce8"/><path d="M176 24 V-74" stroke="#6cd8eb" stroke-width="7"/><circle cx="176" cy="-86" r="12" fill="#fff" filter="url(#glow)"/></g>${[72,648].map(x=>`<g transform="translate(${x} 700)"><rect width="68" height="214" rx="12" fill="#3b4d63" stroke="${INK}" stroke-width="8"/><circle cx="34" cy="52" r="18" fill="${CYAN}" filter="url(#glow)"/><path d="M18 100 H50 M18 126 H50 M18 152 H50" stroke="#92a8bb" stroke-width="6"/></g>`).join("")}`,
  sceneDefs("#07121f", "#263f5c", CYAN),
);

const underwater = generatedScene(
  "bg-underwater-ruins",
  "심해의 고대 유적",
  "fantasy",
  `<rect width="720" height="1080" fill="url(#sky)"/><circle cx="360" cy="-40" r="300" fill="url(#halo)"/><path d="M120 0 L252 1080 M310 0 L360 1080 M520 0 L448 1080" stroke="#b5f1e8" stroke-width="60" opacity=".10"/>${particles(307,52,"#a7efe6")}<path d="M0 792 Q122 742 240 796 T482 784 T720 800 V1080 H0Z" fill="#153f4d"/><g transform="translate(118 360)"><path d="M54 390 V120 H128 V390 M356 390 V120 H430 V390" fill="#4f7c78" stroke="${INK}" stroke-width="10"/><path d="M26 120 H156 L134 54 H48Z M328 120 H458 L436 54 H350Z" fill="#6c9690" stroke="${INK}" stroke-width="10"/><path d="M92 54 V0 M394 54 V0" stroke="#3e6967" stroke-width="18"/><path d="M128 390 C150 214 334 214 356 390" fill="none" stroke="#6f9690" stroke-width="34"/><path d="M82 390 H404" stroke="#99aaa1" stroke-width="20"/></g><g fill="#4c927e">${[48,136,576,662].map((x,i)=>`<path d="M${x} 1060 Q${x-46} ${886-i*18} ${x+12} ${744-i*12} Q${x+80} ${886-i*16} ${x} 1060Z"/>`).join("")}</g><g fill="none" stroke="#a5e8dc" stroke-width="6" opacity=".7">${[[92,330,22],[616,272,30],[548,514,18],[174,616,24]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x+22}" cy="${y-38}" r="${r*.55}"/>`).join("")}</g>` ,
  sceneDefs("#062f4c", "#0f6977", "#a7efe6"),
);

const lanternStreet = generatedScene(
  "bg-lantern-street",
  "등불 축제의 전통 거리",
  "historical",
  `<rect width="720" height="1080" fill="url(#sky)"/><circle cx="588" cy="142" r="58" fill="#fff2ca"/><path d="M0 486 H720 V1080 H0Z" fill="#57444a"/><path d="M0 486 L220 594 L360 1080 H0Z M720 486 L500 594 L360 1080 H720Z" fill="#293244"/><path d="M360 546 L360 1080" stroke="#b3977b" stroke-width="14" opacity=".55"/>${[[-20,254],[500,254],[-42,520],[476,520]].map(([x,y],i)=>`<g transform="translate(${x} ${y})"><path d="M0 112 L122 34 L244 112 V320 H0Z" fill="${i%2?"#795442":"#694b43"}" stroke="${INK}" stroke-width="10"/><path d="M-20 112 L122 16 L264 112" fill="none" stroke="#313142" stroke-width="28"/><rect x="38" y="150" width="54" height="106" fill="#f1d6ab" stroke="${INK}" stroke-width="7"/><rect x="150" y="150" width="54" height="106" fill="#f1d6ab" stroke="${INK}" stroke-width="7"/></g>`).join("")}<path d="M56 216 C220 284 496 284 664 216 M42 412 C220 466 500 466 680 412" fill="none" stroke="#3a3440" stroke-width="7"/>${Array.from({length:18},(_,i)=>{const row=Math.floor(i/9),x=76+(i%9)*72,y=248+row*202+Math.sin(i)*14;return `<g><path d="M${x} ${y-28} V${y}" stroke="#493846" stroke-width="6"/><rect x="${x-18}" y="${y}" width="36" height="48" rx="12" fill="${i%3===0?"#f06e67":i%2?"#e7a64c":"#e47891"}" stroke="${INK}" stroke-width="5"/><circle cx="${x}" cy="${y+24}" r="12" fill="#fff1aa" filter="url(#glow)"/></g>`;}).join("")}`,
  sceneDefs("#24355f", "#b45f6e", "#ffcf77"),
);

const artClass = generatedScene(
  "bg-art-classroom",
  "햇살 가득 미술 교실",
  "school",
  `<rect width="720" height="1080" fill="url(#sky)"/><path d="M0 784 H720 V1080 H0Z" fill="#c79d78"/><g transform="translate(58 90)"><rect width="354" height="308" fill="#b9d9e9" stroke="${INK}" stroke-width="12"/><path d="M118 0 V308 M236 0 V308 M0 154 H354" stroke="#738da1" stroke-width="8"/><circle cx="286" cy="74" r="46" fill="#fff2ad"/><path d="M0 254 Q90 204 176 252 T354 238 V308 H0Z" fill="#7da776"/></g><g transform="translate(452 100)"><rect width="210" height="296" rx="10" fill="#ece6d8" stroke="${INK}" stroke-width="10"/>${[22,88,154].map((x,i)=>`<g transform="translate(${x} 24)"><rect width="42" height="116" rx="7" fill="${["#e86f66","#5f8ed7","#f2c55d"][i]}" stroke="${INK}" stroke-width="5"/><path d="M8 18 H34" stroke="#fff" stroke-width="7"/></g>`).join("")}<path d="M22 190 H188 M22 224 H164 M22 258 H178" stroke="#9b8b7d" stroke-width="9"/></g>${[[90,500],[356,524],[164,790],[450,808]].map(([x,y],i)=>`<g transform="translate(${x} ${y})"><path d="M86 0 L24 238 M86 0 L148 238 M42 164 H130" stroke="#76533f" stroke-width="16" stroke-linecap="round"/><rect x="20" y="26" width="132" height="140" rx="7" fill="${["#e7d5b4","#cbdbe4","#e5c8d6","#d7dec1"][i]}" stroke="${INK}" stroke-width="9"/><path d="M42 136 Q78 64 130 112" fill="none" stroke="${[PINK,BLUE,GREEN,GOLD][i]}" stroke-width="18"/></g>`).join("")}<g transform="translate(292 404)"><ellipse cx="66" cy="26" rx="66" ry="22" fill="#eee6d9" stroke="${INK}" stroke-width="7"/>${[18,42,66,90,114].map((x,i)=>`<circle cx="${x}" cy="26" r="10" fill="${[PINK,BLUE,GREEN,GOLD,CYAN][i]}"/>`).join("")}</g>` ,
  sceneDefs("#fff7e8", "#e6d3c0"),
);

export const STUDIO_GENERATED_BG_SCENES_V2: readonly BgScene[] = Object.freeze([
  platform, rooftop, kitchen, detective, library, snow, canyon, hangar, underwater, lanternStreet, artClass,
]);

function prop(id: string, label: string, keywords: readonly string[], width: number, height: number, body: string, defs = PROP_DEFS): StudioElementItem {
  return generatedElement(`prop-${id}`, label, "decor", ["소품", ...keywords], width, height, body, defs);
}

export const STUDIO_GENERATED_PROP_ITEMS_V2: readonly StudioElementItem[] = Object.freeze([
  prop("modular-sofa", "모듈형 패브릭 소파", ["가구","소파","거실","sofa"], 620, 380, `<ellipse cx="310" cy="350" rx="270" ry="24" fill="#263246" opacity=".16"/><path d="M54 142 Q54 80 118 80 H502 Q566 80 566 142 V302 H54Z" fill="#7890ad" stroke="${INK}" stroke-width="12"/><path d="M42 182 H578 V310 H42Z" fill="#91a8c0" stroke="${INK}" stroke-width="12"/><path d="M206 184 V306 M414 184 V306" stroke="#536b86" stroke-width="9"/><path d="M96 310 V350 M524 310 V350" stroke="${INK}" stroke-width="18"/>`),
  prop("camera", "빈티지 레인지파인더 카메라", ["카메라","사진","빈티지","camera"], 480, 340, `<ellipse cx="240" cy="310" rx="190" ry="18" fill="#263246" opacity=".16"/><rect x="54" y="88" width="372" height="196" rx="24" fill="#2e3543" stroke="${INK}" stroke-width="12"/><rect x="78" y="56" width="114" height="54" rx="12" fill="#5d6570" stroke="${INK}" stroke-width="9"/><circle cx="246" cy="186" r="92" fill="#181d28" stroke="#98a5b2" stroke-width="16"/><circle cx="246" cy="186" r="58" fill="url(#lens)" stroke="${INK}" stroke-width="10"/><rect x="338" y="116" width="54" height="42" rx="8" fill="#d7e1e6"/><circle cx="110" cy="150" r="16" fill="${GOLD}"/>`,`<radialGradient id="lens"><stop stop-color="#8be3ee"/><stop offset=".48" stop-color="#435f91"/><stop offset="1" stop-color="#151c2b"/></radialGradient>`),
  prop("smartphone", "크리에이터 스마트폰", ["스마트폰","전화","모바일","phone"], 300, 500, `<ellipse cx="150" cy="474" rx="106" ry="16" fill="#263246" opacity=".16"/><rect x="48" y="20" width="204" height="430" rx="34" fill="#242d40" stroke="${INK}" stroke-width="12"/><rect x="68" y="62" width="164" height="334" rx="20" fill="url(#phone)"/><rect x="112" y="36" width="76" height="12" rx="6" fill="#7d8da0"/><circle cx="150" cy="422" r="14" fill="#94a1b1"/><path d="M92 126 H208 M92 166 H178 M92 206 H202" stroke="#fff" stroke-width="13" opacity=".78"/>`,`<linearGradient id="phone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${CYAN}"/><stop offset=".5" stop-color="${BLUE}"/><stop offset="1" stop-color="${PINK}"/></linearGradient>`),
  prop("bouquet", "계절 꽃다발", ["꽃","꽃다발","로맨스","bouquet"], 420, 520, `<ellipse cx="210" cy="490" rx="130" ry="18" fill="#263246" opacity=".14"/><path d="M112 236 L210 488 L308 236Z" fill="#e8d7bd" stroke="${INK}" stroke-width="10"/><path d="M210 466 C154 370 124 260 92 112 M210 466 C190 316 208 192 212 72 M210 466 C258 342 292 246 334 110 M210 466 C236 332 252 242 260 120" fill="none" stroke="#477558" stroke-width="11"/>${[[88,110,PINK],[212,72,GOLD],[334,110,"#b48bd4"],[260,120,"#ec7b70"],[138,162,"#f3a7c0"],[294,178,"#ffd97a"]].map(([x,y,c])=>`<g transform="translate(${x} ${y})"><circle cx="0" cy="-22" r="24" fill="${c}"/><circle cx="22" cy="0" r="24" fill="${c}"/><circle cx="0" cy="22" r="24" fill="${c}"/><circle cx="-22" cy="0" r="24" fill="${c}"/><circle r="16" fill="#fff0a5"/></g>`).join("")}<path d="M150 356 Q210 402 270 356" fill="none" stroke="#c2596c" stroke-width="24"/>`),
  prop("travel-case", "스티커가 붙은 여행 가방", ["여행","가방","캐리어","suitcase"], 400, 500, `<ellipse cx="200" cy="470" rx="150" ry="18" fill="#263246" opacity=".16"/><path d="M148 82 V24 H252 V82" fill="none" stroke="${INK}" stroke-width="18"/><rect x="66" y="76" width="268" height="350" rx="30" fill="#d98b62" stroke="${INK}" stroke-width="12"/><path d="M126 86 V416 M274 86 V416" stroke="#975b45" stroke-width="13"/><circle cx="110" cy="444" r="20" fill="#384557"/><circle cx="290" cy="444" r="20" fill="#384557"/><g stroke="${INK}" stroke-width="6"><path d="M150 160 l38-22 34 28-36 34Z" fill="${CYAN}"/><circle cx="256" cy="236" r="34" fill="${GOLD}"/><path d="M130 298 h98 l-22 58 h-58Z" fill="${PINK}"/></g>`),
  prop("ramen-set", "라멘과 교자 트레이", ["음식","라멘","교자","식사","ramen"], 560, 360, `<ellipse cx="280" cy="326" rx="230" ry="20" fill="#263246" opacity=".14"/><rect x="34" y="142" width="492" height="154" rx="28" fill="#704b3e" stroke="${INK}" stroke-width="11"/><ellipse cx="196" cy="176" rx="116" ry="72" fill="#f5eee2" stroke="${INK}" stroke-width="10"/><path d="M92 174 Q196 236 300 174" fill="#c9824e"/><path d="M124 154 Q196 108 268 154 M116 178 Q196 130 276 178" fill="none" stroke="#f1d075" stroke-width="11"/><circle cx="170" cy="158" r="24" fill="#f4e0a6"/><circle cx="238" cy="170" r="18" fill="#6eb078"/><g transform="translate(348 152)">${[0,62,124].map((x)=>`<path d="M${x} 72 Q${x+26} 10 ${x+52} 72 Q${x+26} 102 ${x} 72Z" fill="#e8c99c" stroke="${INK}" stroke-width="6"/>`).join("")}</g><path d="M354 94 L480 30 M370 110 L496 46" stroke="#5e4439" stroke-width="9"/>`),
  prop("synth", "스테이지 신시사이저", ["음악","키보드","신시사이저","synth"], 640, 400, `<ellipse cx="320" cy="366" rx="270" ry="22" fill="#263246" opacity=".16"/><path d="M74 92 H566 L590 248 H50Z" fill="#313b50" stroke="${INK}" stroke-width="12"/><rect x="102" y="124" width="436" height="62" rx="10" fill="#1e2a3d"/>${Array.from({length:14},(_,i)=>`<rect x="${82+i*34}" y="208" width="32" height="102" fill="#f6f3ed" stroke="${INK}" stroke-width="4"/>`).join("")}${Array.from({length:10},(_,i)=>`<rect x="${104+i*47}" y="208" width="22" height="62" fill="#202733"/>`).join("")}<path d="M126 302 L82 370 M514 302 L558 370" stroke="${INK}" stroke-width="18"/><circle cx="142" cy="154" r="16" fill="${PINK}"/><circle cx="190" cy="154" r="16" fill="${CYAN}"/><rect x="248" y="140" width="164" height="28" rx="8" fill="#5fd6c4"/>`),
  prop("lab-console", "SF 연구실 제어 콘솔", ["SF","연구실","콘솔","제어판","console"], 620, 450, `<ellipse cx="310" cy="420" rx="250" ry="20" fill="#263246" opacity=".16"/><path d="M82 152 H538 L572 360 H48Z" fill="#38495f" stroke="${INK}" stroke-width="12"/><rect x="118" y="34" width="384" height="202" rx="18" fill="#18263c" stroke="${INK}" stroke-width="11"/><rect x="144" y="62" width="150" height="136" rx="8" fill="url(#screen)"/><rect x="316" y="62" width="160" height="62" rx="8" fill="#24425d"/><rect x="316" y="138" width="160" height="60" rx="8" fill="#24425d"/>${[110,178,246,314,382,450].map((x,i)=>`<circle cx="${x}" cy="292" r="14" fill="${i%3===0?PINK:i%2?CYAN:GOLD}" filter="url(#glow)"/>`).join("")}<path d="M122 358 L98 420 M498 358 L522 420" stroke="${INK}" stroke-width="18"/>`,`<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#67d7e8"/><stop offset="1" stop-color="#586de0"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`),
  prop("food-kiosk", "야간 거리 푸드 키오스크", ["가게","키오스크","포장마차","거리","kiosk"], 620, 500, `<ellipse cx="310" cy="470" rx="270" ry="22" fill="#263246" opacity=".16"/><rect x="58" y="126" width="504" height="310" rx="16" fill="#855748" stroke="${INK}" stroke-width="12"/><path d="M34 126 H586 L536 46 H84Z" fill="#e27462" stroke="${INK}" stroke-width="12"/>${Array.from({length:8},(_,i)=>`<path d="M${70+i*64} 52 L${54+i*68} 126 H${118+i*64} L${134+i*60} 52Z" fill="${i%2?"#f6e4c5":"#d95f58"}"/>`).join("")}<rect x="96" y="178" width="428" height="142" rx="12" fill="#27394b"/><rect x="116" y="198" width="388" height="102" fill="#f8e4b8" opacity=".86"/>${[126,224,322,420].map((x,i)=>`<circle cx="${x}" cy="88" r="18" fill="${i%2?GOLD:PINK}" filter="url(#lamp)"/>`).join("")}<path d="M118 366 H502" stroke="#e6c28b" stroke-width="24"/>`,`<filter id="lamp"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`),
  prop("floor-lamp", "아치형 플로어 램프", ["조명","가구","램프","lamp"], 360, 540, `<ellipse cx="180" cy="510" rx="132" ry="18" fill="#263246" opacity=".16"/><path d="M86 472 C86 214 126 74 286 72" fill="none" stroke="#3f4b59" stroke-width="22" stroke-linecap="round"/><path d="M236 66 H326 L348 166 H214Z" fill="#d8a454" stroke="${INK}" stroke-width="10"/><path d="M238 166 H324 L304 232 H258Z" fill="#fff0a3" filter="url(#lamp)"/><path d="M44 486 H154" stroke="#3f4b59" stroke-width="26" stroke-linecap="round"/>`,`<filter id="lamp" x="-180%" y="-180%" width="460%" height="460%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`),
  prop("art-cart", "이동식 미술 도구 카트", ["미술","도구","카트","art cart"], 460, 520, `<ellipse cx="230" cy="490" rx="180" ry="18" fill="#263246" opacity=".16"/><rect x="58" y="150" width="344" height="284" rx="16" fill="#7192a0" stroke="${INK}" stroke-width="11"/><path d="M72 250 H388 M72 350 H388" stroke="#405d6b" stroke-width="10"/><circle cx="110" cy="458" r="28" fill="#2d3949"/><circle cx="350" cy="458" r="28" fill="#2d3949"/>${[92,156,220,284].map((x,i)=>`<g transform="translate(${x} 44)"><rect width="44" height="142" rx="10" fill="${[PINK,BLUE,GREEN,GOLD][i]}" stroke="${INK}" stroke-width="6"/><path d="M22 0 V-30" stroke="#76523e" stroke-width="8"/></g>`).join("")}<rect x="100" y="280" width="112" height="48" rx="8" fill="#f0d6ae"/><rect x="244" y="278" width="100" height="52" rx="8" fill="#dbe4e9"/>`),
  prop("fireplace", "고풍스러운 벽난로", ["벽난로","고전","인테리어","fireplace"], 560, 520, `<ellipse cx="280" cy="490" rx="230" ry="20" fill="#263246" opacity=".15"/><path d="M58 96 H502 V452 H58Z" fill="#aa8064" stroke="${INK}" stroke-width="12"/><path d="M22 76 H538 V132 H22Z" fill="#d2aa7f" stroke="${INK}" stroke-width="11"/><path d="M142 432 V252 C142 138 418 138 418 252 V432Z" fill="#3a2f31" stroke="${INK}" stroke-width="12"/><path d="M188 432 V280 C188 210 372 210 372 280 V432Z" fill="#211f26"/><path d="M280 398 C210 332 244 270 280 306 C316 250 362 326 280 398Z" fill="#ed6f4e"/><path d="M280 376 C248 340 266 316 280 330 C294 306 318 338 280 376Z" fill="#ffd262"/>`),
  prop("medical-cart", "병원 응급 처치 트롤리", ["병원","의료","트롤리","medical"], 460, 520, `<ellipse cx="230" cy="490" rx="180" ry="18" fill="#263246" opacity=".16"/><rect x="66" y="126" width="328" height="310" rx="16" fill="#dfe7ea" stroke="${INK}" stroke-width="11"/><path d="M80 220 H380 M80 314 H380" stroke="#8fa1aa" stroke-width="9"/><circle cx="112" cy="460" r="26" fill="#384557"/><circle cx="348" cy="460" r="26" fill="#384557"/><path d="M122 66 H338 V128 H122Z" fill="#f5f1e9" stroke="${INK}" stroke-width="9"/><path d="M230 76 V118 M208 97 H252" stroke="#d7565a" stroke-width="16"/><g transform="translate(110 246)"><circle cx="36" cy="32" r="22" fill="${CYAN}"/><rect x="86" y="10" width="138" height="44" rx="9" fill="#c5d2d7"/></g>`),
  prop("treasure-chest", "마법 보물 상자", ["판타지","보물","상자","treasure"], 520, 420, `<ellipse cx="260" cy="390" rx="210" ry="20" fill="#263246" opacity=".16"/><path d="M64 168 Q260 -6 456 168 V236 H64Z" fill="url(#wood)" stroke="${INK}" stroke-width="12"/><path d="M54 214 H466 V354 H54Z" fill="url(#wood)" stroke="${INK}" stroke-width="12"/><path d="M246 190 H274 V354 H246Z" fill="#d7a745"/><rect x="222" y="246" width="76" height="70" rx="12" fill="#e8bd5a" stroke="${INK}" stroke-width="8"/><circle cx="260" cy="280" r="12" fill="#5c4757"/><path d="M104 210 V354 M416 210 V354" stroke="#d7a745" stroke-width="18"/>${particles(54,22,"#fff2a8",520,250)}`),
  prop("neon-sign", "별빛 네온 사인", ["네온","간판","별","neon"], 500, 420, `<ellipse cx="250" cy="390" rx="190" ry="18" fill="#263246" opacity=".16"/><rect x="54" y="36" width="392" height="304" rx="28" fill="#20283b" stroke="${INK}" stroke-width="12"/><path d="M250 82 L286 166 L378 174 L308 232 L330 322 L250 274 L170 322 L192 232 L122 174 L214 166Z" fill="none" stroke="${PINK}" stroke-width="18" stroke-linejoin="round" filter="url(#neon)"/><circle cx="250" cy="204" r="36" fill="none" stroke="${CYAN}" stroke-width="13" filter="url(#neon)"/>`,`<filter id="neon" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`),
  prop("library-wall", "모듈형 라이브러리 월", ["책장","수납","도서관","library"], 660, 520, `<ellipse cx="330" cy="492" rx="280" ry="18" fill="#263246" opacity=".15"/><rect x="30" y="24" width="600" height="432" rx="16" fill="url(#wood)" stroke="${INK}" stroke-width="12"/>${[230,430].map(x=>`<path d="M${x} 38 V442" stroke="#5b382f" stroke-width="12"/>`).join("")}${[164,304].map(y=>`<path d="M44 ${y} H616" stroke="#5b382f" stroke-width="12"/>`).join("")}${Array.from({length:30},(_,i)=>{const col=i%10,row=Math.floor(i/10),x=56+col*54,y=154+row*140,h=58+(i*17)%68;return `<rect x="${x}" y="${y-h}" width="${28+(i%3)*4}" height="${h}" rx="3" fill="${["#d56e67","#638bd0","#e0ba5b","#67a97d","#8b6fba"][i%5]}"/>`;}).join("")}<g transform="translate(480 324)"><path d="M36 70 C0 14 38 -12 62 30 C92 -4 122 36 74 76Z" fill="${GREEN}"/><path d="M8 72 H100 L86 126 H22Z" fill="#d27b56" stroke="${INK}" stroke-width="6"/></g>`),
]);

interface CharacterSpec {
  readonly id: string;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly variant: Parameters<typeof characterBust>[1];
  readonly palette: Parameters<typeof characterBust>[0];
}

const characterSpecs: readonly CharacterSpec[] = [
  { id: "project-manager", label: "프로젝트 매니저 캐릭터", keywords: ["직장인","기획자","매니저","office"], variant: "office", palette: { hair: "#40342f", hairDark: "#241f22", outfit: "#41577a", accent: "#e56862", eye: "#4a3b38" } },
  { id: "barista", label: "따뜻한 카페 바리스타", keywords: ["카페","바리스타","앞치마","barista"], variant: "girl", palette: { hair: "#6d4738", hairDark: "#3d2d2b", outfit: "#7b9a75", accent: "#e5b75c", eye: "#556f54" } },
  { id: "detective", label: "도시 미스터리 탐정", keywords: ["탐정","미스터리","코트","detective"], variant: "boy", palette: { hair: "#303746", hairDark: "#191e2b", outfit: "#6c5d5b", accent: "#c9904d", eye: "#536b86" } },
  { id: "royal-guard", label: "왕실 근위 기사", keywords: ["기사","판타지","근위대","knight"], variant: "mage", palette: { hair: "#d8c0a0", hairDark: "#8c715d", outfit: "#4d5f8b", accent: "#e3bd55", eye: "#44648a" } },
  { id: "cyber-runner", label: "네온 시티 사이버 러너", keywords: ["사이버펑크","러너","SF","cyber"], variant: "street", palette: { hair: "#26304d", hairDark: "#11172a", outfit: "#272c44", accent: "#63dbe8", eye: "#e66fa0" } },
  { id: "fantasy-scholar", label: "고전 판타지 학자", keywords: ["학자","마법사","판타지","scholar"], variant: "mage", palette: { hair: "#a9886a", hairDark: "#604d43", outfit: "#6c5b91", accent: "#73c7a2", eye: "#5c4e82" } },
  { id: "medical-resident", label: "응급의학 레지던트", keywords: ["의사","병원","의료","doctor"], variant: "office", palette: { hair: "#34333c", hairDark: "#1d1f28", outfit: "#e8eef0", accent: "#68a6d1", eye: "#52677d" } },
  { id: "stage-idol", label: "별빛 스테이지 아이돌", keywords: ["아이돌","가수","무대","idol"], variant: "girl", palette: { hair: "#795b8f", hairDark: "#453755", outfit: "#f2a0bc", accent: "#f2ce5e", eye: "#725a9c" } },
];

export const STUDIO_GENERATED_CHARACTER_ITEMS_V2: readonly StudioElementItem[] = Object.freeze(
  characterSpecs.map((spec) => generatedElement(`character-${spec.id}`, spec.label, "decor", ["캐릭터", ...spec.keywords], 360, 500, characterBust(spec.palette, spec.variant))),
);

function guide(id: string, label: string, keywords: readonly string[], width: number, height: number, body: string): StudioElementItem {
  return generatedElement(`guide-${id}`, label, "panel", ["구조","드로잉",...keywords], width, height, `<rect x="10" y="10" width="${width-20}" height="${height-20}" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>${body}`);
}

const headTurns = guide("head-turns-8", "머리 회전 8방향 구조 시트", ["머리","얼굴","턴어라운드","head turn"], 900, 520, `${Array.from({length:8},(_,i)=>{const x=100+(i%4)*220,y=112+Math.floor(i/4)*220,turn=[-34,-14,14,34,-48,-24,24,48][i];return `<g transform="translate(${x} ${y})"><ellipse rx="64" ry="78" fill="#fff" stroke="${INK}" stroke-width="7"/><path d="M${turn} -68 V68 M-52 0 Q0 ${Math.abs(turn)*.22-8} 52 0" fill="none" stroke="${PINK}" stroke-width="3" stroke-dasharray="8 7"/><path d="M${-30+turn*.35} -8 Q${-16+turn*.4} -22 ${-2+turn*.42} -8 M${12+turn*.3} -8 Q${28+turn*.3} -22 ${42+turn*.22} -8" fill="none" stroke="${INK}" stroke-width="6"/><path d="M${turn*.58} 4 L${turn*.74-4} 28 L${turn*.6+8} 30" fill="none" stroke="${INK}" stroke-width="5"/>${svgText(0,112,`${i+1}`,18)}</g>`;}).join("")}`);

const handGestures = guide("hand-gestures", "손 제스처 구조 시트", ["손","손가락","제스처","hand"], 900, 500, `${[0,1,2,3,4,5].map((i)=>{const x=90+(i%3)*290,y=80+Math.floor(i/3)*220;return `<g transform="translate(${x} ${y})" fill="${SKIN}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"><path d="M44 150 C16 118 24 74 54 54 L66 ${10+i*4} Q76 -6 90 8 L88 62 L110 ${16+i*2} Q124 2 136 18 L116 78 L154 ${40-i*2} Q170 30 180 46 L132 104 C148 144 110 174 44 150Z"/>${svgText(102,198,["펼침","집기","가리킴","주먹","받치기","연기"][i],18)}</g>`;}).join("")}`);

const actionPoses = guide("dynamic-action", "다이내믹 액션 포즈 구조", ["액션","포즈","동세","action pose"], 900, 520, `${[[120,130,-26],[340,118,18],[570,136,-12],[774,126,28]].map(([x,y,lean],i)=>`<g transform="translate(${x} ${y}) rotate(${lean})" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"><circle cx="0" cy="0" r="34"/><path d="M0 34 V164 M0 72 L${i%2?90:-90} ${110+i*8} M0 74 L${i%2?-76:82} ${64+i*8} M0 164 L${i%2?74:-76} 292 M0 164 L${i%2?-88:84} ${252+i*10}"/><path d="M-42 62 Q0 38 42 62 L58 160 Q0 188 -58 160Z" stroke="${BLUE}" stroke-width="7"/></g>`).join("")}<path d="M70 430 C230 374 344 448 480 382 S740 366 842 420" fill="none" stroke="${PINK}" stroke-width="4" stroke-dasharray="12 9"/>`);

const fabricFolds = guide("fabric-folds", "의상 주름과 장력 구조", ["의상","주름","옷","fabric folds"], 900, 520, `${[0,1,2,3].map(i=>{const x=44+i*214;return `<g transform="translate(${x} 72)"><path d="M24 20 H176 L190 372 H10Z" fill="#eef1f4" stroke="${INK}" stroke-width="8"/><circle cx="${i%2?52:148}" cy="${i%2?72:54}" r="10" fill="${PINK}"/><circle cx="${i%2?146:56}" cy="${i%2?302:324}" r="10" fill="${PINK}"/>${Array.from({length:6},(_,j)=>`<path d="M${i%2?52:148} ${i%2?72:54} Q${82+j*10} ${130+j*34} ${i%2?146:56} ${i%2?302:324}" fill="none" stroke="${j%2?SOFT_INK:BLUE}" stroke-width="${3+j%3}"/>`).join("")}${svgText(100,414,["당김","눌림","비틀림","낙하"][i],18)}</g>`;}).join("")}`);

const lightPlanes = guide("face-light-planes", "얼굴 조명 면 분할 구조", ["얼굴","조명","명암","lighting"], 900, 500, `${[0,1,2,3].map(i=>{const x=112+i*220;return `<g transform="translate(${x} 86)"><ellipse cx="0" cy="120" rx="82" ry="104" fill="#fff" stroke="${INK}" stroke-width="8"/><path d="M0 18 V224 M-76 116 H76" stroke="#9aaabd" stroke-width="3" stroke-dasharray="8 7"/><path d="M0 18 L${i%2?76:-76} 116 L0 224Z" fill="${i===0?"#f6e1b8":i===1?"#bbd8e9":i===2?"#e3bfd2":"#b9c7d3"}" opacity=".84"/><path d="M0 18 L${i%2?-76:76} 116 L0 224Z" fill="#52627a" opacity="${.18+i*.12}"/>${svgText(0,280,["정면광","측면광","역광","하단광"][i],18)}</g>`;}).join("")}`);

const perspective = guide("two-point-interior", "2점 투시 실내 블로킹 구조", ["투시","실내","2점 투시","perspective"], 900, 520, `<circle cx="80" cy="244" r="9" fill="${PINK}"/><circle cx="820" cy="244" r="9" fill="${PINK}"/><path d="M80 244 H820" stroke="${PINK}" stroke-width="4" stroke-dasharray="10 8"/><path d="M450 64 V448" stroke="#9aaabd" stroke-width="3" stroke-dasharray="8 8"/><path d="M80 244 L450 64 L820 244 L450 448Z" fill="#eef1f4" stroke="${INK}" stroke-width="8"/><path d="M80 244 L450 280 L820 244 M450 64 V448" fill="none" stroke="${INK}" stroke-width="7"/><path d="M220 244 L450 152 L680 244 M220 244 L450 374 L680 244" fill="none" stroke="${BLUE}" stroke-width="5"/><rect x="346" y="208" width="208" height="166" fill="#fff" stroke="${INK}" stroke-width="7"/>${svgText(80,280,"소실점 A",18)}${svgText(820,280,"소실점 B",18)}`);

const expressions = guide("expression-12", "표정 변화 12종 구조 시트", ["표정","감정","얼굴","expression"], 900, 620, `${Array.from({length:12},(_,i)=>{const x=88+(i%4)*224,y=90+Math.floor(i/4)*176;const moods=["기쁨","슬픔","분노","놀람","수줍음","의심","집중","웃음","공포","평온","피곤","결의"];const mouth=i%4===0?`M-28 24 Q0 54 28 24`:i%4===1?`M-28 48 Q0 22 28 48`:i%4===2?`M-20 36 H20`:`M0 22 m-15 0 a15 22 0 1 0 30 0 a15 22 0 1 0 -30 0`;return `<g transform="translate(${x} ${y})"><circle r="62" fill="${SKIN}" stroke="${INK}" stroke-width="7"/><path d="M-36 -12 Q-18 ${i%3?-26:-2} -2 -12 M36 -12 Q18 ${i%3?-26:-2} 2 -12" fill="none" stroke="${INK}" stroke-width="7"/><path d="${mouth}" fill="none" stroke="#a74d5b" stroke-width="6"/>${svgText(0,94,moods[i],17)}</g>`;}).join("")}`);

const silhouettes = guide("silhouette-ratios", "캐릭터 실루엣 비율 구조", ["실루엣","비율","캐릭터 디자인","silhouette"], 900, 560, `${[[88,.72,"치비"],[268,.88,"청소년"],[462,1,"성인"],[680,1.12,"히어로"]].map(([x,s,label],i)=>`<g transform="translate(${x} 58) scale(${s})" fill="${["#8fa9c8","#75a98a","#b18fb9","#6d769e"][i]}" stroke="${INK}" stroke-width="8"><circle cx="80" cy="54" r="42"/><path d="M30 114 Q80 88 130 114 L146 286 Q80 324 14 286Z"/><path d="M32 142 L-10 264 M128 142 L170 264 M52 296 L28 442 M108 296 L132 442" fill="none" stroke="${INK}" stroke-width="24" stroke-linecap="round"/>${svgText(80,490,String(label),20)}</g>`).join("")}<path d="M28 520 H872" stroke="#9aaabd" stroke-width="4" stroke-dasharray="12 10"/>`);

export const STUDIO_GENERATED_GUIDE_ITEMS_V2: readonly StudioElementItem[] = Object.freeze([
  headTurns, handGestures, actionPoses, fabricFolds, lightPlanes, perspective, expressions, silhouettes,
]);

export const STUDIO_GENERATED_ELEMENT_ITEMS_V2: readonly StudioElementItem[] = Object.freeze([
  ...STUDIO_GENERATED_PROP_ITEMS_V2,
  ...STUDIO_GENERATED_CHARACTER_ITEMS_V2,
  ...STUDIO_GENERATED_GUIDE_ITEMS_V2,
]);

export const STUDIO_GENERATED_2D_PACK_V2_INFO = Object.freeze({
  id: "toonstudio-generated-2d-wave-2",
  version: 2,
  generatedAt: "2026-09-09",
  sourceKind: "ai-assisted-native-vector",
  rightsStatus: "generated-in-project",
  externalResourceCount: 0,
  backgroundCount: STUDIO_GENERATED_BG_SCENES_V2.length,
  propCount: STUDIO_GENERATED_PROP_ITEMS_V2.length,
  characterCount: STUDIO_GENERATED_CHARACTER_ITEMS_V2.length,
  guideCount: STUDIO_GENERATED_GUIDE_ITEMS_V2.length,
  elementCount: STUDIO_GENERATED_ELEMENT_ITEMS_V2.length,
  assetCount: STUDIO_GENERATED_BG_SCENES_V2.length + STUDIO_GENERATED_ELEMENT_ITEMS_V2.length,
});
