/** Distinct, self-contained vector environments. No remote art, fonts, scripts or raster data. */
import type { BgScene } from "./studio-bg-scenes";

const W = 1280;
const H = 720;
const INK = "#233044";
const r = (x: number, y: number, w: number, h: number, fill: string, radius = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"/>`;
const p = (d: string, fill: string, stroke = "none", width = 2) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
const c = (x: number, y: number, radius: number, fill: string) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}"/>`;
const repeat = (count: number, draw: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => draw(index)).join("");
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, width = 2) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
const gradient = (id: string, top: string, bottom: string) =>
  `<linearGradient id="${id}" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
function plant(x: number, y: number, scale = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${scale})">`
    + p("M-25 0L-18 42H18L25 0Z", "#b57556", INK)
    + line(0, 0, 0, -90, "#496b54", 5)
    + p("M0-24Q-70-78-44-90Q-6-88 0-24M0-46Q58-106 65-66Q50-35 0-46M0-67Q-22-129 9-134Q38-117 0-67", "#598d6a", "#355a49", 2)
    + "</g>";
}
function windowFrame(x: number, y: number, w: number, h: number, fill = "#acd5e2"): string {
  return r(x - 8, y - 8, w + 16, h + 16, "#f4eee5", 3)
    + r(x, y, w, h, fill)
    + line(x + w / 2, y, x + w / 2, y + h, "#57707d", 5)
    + line(x, y + h * 0.6, x + w, y + h * 0.6, "#57707d", 4);
}
function room(back = "#e8dfd2", floor = "#aa8065"): string {
  return r(0, 0, W, H, back)
    + p("M0 0L255 146H1025L1280 0Z", "#faf1df")
    + p("M0 0L255 146V458L0 720Z", "#b5a89b")
    + p("M1280 0L1025 146V458L1280 720Z", "#d0c1b0")
    + p("M0 720L255 458H1025L1280 720Z", floor)
    + '<g clip-path="url(#floor)">'
    + repeat(9, (i) => line(640, 345, i * 160, 720, "#745f54", 1))
    + repeat(5, (i) => line(0, 490 + i * i * 12, 1280, 490 + i * i * 12, "#745f54", 1)) + "</g>";
}
function bookshop(): string {
  const books = ["#71978a", "#e0b371", "#b77770", "#8598b7", "#c4b79c"];
  return room()
    + windowFrame(415, 162, 450, 275, "url(#sky)")
    + repeat(7, (i) => r(427 + i * 62, 299 - (i % 3) * 21, 43, 138 + (i % 3) * 21, "#82989c"))
    + r(269, 155, 138, 320, "#705543") + r(873, 155, 138, 320, "#705543")
    + repeat(8, (row) => {
      const x = row < 4 ? 278 : 882;
      const y = 192 + (row % 4) * 72;
      return repeat(9, (i) => r(x + i * 13, y - 23 - i % 3 * 5, 10, 47 + i % 3 * 5, books[(i + row) % books.length]!))
        + r(x - 2, y + 24, 124, 7, "#c49a72");
    })
    + p("M210 566L891 566L1033 636H111Z", "#513e35")
    + p("M239 475H870L960 566H158Z", "#dbb185", INK)
    + r(196, 566, 28, 120, "#665043") + r(889, 566, 28, 120, "#665043")
    + repeat(6, (i) => p(`M${330 + i * 77} 495h52l18 28h-52Z`, books[i % books.length]!, "#f3dfc1", 3))
    + line(640, 0, 640, 180, INK, 4) + p("M570 227L615 174H665L710 227Z", "#bf8655", INK)
    + r(571, 225, 138, 7, "#ffe3a0", 4) + plant(1071, 565, 1.2)
    + p("M0 600L142 558L142 720H0Z", "#454d48");
}
function hospital(): string {
  return room("#dae7e8", "#a8bcbc")
    + r(255, 274, 770, 11, "#6faaa4")
    + r(520, 200, 240, 258, "#708f9c", 5)
    + r(530, 210, 106, 238, "#bfd8dd") + r(644, 210, 106, 238, "#bfd8dd")
    + r(548, 240, 70, 100, "#729cad", 6) + r(662, 240, 70, 100, "#729cad", 6)
    + r(614, 351, 9, 43, "#405c70", 3) + r(657, 351, 9, 43, "#405c70", 3)
    + r(598, 153, 84, 32, "#568e83", 3) + r(635, 159, 10, 20, "#edf8ea")
    + r(630, 164, 20, 10, "#edf8ea")
    + repeat(3, (i) => {
      const x = 20 + i * 76;
      const y = 110 + i * 36;
      return p(`M${x} ${y}l54 25v${415 - i * 89}l-54 42Z`, "#8ca8ac", "#597b87", 3)
        + line(x + 41, y + 132, x + 41, y + 155, "#f5faf5", 5);
    })
    + repeat(3, (i) => p(`M${1245 - i * 73} ${117 + i * 37}l-52 24v${406 - i * 90}l52 40Z`, "#b8ccd0", "#6c9198", 3))
    + repeat(3, (i) => p(`M${390 + i * 63} ${33 + i * 37}h${500 - i * 126}l-28 12H${418 + i * 63}Z`, "#fffdf0"))
    + r(795, 409, 208, 18, "#4a828d", 7) + r(795, 448, 208, 27, "#467681", 7)
    + repeat(3, (i) => r(807 + i * 75, 473, 7, 40, "#667883"))
    + plant(385, 446, 0.75)
    + r(72, 603, 153, 23, "#e4eded", 5) + r(80, 503, 18, 100, "#709498")
    + r(63, 460, 52, 57, "#e5ede4", 7);
}
function platform(): string {
  return r(0, 0, W, H, "url(#sky)")
    + repeat(12, (i) => r(i * 111, 275 - i % 4 * 33, 91, 190 + i % 4 * 33, "#739094"))
    + p("M0 325L819 348L1280 660V720H0Z", "#52616b")
    + p("M0 448L840 354L1280 548V720H0Z", "#a3aaa6")
    + p("M0 539L835 362L1280 570V612L835 381L0 578Z", "#edcd75")
    + p("M0 0H1120L824 165L0 115Z", "#344354")
    + p("M0 114L824 165L852 181L0 143Z", "#718590")
    + repeat(5, (i) => {
      const x = 96 + i * 166;
      const top = 135 + i * 8;
      const base = 603 - i * 50;
      return r(x, top, 20 - i * 2, base - top, "#3f5864")
        + line(x - 12, top + 35, x + 69, top + 74, "#3f5864", 8);
    })
    + p("M1280 155L907 256L858 352L1280 483Z", "#e3e9e1", INK, 3)
    + p("M1280 269L886 310L876 338L1280 397Z", "#467f9b")
    + repeat(5, (i) => p(`M${937 + i * 76} ${268 - i * 19}l48 -12v${39 + i * 7}l-48 5Z`, "#39566f", "#c3d5d6", 5))
    + p("M906 279L924 260V348L884 336Z", "#9eb6c0", INK, 2)
    + line(879, 395, 1118, 720, "#283b4d", 9) + line(902, 389, 1237, 720, "#283b4d", 9)
    + repeat(7, (i) => line(875 + i * 31, 407 + i * 43, 929 + i * 42, 399 + i * 43, "#435361", 9))
    + r(179, 382, 262, 44, "#365064", 5) + r(193, 426, 13, 112, "#435565")
    + r(409, 426, 13, 69, "#435565") + r(180, 463, 261, 21, "#6c8d9a", 4)
    + r(531, 197, 200, 49, "#233d4b", 3)
    + c(549, 221, 11, "#e7c169") + r(574, 210, 135, 6, "#cadad1", 3) + r(574, 226, 92, 5, "#9ab6b3", 3);
}
function neonAlley(): string {
  return r(0, 0, W, H, "url(#night)")
    + p("M0 0H480L579 430L0 720Z", "#293449")
    + p("M1280 0H825L704 430L1280 720Z", "#283044")
    + p("M0 720L579 430H704L1280 720Z", "#253e52")
    + repeat(6, (i) => r(60 + i * 67, 100 + i % 2 * 18, 43, 101, i % 2 ? "#617d8c" : "#be8e79"))
    + p("M0 327L447 360L481 498L0 638Z", "#586075", INK, 3)
    + p("M0 310L444 352L431 376L0 345Z", "#d38c94")
    + repeat(6, (i) => p(`M${i * 70} ${346 + i * 5}l49 3l10 ${170 - i * 19}l-49 15Z`, "#2b364b", "#727786", 2))
    + r(146, 217, 219, 86, "#283d4c", 8) + r(157, 227, 197, 65, "#92688d", 6)
    + repeat(5, (i) => r(174 + i * 34, 243, 19, 34, "#ffd0c5", 4))
    + p("M964 294L1249 238V569L876 461Z", "#263e51", "#567183", 4)
    + repeat(5, (i) => p(`M${973 + i * 48} ${311 - i * 8}l31 -5v${157 + i * 11}l-31 -10Z`, "#3b7e86"))
    + r(973, 67, 75, 219, "#8aaeb0", 9) + r(982, 76, 57, 201, "#acd7d3", 5)
    + repeat(4, (i) => r(996, 99 + i * 42, 29, 22, "#487c85", 4))
    + line(336, 128, 983, 113, "#131e30", 4)
    + repeat(6, (i) => c(440 + i * 76, 121 - i, 7, "#ffd7ac"))
    + repeat(24, (i) => line(20 + i * 55, 624 + i % 5 * 15, 91 + i * 50, 624 + i % 5 * 15, i % 2 ? "#89b9b7" : "#b17e9f", 3))
    + repeat(68, (i) => line((i * 97) % W, (i * 173) % H, (i * 97) % W - 8, (i * 173) % H + 25, "#95b4ce", 1));
}
function hanok(): string {
  return r(0, 0, W, H, "url(#sky)")
    + p("M0 386Q101 199 251 318Q410 202 549 292Q765 178 926 302Q1119 192 1280 278V720H0Z", "#91aaa0")
    + r(0, 427, W, 293, "#d4c5aa")
    + r(173, 257, 886, 260, "#eddbc0")
    + p("M112 282Q254 215 287 161H929Q984 236 1129 282Q829 310 622 282Q358 310 112 282Z", "#4c5d65", INK, 4)
    + repeat(23, (i) => line(302 + i * 27, 172, 158 + i * 40, 280, "#809094", 3))
    + p("M261 169Q405 176 613 148Q825 176 951 169", "none", "#263e4b", 8)
    + repeat(7, (i) => r(211 + i * 124, 291, 13, 224, "#7d5845"))
    + repeat(6, (i) => {
      const x = 230 + i * 124;
      return r(x, 313, 94, 172, "#735b4b") + r(x + 6, 319, 82, 160, "#e6d3ae")
        + repeat(4, (j) => line(x + 14 + j * 20, 319, x + 14 + j * 20, 479, "#a58a69", 2))
        + repeat(6, (j) => line(x + 6, 328 + j * 27, x + 88, 328 + j * 27, "#a58a69", 2));
    })
    + r(156, 510, 921, 20, "#8a7764") + p("M156 530H1077L1120 567H111Z", "#ad9880")
    + p("M551 567H716L845 720H410Z", "#a79880")
    + repeat(4, (i) => r(535 - i * 29, 586 + i * 31, 202 + i * 58, 21, "#cdc3ae", 7))
    + p("M64 633Q86 424 62 200L84 201Q123 365 104 633Z", "#5c5446")
    + repeat(8, (i) => c(23 + i * 29, 173 + i % 3 * 44, 65 - i % 3 * 9, i % 2 ? "#6e9479" : "#8eab82"))
    + plant(1064, 585, 0.7) + r(1139, 609, 69, 37, "#6f807b", 14);
}
function rooftop(): string {
  return r(0, 0, W, H, "url(#sunset)")
    + c(964, 246, 82, "#f7c48e")
    + repeat(15, (i) => {
      const x = i * 91;
      const top = 337 - i % 4 * 32;
      return r(x, top, 70, 163 + i % 4 * 32, "#77788e")
        + repeat(5, (j) => r(x + 13, top + 16 + j * 27, 40, 8, "#d7b69f"));
    })
    + r(0, 462, W, 258, "#b7a091") + r(0, 445, W, 34, "#ded0b7")
    + repeat(8, (i) => line(640, 445, i * 188, 720, "#938b83", 2))
    + repeat(4, (i) => line(0, 489 + i * i * 16, W, 489 + i * i * 16, "#938b83", 2))
    + p("M93 459V196L274 95L492 206V477Z", "#8caead", "#4c717b", 8)
    + p("M100 196L275 104L482 207Z", "#a9b6b1", "#547d7d", 5)
    + repeat(5, (i) => line(112 + i * 88, 211, 112 + i * 88, 469, "#577880", 6))
    + line(104, 331, 482, 342, "#577880", 6) + line(276, 105, 276, 464, "#577880", 6)
    + repeat(4, (i) => plant(147 + i * 95, 429, 0.72))
    + p("M652 544L1020 544L1103 590H613Z", "#795d4f", INK)
    + r(647, 590, 15, 89, "#524d49") + r(1044, 590, 15, 89, "#524d49")
    + plant(736, 537, 0.45) + plant(915, 537, 0.45)
    + r(1099, 492, 114, 81, "#8d6f5c", 8) + plant(1155, 493, 1.25)
    + line(565, 173, 1274, 261, "#4b4856", 3)
    + repeat(9, (i) => c(583 + i * 79, 189 + i * 10, 7, "#fff0c3"));
}
function laboratory(): string {
  return room("#d7e1df", "#869aa0")
    + windowFrame(302, 172, 249, 215, "#759aa8") + windowFrame(721, 172, 249, 215, "#8fb4bc")
    + r(575, 163, 121, 200, "#476672", 8)
    + repeat(4, (i) => r(590, 178 + i * 41, 90, 27, "#718e92", 4))
    + repeat(9, (i) => c(600 + i % 3 * 32, 192 + Math.floor(i / 3) * 41, 4, "#b8dfc0"))
    + p("M165 449H997L1162 560H70Z", "#b1c0bd", INK, 3)
    + r(101, 560, 1029, 117, "#789296")
    + repeat(7, (i) => r(120 + i * 145, 576, 127, 83, "#c3d1ca", 4)
      + r(164 + i * 145, 587, 39, 5, "#5f7c83", 3))
    + r(330, 338, 176, 116, "#2d4f60", 7) + r(339, 347, 158, 98, "#80b4b4", 3)
    + p("M351 419L370 402L391 412L410 367L431 421L452 395L480 410", "none", "#d6eee0", 4)
    + r(405, 454, 20, 30, "#436572") + r(374, 481, 83, 8, "#436572", 4)
    + p("M783 395L824 408L843 379L803 365Z", "#67868e", INK, 3)
    + p("M807 417Q749 439 791 481H830V492H742Q708 447 759 401Z", "#cdd8d0", "#4e6d7b", 4)
    + r(730, 492, 128, 15, "#4c6e7a", 5)
    + repeat(5, (i) => r(532 + i * 24, 438 - i % 2 * 13, 16, 55 + i % 2 * 13, "#c4e1dc", 6)
      + r(535 + i * 24, 468, 10, 22, i % 2 ? "#86b7a1" : "#80a9c8", 4))
    + r(521, 487, 146, 15, "#516f7b", 3)
    + repeat(4, (i) => p(`M${350 + i * 142} 79h95l-17 14h-71Z`, "#f3f4dc"));
}
function observatory(): string {
  return r(0, 0, W, H, "#303448")
    + p("M0 720V283Q0-185 640-103Q1280-185 1280 283V720Z", "#57566a")
    + p("M258 459V240Q258 38 640 29Q1022 38 1022 240V459Z", "#203b55", "#ada88e", 12)
    + repeat(46, (i) => c(290 + i * 71 % 693, 93 + i * 97 % 331, i % 4 === 0 ? 3 : 1.3, "#e7e0c1"))
    + p("M398 330Q660 14 900 298Q735 147 398 330Z", "#607b92")
    + line(640, 37, 640, 458, "#a6a28b", 7) + line(276, 281, 1004, 281, "#a6a28b", 7)
    + p("M0 720L250 459H1030L1280 720Z", "#756774")
    + `<ellipse cx="640" cy="599" rx="385" ry="96" fill="#4a4c63" stroke="#bcad82" stroke-width="4"/>`
    + `<ellipse cx="640" cy="599" rx="344" ry="78" fill="none" stroke="#bcad82" stroke-width="2"/>`
    + repeat(16, (i) => {
      const angle = i * Math.PI / 8;
      return c(640 + Math.cos(angle) * 363, 599 + Math.sin(angle) * 86, 4, "#d2bb82");
    })
    + c(638, 391, 102, "#5e8592") + c(608, 358, 43, "#759d9f")
    + `<ellipse cx="638" cy="391" rx="144" ry="47" fill="none" stroke="#d0bc89" stroke-width="8" transform="rotate(-28 638 391)"/>`
    + `<ellipse cx="638" cy="391" rx="49" ry="116" fill="none" stroke="#c5b17d" stroke-width="5" transform="rotate(-28 638 391)"/>`
    + p("M624 491H652L675 551H604Z", "#c5ad7e", INK, 3) + r(564, 551, 157, 21, "#c5ad7e", 8)
    + p("M983 445L1109 367L1134 412L1011 482Z", "#ad9680", INK, 3)
    + line(1021, 472, 997, 602, "#d0ba91", 7) + line(1021, 472, 1110, 612, "#d0ba91", 7)
    + line(1021, 472, 953, 573, "#d0ba91", 7)
    + repeat(5, (i) => r(45, 328 + i * 50, 124, 35, ["#897781", "#6f8d90", "#ad9979"][i % 3]!, 3))
    + r(44, 583, 145, 15, "#b5a083", 3);
}

const DEFINITIONS = gradient("sky", "#b8d7de", "#f0dfbc")
  + gradient("night", "#1d2640", "#53697d")
  + gradient("sunset", "#897c9c", "#f0bd9d")
  + '<clipPath id="floor"><path d="M0 720L255 458H1025L1280 720Z"/></clipPath>';
const SCENES = [
  ["bookshop", "햇살 드는 독립 서점", "서점 도서관 실내 일상 bookstore library interior", bookshop],
  ["hospital", "병원 진료실 복도", "병원 복도 현대 실내 hospital corridor medical", hospital],
  ["platform", "도심 기차역 승강장", "역 기차 승강장 도시 교통 station train platform city", platform],
  ["neon-alley", "네온 상점이 비치는 빗길 골목", "밤 야간 비 골목 거리 도시 night rain alley street", neonAlley],
  ["hanok", "한옥 툇마루와 안뜰", "한옥 전통 마당 정원 한국 hanok courtyard garden korea", hanok],
  ["rooftop", "노을빛 옥상 온실", "옥상 온실 정원 도시 노을 로맨스 rooftop greenhouse sunset romance", rooftop],
  ["laboratory", "연구실 실험 작업대", "연구실 과학 실험실 학교 실내 laboratory science school", laboratory],
  ["observatory", "판타지 천문 관측실", "판타지 천문 마법 별 실내 fantasy observatory magic stars", observatory],
] as const;

export const STUDIO_GENERATED_ENVIRONMENT_KEYWORDS: ReadonlyMap<string, readonly string[]> = new Map(
  SCENES.map(([id, , keywords]) => [`gen2d-bg-wave3-${id}`, Object.freeze(keywords.split(" "))]),
);

export const STUDIO_GENERATED_BG_SCENES_V3: readonly BgScene[] = Object.freeze(
  SCENES.map(([id, label, , draw]) => Object.freeze({
    id: `gen2d-bg-wave3-${id}`, label, genre: "내장 환경", width: W, height: H,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${DEFINITIONS}</defs>${draw()}</svg>`,
  })),
);
export const STUDIO_GENERATED_2D_PACK_V3_INFO = Object.freeze({
  id: "toonstudio-vector-environments-wave3", version: 3, createdAt: "2026-09-13",
  assetCount: STUDIO_GENERATED_BG_SCENES_V3.length,
  sourceKind: "ai-assisted-native-vector", rightsStatus: "generated-in-project",
  externalResourceCount: 0, style: "illustrated-vector", width: W, height: H,
});
