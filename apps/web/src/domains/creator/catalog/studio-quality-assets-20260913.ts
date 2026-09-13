/** Original architectural illustrations; no remote images, fonts, filters or scripts. */
import { STUDIO_MARKETPLACE_PACKAGE_SCHEMA } from "../studio-marketplace-packages";
import {
  STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
  type StudioOriginalFreeAsset,
  type StudioOriginalFreeAssetPackage,
} from "../studio-original-free-asset-packs-base";

const C = { ink: "#283c46", paper: "#f6eddc", stone: "#d6c9b5", dark: "#20343e", wood: "#ac7451", leaf: "#397766", light: "#eac996", blue: "#87b8c5", brick: "#bd8070", rose: "#d49b8b" } as const;
const repeat = (n: number, draw: (i: number) => string): string => Array.from({ length: n }, (_, i) => draw(i)).join("");
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0): string => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const line = (d: string, color: string = C.ink, width = 3, opacity = 1): string => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
const path = (d: string, fill: string, opacity = 1): string => `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, opacity = 1): string => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}"/>`;
const group = (x: number, y: number, scale: number, body: string): string => `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;
const gradient = (id: string, a: string, b: string): string => `<linearGradient id="${id}" x2="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const defs = `<defs>${gradient("sky", "#83afb9", "#f0d8b6")}${gradient("glass", "#a0c3c4", "#4b7886")}${gradient("wall", "#f0dfc3", "#c0a68e")}${gradient("night", "#172b43", "#75627c")}${gradient("warm", "#f7d79a", "#b97e52")}${gradient("water", "#b8c9bd", "#497b83")}</defs>`;
const windowGrid = (x: number, y: number, w: number, h: number, cols = 3, rows = 3): string => rect(x - 6, y - 6, w + 12, h + 12, C.paper) + rect(x, y, w, h, "url(#glass)") + path(`M${x} ${y}h${w * .6}L${x} ${y + h * .8}Z`, "#fff", .15) + repeat(cols - 1, i => line(`M${x + w / cols * (i + 1)} ${y}v${h}`, C.paper, 5)) + repeat(rows - 1, i => line(`M${x} ${y + h / rows * (i + 1)}h${w}`, C.paper, 5));
const brickwork = (x: number, y: number, w: number, h: number, color: string = C.brick): string => rect(x, y, w, h, color) + repeat(Math.floor(h / 24), row => line(`M${x} ${y + row * 24}h${w}`, "#ead4bf", 1, .35) + repeat(Math.floor(w / 56), col => line(`M${x + col * 56 + (row % 2) * 28} ${y + row * 24}v24`, "#ead4bf", 1, .35)));
const plant = (): string => ellipse(100, 206, 77, 15, "#20343e", .14) + path("M56 145h88l-12 60H68Z", C.wood) + rect(49, 135, 102, 16, C.light, 5) + line("M100 138V46M100 104L61 68M100 91l40-47", C.leaf, 7) + repeat(9, i => { const x = 53 + (i * 37) % 93; const y = 32 + (i * 29) % 75; return `<ellipse cx="${x}" cy="${y}" rx="28" ry="14" transform="rotate(${i % 2 ? -35 : 35} ${x} ${y})" fill="${i % 2 ? "#689574" : C.leaf}"/>`; });
const bench = (): string => ellipse(210, 207, 195, 17, C.ink, .14) + repeat(4, i => rect(45, 52 + i * 22, 325, 15, i % 2 ? "#ae805c" : "#c49a6a", 3)) + path("M28 153h340l38 22H56Z", C.wood) + line("M75 74v118l-16 23M330 74v118l16 23M42 123v47M385 123v47", C.ink, 11) + repeat(3, i => line(`M${75 + i * 127} 57v68`, "#5c5749", 3));
const lamp = (): string => ellipse(100, 393, 70, 12, C.ink, .12) + rect(87, 98, 19, 281, C.ink, 5) + path("M59 380h76l13 15H44Z", C.ink) + path("M88 93L50 45h90l-35 48Z", "url(#warm)") + line("M48 43h94M64 29h62M78 18h34M57 46l14 43h52l14-43M96 18V6", C.ink, 7);
const bookcase = (): string => rect(31, 29, 354, 388, C.wood, 4) + rect(47, 42, 321, 350, "#735347") + repeat(4, row => repeat(13, i => { const h = 37 + (i * 11 + row * 13) % 31; const x = 58 + i * 23; const y = 108 + row * 86 - h; return rect(x, y, 17, h, [C.paper, C.blue, C.brick, C.leaf, C.light][(i + row) % 5], 1) + line(`M${x + 4} ${y + 8}h9M${x + 4} ${y + h - 7}h9`, "#fff", 1, .5); }) + rect(43, 108 + row * 86, 329, 9, "#bd966c")) + rect(21, 411, 374, 18, C.stone, 3);
const table = (): string => ellipse(206, 295, 162, 22, C.ink, .12) + line("M114 146L88 285M298 146l26 139M150 220h112", C.ink, 13) + ellipse(207, 147, 165, 50, "#815d46") + ellipse(207, 135, 165, 50, "#cfa373") + repeat(4, i => line(`M${100 + i * 57} 102v65`, "#986e4e", 2, .5));
const skyline = (y: number): string => repeat(14, i => { const x = i * 100 - 40; const h = 75 + (i * 43) % 190; return rect(x, y - h, 80, h, i % 2 ? "#789499" : "#8ea7a7") + repeat(3, col => repeat(Math.floor(h / 31) - 1, row => rect(x + 12 + col * 23, y - h + 15 + row * 31, 9, 13, "#c4d4c9"))); });
const ground = (): string => path("M0 540h1280v260H0Z", "#c4bdab") + repeat(6, i => line(`M0 ${557 + i * i * 9}h1280`, "#9c9e94", 2)) + repeat(12, i => line(`M640 540L${-450 + i * 200} 800`, "#9c9e94", 2));

function cafeStreet(): string {
  return rect(0, 0, 1280, 800, "url(#sky)") + ground() + brickwork(0, 30, 215, 510, "#cda68d") + brickwork(1040, 0, 240, 540, "#b69783") + rect(212, 95, 830, 455, "url(#wall)") + repeat(6, i => windowGrid(247 + i * 130, 124, 92, 108, 2, 2)) + rect(222, 279, 810, 230, C.dark) + windowGrid(264, 298, 261, 185, 3, 2) + windowGrid(721, 298, 261, 185, 3, 2) + windowGrid(573, 297, 105, 247, 1, 3) + line("M662 423v27", C.light, 5) + rect(237, 247, 770, 29, C.leaf) + repeat(22, i => path(`M${231 + i * 36} 266h36l12 52h-36Z`, i % 2 ? C.paper : "#618376")) + repeat(22, i => path(`M${243 + i * 36} 318h36v12q-18 15-36 0Z`, i % 2 ? C.paper : "#618376")) + rect(555, 210, 137, 40, C.ink, 5) + line("M577 223h92M592 236h63", C.light, 3) + group(227, 435, .66, plant()) + group(862, 435, .66, plant()) + group(82, 522, .7, table()) + group(886, 508, .68, table()) + group(1040, 180, 1.12, lamp()) + path("M454 535h70l17 100h-99Z", C.wood) + path("M462 548h53l11 69h-74Z", C.dark) + line("M470 565h34M469 580h38M466 595h44", C.paper, 3) + ellipse(825, 716, 80, 9, C.ink, .1);
}
function rainAlley(): string {
  return rect(0, 0, 1280, 800, "url(#night)") + skyline(406) + path("M550 398h180l550 402H0Z", "#354956") + path("M0 0h347l216 419L0 800Z", "#313947") + path("M1280 0H935L719 419l561 381Z", "#343b49") + repeat(6, i => { const s = 1 - i * .12; return group(60 + i * 68, 155 + i * 31, s, windowGrid(0, 0, 125, 140, 2, 2)) + group(1070 - i * 73, 110 + i * 47, s, windowGrid(0, 0, 110, 160, 2, 3)); }) + rect(120, 380, 170, 60, "#d88089", 8) + rect(1001, 300, 64, 177, "#75b6b5", 8) + line("M150 401h113M150 419h85", "#ffe4ce", 6) + repeat(4, i => line(`M1021 ${331 + i * 34}h24`, "#e2f1d1", 7)) + repeat(38, i => { const y = 432 + i * 9; const x = 260 + (i * 107) % 740; return line(`M${x} ${y}h${25 + (i * 31) % 170}`, i % 3 ? "#8babaa" : "#c88d99", 2 + i % 3, .18 + i % 4 * .08); }) + line("M25 150Q615 385 1214 100M70 172Q655 377 1199 140", "#1c2f39", 4) + repeat(85, i => line(`M${(i * 137) % 1280} ${(i * 53) % 740}l-13 40`, "#c7e1e2", 1, .26)) + path("M604 432h66l31 347H545Z", "#cba795", .12);
}
function metro(): string {
  return rect(0, 0, 1280, 800, "#e2dfd1") + path("M0 0h1280L758 336H522Z", "#aebbb7") + repeat(8, i => line(`M${i * 183} 0L640 347`, "#849c9d", 5)) + path("M0 800h1280L769 379H515Z", "#c6ccc2") + path("M0 561l523-188v87L0 712Z", "#263e4a") + path("M1280 544L769 374v99l511 255Z", "#263e4a") + line("M0 742L520 449M1280 757L772 455", "#dbb85b", 20) + repeat(6, i => { const s = .94 - i * .145; return group(45 + i * 97, 170 + i * 30, s, windowGrid(0, 0, 155, 265, 2, 2)) + group(1065 - i * 77, 151 + i * 35, s, windowGrid(0, 0, 155, 265, 2, 2)); }) + repeat(7, i => { const y = 80 + i * 38; const w = 580 - i * 72; return rect(640 - w / 2, y, w, 8, "#fff6d8", 2); }) + rect(466, 122, 348, 90, C.ink, 6) + line("M502 151h108M502 177h188M729 151h48M750 151v32m-11-12 11 12 11-12", C.paper, 7) + group(468, 378, .8, bench()) + repeat(5, i => line(`M${380 + i * 131} 800L640 415`, "#a1ada8", 2)) + rect(600, 342, 81, 9, "#d5ac60");
}
function readingRoom(): string {
  return rect(0, 0, 1280, 800, "url(#wall)") + ground() + path("M0 0h1280L980 144H300Z", "#725c4c") + repeat(6, i => line(`M${i * 250} 0L640 265`, "#b2997a", 7)) + group(-15, 95, 1.12, bookcase()) + group(875, 95, 1.12, bookcase()) + windowGrid(441, 77, 392, 408, 4, 4) + path("M433 85Q636-45 841 85", C.paper) + line("M436 79Q636-33 836 79", C.wood, 13) + group(141, 508, 1.07, table()) + group(697, 508, 1.07, table()) + group(394, 440, .74, plant()) + group(795, 438, .74, plant()) + line("M640 0v122", C.ink, 6) + path("M587 166l30-53h46l30 53Z", C.wood) + ellipse(640, 164, 53, 12, C.light) + path("M458 492h105l-80 191H238Z", "#fff5ce", .17);
}
function greenhouse(): string {
  return rect(0, 0, 1280, 800, "url(#sky)") + skyline(439) + path("M0 490h1280v310H0Z", "#b8bc9e") + path("M515 434h250l242 366H273Z", "#d9d4be") + repeat(7, i => { const inset = i * 63; return line(`M${43 + inset} 656V${218 + i * 24}Q640 ${-208 + i * 56} ${1237 - inset} ${218 + i * 24}V656`, "#496b63", 10 - i); }) + repeat(9, i => line(`M640 3L${35 + i * 151} 800`, "#63837a", 3, .75)) + repeat(4, i => { const y = 458 + i * 64; return rect(31, y, 329, 28, "#90775a") + rect(920, y, 329, 28, "#90775a"); }) + repeat(6, i => group(27 + i % 3 * 97, 323 + Math.floor(i / 3) * 124, .77, plant())) + repeat(7, i => group(925 + i % 3 * 90, 309 + Math.floor(i / 3) * 130, .77, plant())) + line("M583 254h114v180H583Z", C.ink, 7) + repeat(5, i => line(`M${355 + i * 136} 800L640 434`, "#b2b49f", 2));
}
function riverside(): string {
  return rect(0, 0, 1280, 800, "url(#sky)") + ellipse(936, 161, 65, 65, "#ffe8bb", .78) + skyline(386) + rect(0, 386, 1280, 258, "url(#water)") + repeat(43, i => line(`M${(i * 117) % 1230} ${399 + (i * 29) % 225}h${24 + i % 5 * 26}`, "#e1d4b4", 2, .4)) + path("M0 622l1280-108v286H0Z", "#bdb8a5") + line("M0 585l1280-103M0 614l1280-103", C.ink, 7) + repeat(23, i => line(`M${i * 59} ${585 - i * 4.75}v72`, C.ink, 5)) + group(679, 470, 1.1, bench()) + group(113, 220, 1.19, lamp()) + group(974, 248, .87, lamp()) + path("M0 0h220q120 74 20 168-117 65-240 14Z", "#60826b") + line("M0 104q155-47 260 49", "#5a6756", 20) + repeat(20, i => ellipse((i * 59) % 303, (i * 29) % 145, 30, 16, i % 2 ? "#729277" : "#527760")) + line("M0 751l1280-108M0 701l1280-108", "#d3ccba", 3);
}
function rooftop(): string {
  return rect(0, 0, 1280, 800, "url(#sky)") + skyline(445) + ground() + rect(0, 445, 1280, 97, "#e2dbc9") + rect(0, 441, 1280, 17, C.paper) + line("M0 471h1280", "#b5bcaf", 2) + rect(267, 248, 26, 326, C.wood) + rect(880, 248, 26, 326, C.wood) + rect(231, 234, 714, 24, "#895d47") + repeat(10, i => path(`M${238 + i * 71} 233l-61-92h30l61 92Z`, "#b58b66")) + group(371, 431, 1.07, bench()) + group(433, 517, .73, table()) + group(49, 407, 1, plant()) + group(1089, 388, 1.16, plant()) + group(207, 476, .69, plant()) + line("M260 270Q574 373 900 270", C.ink, 3) + repeat(9, i => ellipse(286 + i * 73, 281 + Math.sin(i / 8 * Math.PI) * 47, 8, 11, "#fff0bd")) + path("M178 760l246-178h393l227 178Z", "#527b76", .3);
}
function studioLoft(): string {
  return rect(0, 0, 1280, 800, "url(#wall)") + brickwork(0, 0, 408, 539, "#bb9480") + ground() + windowGrid(466, 57, 666, 379, 6, 4) + line("M437 0v541M1158 0v541", "#857f72", 14) + rect(66, 424, 555, 29, "#aa784f", 4) + line("M103 452v176M580 452v176M163 454v142", C.ink, 16) + rect(227, 282, 226, 133, C.ink, 8) + rect(239, 293, 202, 108, "#8db2b3", 3) + path("M331 414h23v14h42v8H288v-8h43Z", C.ink) + line("M148 422l-32-99 53-52M129 274l35 29", C.ink, 9) + path("M137 266l58 23-49 23Z", C.paper) + group(941, 398, 1.01, plant()) + group(770, 460, .76, table()) + rect(89, 63, 253, 164, C.paper, 4) + rect(105, 79, 221, 132, "url(#sky)") + path("M105 211l63-88 47 52 41-68 70 104Z", "#6c9188") + ellipse(277, 111, 17, 17, C.light) + rect(182, 635, 540, 83, "#779991", 11) + repeat(15, i => line(`M${195 + i * 35} 651v50`, C.paper, 2, .34)) + path("M737 441h260L707 614H477Z", "#fff7d5", .15);
}

interface Drawing { readonly slug: string; readonly name: string; readonly tags: readonly string[]; readonly body: string; readonly scene?: boolean }
const SCENES: readonly Drawing[] = [
  { slug: "cafe-street", name: "테라스 카페 거리", tags: ["거리", "카페", "상점", "street", "cafe"], body: cafeStreet(), scene: true },
  { slug: "rain-alley", name: "네온 빗길 골목", tags: ["거리", "밤", "비", "골목", "night", "rain"], body: rainAlley(), scene: true },
  { slug: "metro-platform", name: "도심 지하철 플랫폼", tags: ["역", "교통", "지하철", "station", "metro"], body: metro(), scene: true },
  { slug: "reading-room", name: "아치 창문 서재", tags: ["도서관", "서재", "실내", "library", "interior"], body: readingRoom(), scene: true },
  { slug: "botanical-house", name: "보태니컬 온실", tags: ["정원", "온실", "식물", "greenhouse", "garden"], body: greenhouse(), scene: true },
  { slug: "river-promenade", name: "강변 산책로", tags: ["산책로", "강", "도시", "공원", "river", "park"], body: riverside(), scene: true },
  { slug: "rooftop-garden", name: "도심 루프톱 정원", tags: ["옥상", "정원", "도시", "rooftop"], body: rooftop(), scene: true },
  { slug: "artist-loft", name: "햇살 드는 창작 작업실", tags: ["작업실", "오피스", "방", "studio", "office"], body: studioLoft(), scene: true },
];
const PROPS: readonly Drawing[] = [
  { slug: "slatted-bench", name: "목재 슬랫 공원 벤치", tags: ["벤치", "공원", "거리", "bench"], body: group(24, 145, 1.1, bench()) },
  { slug: "heritage-lamp", name: "클래식 사각 가로등", tags: ["가로등", "거리", "조명", "lamp"], body: group(135, 37, 1.05, lamp()) },
  { slug: "leaf-planter", name: "테라코타 잎 화분", tags: ["화분", "식물", "정원", "plant"], body: group(82, 34, 1.8, plant()) },
  { slug: "reading-bookshelf", name: "다단 원목 서가", tags: ["책장", "책", "도서관", "bookshelf"], body: group(38, 12, 1.08, bookcase()) },
  { slug: "patio-table", name: "원형 카페 테이블", tags: ["탁자", "카페", "테이블", "table"], body: group(24, 40, 1.1, table()) + group(192, 127, .24, plant()) },
  { slug: "coffee-cart", name: "캐노피 커피 카트", tags: ["카트", "카페", "거리", "coffee cart"], body: ellipse(255, 445, 204, 19, C.ink, .12) + rect(85, 231, 340, 170, C.leaf, 9) + rect(70, 219, 370, 22, C.wood, 5) + line("M105 92v127M405 92v127", C.ink, 10) + path("M69 108l36-67h300l37 67Z", C.paper) + repeat(9, i => path(`M${103 + i * 34} 42h17l${(i - 4) * 1.4} 66h-24Z`, "#b48066")) + rect(70, 107, 371, 22, "#d2bd9c", 3) + repeat(9, i => rect(106 + i * 36, 260, 5, 117, "#729889", 2)) + rect(192, 264, 129, 65, C.paper, 9) + line("M224 286h64M234 306h43", C.leaf, 5) + ellipse(131, 422, 34, 34, C.ink) + ellipse(131, 422, 18, 18, C.stone) + ellipse(382, 422, 34, 34, C.ink) + ellipse(382, 422, 18, 18, C.stone) + rect(150, 154, 113, 64, C.stone, 6) + rect(166, 166, 80, 17, C.dark, 3) + line("M178 189v15h56v-15", C.ink, 4) + rect(334, 170, 29, 45, C.paper, 3) + ellipse(349, 170, 15, 5, C.wood) },
  { slug: "glass-vending-machine", name: "유리 도어 자판기", tags: ["자판기", "거리", "소품", "vending"], body: ellipse(256, 473, 140, 15, C.ink, .12) + rect(120, 25, 274, 442, "#557f89", 15) + rect(137, 48, 240, 40, C.paper, 6) + line("M161 66h177", C.blue, 6) + rect(139, 103, 168, 269, C.dark, 6) + repeat(4, row => repeat(4, col => { const x = 150 + col * 38; const y = 127 + row * 57; return rect(x + 5, y - 9, 16, 10, C.stone, 2) + rect(x, y, 26, 35, [C.rose, C.blue, C.light, "#80a783"][(col + row) % 4], 4) + rect(x + 3, y + 11, 20, 13, C.paper, 1); }) + rect(147, 166 + row * 57, 151, 5, "#8b9c9d")) + path("M142 106h145L142 320Z", "#fff", .08) + rect(324, 131, 47, 47, C.dark, 4) + repeat(8, i => ellipse(334 + i % 2 * 27, 200 + Math.floor(i / 2) * 27, 7, 7, C.paper)) + rect(155, 393, 200, 46, C.dark, 7) + rect(169, 400, 172, 6, "#879898") + line("M136 464v11M377 464v11", C.ink, 14) },
  { slug: "commuter-bicycle", name: "바스켓 시티 자전거", tags: ["자전거", "거리", "교통", "bicycle"], body: ellipse(253, 415, 229, 15, C.ink, .12) + [114, 398].map(x => ellipse(x, 318, 85, 85, C.ink) + ellipse(x, 318, 73, 73, C.paper) + repeat(18, i => { const a = i * Math.PI / 9; return line(`M${x} 318l${Math.cos(a) * 70} ${Math.sin(a) * 70}`, "#9bafa9", 1.5); })).join("") + line("M114 318l73-125 82 125H114l192-109-37 109M305 185l93 133M305 184l22-66h47", C.leaf, 9) + line("M188 196l-10-38M149 157h64M265 318l-30 28h-18M306 193l24-68", C.ink, 7) + ellipse(269, 318, 19, 19, C.ink) + path("M348 138h108l-12 78h-84Z", "#b18a60") + repeat(6, i => line(`M${360 + i * 15} 143v62`, "#e6c9a0", 2)) + line("M353 168h97M359 190h86", C.light, 3) },
  { slug: "bus-shelter", name: "유리 버스 정류장", tags: ["정류장", "거리", "교통", "bus shelter"], body: ellipse(258, 447, 226, 20, C.ink, .12) + rect(63, 99, 365, 307, "url(#glass)", 4) + path("M68 103h331L68 366Z", "#fff", .13) + repeat(4, i => line(`M${67 + i * 120} 100v328`, C.ink, 10)) + rect(41, 73, 409, 27, C.ink, 7) + rect(50, 60, 390, 17, C.leaf, 5) + rect(316, 130, 84, 135, C.paper, 4) + line("M331 151h49M331 174h49M331 197h34M331 220h49M331 242h39", C.leaf, 4) + group(62, 295, .73, bench()) + rect(83, 119, 66, 40, C.light, 4) },
  { slug: "ticket-kiosk", name: "터치 교통 안내 키오스크", tags: ["키오스크", "역", "안내", "ticket kiosk"], body: ellipse(256, 462, 151, 18, C.ink, .12) + path("M151 39h208l34 411H120Z", "#d0d9d2") + rect(170, 63, 172, 65, C.leaf, 7) + line("M192 89h127M192 108h90", C.paper, 5) + rect(151, 151, 211, 160, C.ink, 9) + rect(164, 163, 185, 133, "#95bcb9", 4) + repeat(6, i => rect(178 + i % 2 * 81, 181 + Math.floor(i / 2) * 33, 66, 23, i % 2 ? C.paper : C.light, 4)) + rect(154, 339, 78, 19, C.ink, 3) + rect(277, 330, 68, 45, C.ink, 5) + line("M290 345h43M302 356h22", C.light, 4) + rect(172, 394, 169, 31, C.dark, 5) + rect(107, 450, 300, 15, C.ink, 4) },
  { slug: "rolling-suitcase", name: "리브드 여행 캐리어", tags: ["여행", "캐리어", "가방", "suitcase"], body: ellipse(255, 474, 128, 14, C.ink, .12) + line("M203 118V45h100v73", C.ink, 11) + rect(197, 24, 112, 25, C.wood, 8) + rect(142, 113, 223, 340, "#759c98", 23) + rect(155, 127, 193, 309, "#89ada3", 17) + repeat(6, i => rect(172 + i * 29, 146, 9, 265, "#668f8a", 4)) + line("M142 151v254M358 155v247", "#c9d4bd", 4) + rect(217, 101, 77, 16, C.ink, 6) + rect(363, 226, 20, 55, C.ink, 6) + ellipse(179, 462, 14, 19, C.ink) + ellipse(327, 462, 14, 19, C.ink) + group(272, 170, 1, rect(0, 0, 47, 71, C.paper, 4) + line("M9 17h29M9 30h29M9 43h18", C.wood, 3)) },
  { slug: "vinyl-record-player", name: "우드 턴테이블", tags: ["음악", "턴테이블", "레코드", "record player"], body: ellipse(254, 395, 214, 20, C.ink, .12) + path("M65 211h365v162H65Z", C.wood) + path("M65 211l42-86h294l29 86Z", "#d8b586") + ellipse(238, 207, 120, 71, C.ink) + repeat(7, i => `<ellipse cx="238" cy="207" rx="${49 + i * 10}" ry="${27 + i * 6}" fill="none" stroke="#52646a" stroke-width="1"/>`) + ellipse(238, 207, 34, 20, C.rose) + ellipse(238, 207, 5, 3, C.paper) + line("M372 165l-20 62-60 28", C.paper, 8) + rect(273, 246, 30, 17, C.ink, 4) + ellipse(376, 297, 22, 22, C.ink) + ellipse(376, 297, 11, 11, C.stone) + line("M96 287h209M96 304h209M96 321h209", "#734e3d", 6) + path("M97 126V56h322v169", C.blue, .19) + line("M97 126V56h322v169", "#98b9b9", 3) },
  { slug: "cafe-lounge-sofa", name: "투 쿠션 라운지 소파", tags: ["소파", "가구", "실내", "sofa"], body: ellipse(256, 420, 214, 20, C.ink, .12) + rect(73, 133, 365, 204, "#9a695c", 37) + rect(90, 150, 157, 137, C.rose, 27) + rect(262, 150, 156, 137, "#c18a7a", 27) + rect(80, 283, 348, 88, "#c3907c", 17) + rect(38, 223, 65, 158, "#a87464", 21) + rect(410, 223, 64, 158, "#a87464", 21) + line("M254 288v73M98 345h312", "#8e6055", 3) + line("M89 382l-11 32M424 382l10 32", C.wood, 16) + path("M108 167l95-15 13 91-99 13Z", "#d8c8a8") + line("M127 182l56 47M139 166l55 49", "#c0ac8c", 3) },
  { slug: "drawing-desk", name: "스탠드 조명 작업 데스크", tags: ["책상", "작업실", "가구", "desk"], body: ellipse(256, 449, 222, 18, C.ink, .12) + rect(33, 249, 445, 24, "#bc9067", 5) + line("M69 275v156M445 275v156", C.ink, 17) + rect(316, 276, 126, 126, C.stone, 5) + line("M324 316h111M324 358h111M365 296h30M365 337h30M365 378h30", "#918878", 4) + rect(157, 121, 192, 117, C.ink, 7) + rect(168, 132, 170, 93, "#8eafb5", 2) + path("M242 238h20v10h37v8H205v-8h37Z", C.ink) + line("M104 246l-31-81 33-51", C.ink, 7) + path("M88 105l51 24-49 25Z", C.paper) + path("M117 156l-14 90h100Z", "#ffe9b8", .25) + rect(172, 261, 125, 4, C.paper, 1) + group(368, 152, .42, plant()) },
  { slug: "parcel-handtruck", name: "택배 상자 핸드트럭", tags: ["택배", "상자", "물류", "handtruck"], body: ellipse(258, 450, 173, 15, C.ink, .12) + line("M325 417V60h-93v44", C.leaf, 15) + path("M112 406h232v20H97Z", C.leaf) + rect(107, 252, 225, 149, "#c49d6e", 3) + rect(170, 135, 160, 111, "#ddbd8c", 3) + rect(205, 252, 38, 149, "#ead1a4") + rect(234, 135, 29, 111, "#f1dcbc") + rect(131, 285, 61, 47, C.paper, 2) + repeat(9, i => rect(137 + i * 5, 295, i % 3 ? 2 : 3, 22, C.ink)) + ellipse(158, 431, 35, 35, C.ink) + ellipse(158, 431, 17, 17, C.stone) + ellipse(331, 431, 35, 35, C.ink) + ellipse(331, 431, 17, 17, C.stone) },
  { slug: "street-drinking-fountain", name: "석재 공원 음수대", tags: ["공원", "거리", "음수대", "fountain"], body: ellipse(256, 458, 159, 20, C.ink, .13) + path("M180 220h153l25 210H157Z", "#c0c5b7") + rect(146, 425, 222, 27, "#8faaa5", 5) + ellipse(257, 213, 132, 47, "#829b96") + ellipse(257, 198, 132, 43, C.stone) + ellipse(257, 195, 104, 29, "#6c918f") + ellipse(257, 195, 86, 21, C.blue) + line("M257 184v-59q0-30 27-30h16", C.ink, 13) + line("M300 95v14", C.ink, 13) + line("M300 113q-18 5-20 48", "#e4f4ef", 5, .7) + line("M197 249l-12 152M316 249l12 152", "#e2e0ca", 5) },
];

function makeAsset(drawing: Drawing, packageId: string): StudioOriginalFreeAsset {
  const id = `original-quality-20260913-${drawing.slug}`;
  const width = drawing.scene ? 1280 : 512;
  const height = drawing.scene ? 800 : 512;
  // Every paint server is namespaced because multiple SVG previews may coexist in one DOM.
  const body = (defs + drawing.body)
    .replaceAll(' opacity="1"', "")
    .replaceAll(' rx="0"', "")
    .replace(/(-?\d+\.\d{4,})/gu, (value) => String(Number(Number(value).toFixed(3))))
    .replaceAll('id="', `id="${id}-`)
    .replaceAll("url(#", `url(#${id}-`);
  return Object.freeze({
    id, name: drawing.name, packageId, kind: "vector-asset", format: "image/svg+xml",
    contentFingerprint: `original-svg:quality-20260913:v1:${drawing.slug}`,
    category: drawing.scene ? "modern-background" : "daily-prop",
    tags: Object.freeze([...drawing.tags, "건축 일러스트", "벡터", "무료", drawing.scene ? "배경" : "소품"]),
    width, height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" stroke-linecap="round" stroke-linejoin="round" aria-label="${drawing.name}"><title>${drawing.name}</title>${body}</svg>`,
    origin: "original-procedural", license: STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
    placementPresets: drawing.scene ? ["background-cover", "current-view"] as const : ["pointer", "current-view"] as const,
  });
}
function makePackage(slug: string, name: string, summary: string, drawings: readonly Drawing[]): StudioOriginalFreeAssetPackage {
  const id = `original-quality-20260913-${slug}`;
  const includedItems = Object.freeze(drawings.map(drawing => makeAsset(drawing, id)));
  return Object.freeze({
    schema: STUDIO_MARKETPLACE_PACKAGE_SCHEMA, id, name, summary,
    category: slug === "architecture" ? "배경·건축" : "거리·생활 소품",
    tags: ["무료", "건축", "거리", "실내", "일상", "벡터"],
    kind: "vector-asset", access: "free", accessLabel: "무료", origin: "original-procedural",
    creator: { id: "toonspectrum-lab", name: "ToonSpectrum Lab", verified: true },
    version: "1.0.0", packageFingerprint: `original-pack:quality-20260913:${slug}:1.0.0`,
    compatibility: { studioVersion: ">=1.0.0", renderer: ["canvas2d", "svg"] as const, devices: ["desktop", "tablet", "mobile"] as const, formats: ["image/svg+xml"] },
    license: STUDIO_ORIGINAL_FREE_ASSET_LICENSE, includedItems,
    changelog: [{ version: "1.0.0", releasedAt: "2026-09-13", changes: [`서로 다른 원본 벡터 에셋 ${includedItems.length}종`, "고유 페인트 ID·외부 리소스 없는 SVG"] }],
    placementPresets: ["current-view", "pointer"] as const,
    availability: { catalog: "bundled", library: "local-only", payment: "unavailable", cloudSync: "unavailable", exportManifest: "local-only" } as const,
    updatedAt: "2026-09-13T00:00:00.000Z",
  });
}
export const STUDIO_QUALITY_2D_PACKAGES: readonly StudioOriginalFreeAssetPackage[] = Object.freeze([
  makePackage("architecture", "아키텍처 장면 컬렉션", "카페 거리·빗길 골목·지하철·서재·온실·강변·옥상·작업실의 독립된 8개 벡터 장면", SCENES),
  makePackage("street-and-living", "거리와 생활 디테일 소품", "실루엣·구조·용도가 서로 다른 16개 투명 배경 벡터 소품", PROPS),
]);
