/**
 * 16종 이모트의 16×16 픽셀 아트(문자열 비트맵)와 래스터라이저.
 *
 * - 월드(Phaser)는 rasterizeStudioSpaceEmote로 RGBA 텍스처를 만든다(emote-runtime).
 * - HUD는 studioSpaceEmotePixelRuns로 같은 그림을 SVG 사각형 줄로 그릴 수 있다.
 * - 이 파일의 색은 CSS 토큰이 아니라 픽셀 아트 자산의 고정 팔레트다. 테마가 바뀌어도 아이콘
 *   자체의 색(빨간 하트, 노란 전구 등)은 그대로여야 알아볼 수 있으므로 예외로 둔다.
 *   말풍선 배경·테두리처럼 UI에 해당하는 색은 런타임이 CSS 토큰에서 읽는다.
 */
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";

export const STUDIO_SPACE_EMOTE_ART_SIZE = 16;

/** 픽셀 아트 팔레트(자산 색). 키 한 글자 → #rrggbb. '.'은 투명이다. */
export const STUDIO_SPACE_EMOTE_PALETTE = Object.freeze({
  k: "#2a1f3d", // 외곽선: 짙은 인디고 잉크
  w: "#fffaf0", // 하이라이트
  r: "#ef476f", // 빨강(하트·느낌표)
  p: "#ff9fb8", // 분홍(볼·하이라이트)
  y: "#ffd166", // 노랑(얼굴·전구·별)
  o: "#f4a340", // 주황(얼굴 그림자)
  e: "#c9752a", // 따뜻한 그림자
  s: "#ffd0a8", // 피부
  d: "#e9a47c", // 피부 그림자
  b: "#4cc3ff", // 파랑(눈물·Z)
  c: "#a8e8ff", // 하늘색(움직임 선)
  v: "#a78bfa", // 보라(물음표·디스코볼)
  u: "#6d4fd8", // 짙은 보라(음표)
  g: "#5ad18a", // 초록(꽃가루)
  m: "#8a5a3b", // 커피
  n: "#5b3a26", // 짙은 갈색(입 안·커피 크레마)
  l: "#ece8f7", // 도자기
  h: "#b4acd0", // 도자기 그림자·김
} as const);

export type StudioSpaceEmotePaletteKey = keyof typeof STUDIO_SPACE_EMOTE_PALETTE;

const BITMAPS: Readonly<Record<StudioSpaceEmoteId, readonly string[]>> = Object.freeze({
  wave: [
    "................",
    "........kk....c.",
    ".c...kkksskkk..c",
    "c...kwsksskssk.c",
    "c...kssksskssk.c",
    "....ksskssksskc.",
    "..kkkssksskssk..",
    ".ksskssssssssk..",
    ".ksssssssssssk..",
    "..kksssssssssk..",
    "...kssssssssdk..",
    "...ksssssssddk..",
    "....kssssssdk...",
    ".....kssssdk....",
    "......kkkkk.....",
    "................",
  ],
  heart: [
    "................",
    "................",
    "...kkk....kkk...",
    "..krrrk..krrrk..",
    ".krpprrkkrrrrrk.",
    ".krpwrrrrrrrrrk.",
    ".krprrrrrrrrrrk.",
    ".krrrrrrrrrrrrk.",
    "..krrrrrrrrrrk..",
    "...krrrrrrrrk...",
    "....krrrrrrk....",
    ".....krrrrk.....",
    "......krrk......",
    ".......kk.......",
    "................",
    "................",
  ],
  party: [
    "............b...",
    "........y.......",
    "..........r.....",
    ".......g....g..y",
    "...........r.r..",
    "...k.....br.r...",
    "..krku........p.",
    "..kyrku....y....",
    ".kyyyrku.c......",
    ".kyyyyrku.cc.v..",
    ".kryyyyrku......",
    ".krryyyyrku...b.",
    ".krrryyyyrk.....",
    "kyyrrryykk......",
    "kyykkkkk........",
    ".kk.............",
  ],
  "thumbs-up": [
    "................",
    "......kk........",
    ".....kwsk.......",
    ".....kssk.......",
    "....ksssk.......",
    "....kssk........",
    "...kssskkkkkk...",
    "..kkssssssssdk..",
    "..kbkssssskkkk..",
    "..kbksssssssdk..",
    "..kbkssssskkkk..",
    "..kbksssssssdk..",
    "..kbkssssskkkk..",
    "..kbkkssssssdk..",
    "..kkk.kkkkkkk...",
    "................",
  ],
  laugh: [
    ".....kkk........",
    "...kkyyykkk.....",
    "..kyyyyyyyyk....",
    ".kyyyyyyyyyyk...",
    ".kyyyyyyyyyyyk..",
    "kyyyyyyyyyyyyyk.",
    "kyyyykyyyykyyyk.",
    "kybckykyykykcbyk",
    "kybyyyyyyyyyybok",
    "kbyyykkkkkkkyobk",
    ".kyyykwwwwwkook.",
    ".kyyyykrrrkoook.",
    "..kyyyykkkoook..",
    "...kyyyyyoook...",
    "....kyyyoook....",
    ".....kkkkkk.....",
  ],
  clap: [
    "........y.......",
    "........y.......",
    "..y...........y.",
    "...y..kk.k...y..",
    ".....ksskdk.....",
    ".y..kwsskddk...y",
    "...ksssskdddk...",
    "..kswssskddddk..",
    "..kssssskddddk..",
    "..kssssskddddk..",
    "..kssssskddddk..",
    "..kssssskddddk..",
    "..kssssskddddk..",
    "..ksssssdddddk..",
    "..ksssskkddddk..",
    "...kkkk..kkkk...",
  ],
  wow: [
    ".....kkk........",
    "...kkyyykkk.....",
    "..kyykkyykkk....",
    ".kyykyyyyyykk...",
    ".kyyyyyyyyyyyk..",
    "kyyyywkyyywkyyk.",
    "kyyyykkyyykkyyk.",
    "kyyyykkyyykkyyyk",
    "kyyyyyyyyyyyyyok",
    "kyypyyykkyyypook",
    ".kyyyyknnkyyook.",
    ".kyyyyknnkyoook.",
    "..kyyyykkyoook..",
    "...kyyyyyoook...",
    "....kyyyoook....",
    ".....kkkkkk.....",
  ],
  think: [
    "................",
    "........kkkk....",
    "....kkkkllllk...",
    "...kllllwwlllk..",
    "..kllllllllllk..",
    "..klllllllllllk.",
    "..klllllllllllk.",
    ".klllullullullk.",
    ".klllullullulllk",
    ".kllllllllllllk.",
    ".kllhhllllhhllk.",
    "..kkkkhhhkklkk..",
    ".kllk.kkk..k....",
    ".kllk...........",
    "klkk............",
    "klk.............",
  ],
  idea: [
    "........y.......",
    "...y...kk....y..",
    ".....kkyykk.....",
    "..y.kyyyyyyk..y.",
    "...kyywwyyyyk...",
    "...kyywyyyoyk...",
    "...kyyyyyyook...",
    ".y.kyyyooyyok..y",
    "...kyyyooooyk...",
    "....kyyyyoyk....",
    ".....kyyook.....",
    ".....khhhhk.....",
    ".....kllllk.....",
    "......khhk......",
    ".......kk.......",
    "................",
  ],
  dance: [
    "........h.......",
    "........h.......",
    "........h.......",
    ".p...kkkkkk....c",
    ".y..kccccvuk..y.",
    "...kccwcvuvuk...",
    "..kccwcvuvuvuk..",
    "..kcccvuvuvuvk..",
    "..kccvuvuvuvuk..",
    "y.kcvuvuvuvuvk.y",
    "..kvuvuvuvuvuk..",
    "..kuvuvuvuvuvk..",
    "...kuvuvuvuvk...",
    "....kuvuvuvk..y.",
    "..y..kkkkkk.....",
    "................",
  ],
  sparkles: [
    "................",
    "................",
    "............y...",
    "...........ywy..",
    "......k.....y...",
    ".....kyk........",
    ".....kyk........",
    ".....kwk........",
    "..kkkywykkk.....",
    ".kyyyywyyyyk....",
    "..kkkyyykkk.....",
    ".....kyk....c...",
    ".....kyk...cwc..",
    ".....kyk....c...",
    "......k.........",
    "................",
  ],
  question: [
    "......kkkk......",
    ".....kvvvvk.....",
    "....kvwvvvvk....",
    "...kvwvkkvvvk...",
    "...kvvk..kvvk...",
    "....kk...kvvk...",
    "........kvvvk...",
    ".......kvvvk....",
    "......kvvvk.....",
    "......kvvk......",
    "......kvvk......",
    ".......kk.......",
    "......kvvk......",
    "......kvvk......",
    ".......kk.......",
    "................",
  ],
  exclaim: [
    ".......kk.......",
    "......krrk......",
    ".....krwrrk.....",
    ".....krprrk.....",
    ".....krrrrk.....",
    "......krrk......",
    "......krrk......",
    "......krrk......",
    "......krrk......",
    ".......kk.......",
    "......krrk......",
    ".....krrrrk.....",
    "......krrk......",
    ".......kk.......",
    "................",
    "................",
  ],
  coffee: [
    "................",
    "................",
    "......h..h......",
    ".....h..h.......",
    "......h..h......",
    ".....h..h.......",
    "...kkkkkkkk.....",
    "..kmmmmmmmmkk...",
    "..klnnnnnnhhhk..",
    "..kllllllhhkkhk.",
    "..klwrlrlhhkkhk.",
    "..klwrrrlhhhhk..",
    "..klllrllhhkk...",
    "..kllllllhhk....",
    "..kkllllllkk....",
    ".khhhhhhhhhhk...",
  ],
  music: [
    "................",
    ".....kkkkkkkkk..",
    "....kuuvvuuuuuk.",
    "....kuuuuuuuuuk.",
    "....kuukkkkkuuk.",
    "....kuuk...kuuk.",
    "....kuuk...kuuk.",
    "....kuuk..kkuuk.",
    "....kuuk.kuuuuk.",
    "...kkuukkuvuuuk.",
    "..kuuuukkuuuuuk.",
    ".kuvuuukkuuuuk..",
    ".kuuuuuk.kkkk...",
    ".kuuuuk.........",
    "..kkkk..........",
    "................",
  ],
  sleep: [
    "............kvvk",
    ".............kvk",
    "........kkkkkvvk",
    ".......kcccckkk.",
    "........kkcck...",
    "........kcck....",
    ".kkkkkkkcccck...",
    "kbbbbbbkkkkk....",
    ".kkkkbbk........",
    "...kbbk.........",
    "..kbbk..........",
    ".kbbkkk.........",
    "kbbbbbbk........",
    ".kkkkkk.........",
    "................",
    "................",
  ],
});

export function studioSpaceEmoteBitmap(id: StudioSpaceEmoteId): readonly string[] {
  return BITMAPS[id];
}

function paletteRgb(key: string): readonly [number, number, number] | null {
  const hex = (STUDIO_SPACE_EMOTE_PALETTE as Readonly<Record<string, string>>)[key];
  if (!hex) return null;
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

const RASTER_CACHE = new Map<StudioSpaceEmoteId, Uint8ClampedArray>();

/** 16×16 RGBA(1024바이트). 투명 픽셀은 알파 0이다. 결과는 공유 캐시이므로 복사해서 쓴다. */
export function rasterizeStudioSpaceEmote(id: StudioSpaceEmoteId): Uint8ClampedArray {
  const cached = RASTER_CACHE.get(id);
  if (cached) return new Uint8ClampedArray(cached);
  const size = STUDIO_SPACE_EMOTE_ART_SIZE;
  const data = new Uint8ClampedArray(size * size * 4);
  const rows = BITMAPS[id];
  for (let y = 0; y < size; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < size; x += 1) {
      const rgb = paletteRgb(row.charAt(x));
      if (!rgb) continue;
      const offset = (y * size + x) * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }
  RASTER_CACHE.set(id, data);
  return new Uint8ClampedArray(data);
}

export interface StudioSpaceEmotePixelRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly color: string;
}

const RUN_CACHE = new Map<StudioSpaceEmoteId, readonly StudioSpaceEmotePixelRun[]>();

/** 같은 색이 가로로 이어진 픽셀을 한 줄로 묶는다. 16×16 좌표, color는 #rrggbb 팔레트 값이다. */
export function studioSpaceEmotePixelRuns(id: StudioSpaceEmoteId): readonly StudioSpaceEmotePixelRun[] {
  const cached = RUN_CACHE.get(id);
  if (cached) return cached;
  const runs: StudioSpaceEmotePixelRun[] = [];
  BITMAPS[id].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row.charAt(x);
      let end = x + 1;
      while (end < row.length && row.charAt(end) === key) end += 1;
      const color = (STUDIO_SPACE_EMOTE_PALETTE as Readonly<Record<string, string>>)[key];
      if (color) runs.push(Object.freeze({ x, y, width: end - x, color }));
      x = end;
    }
  });
  const frozen = Object.freeze(runs);
  RUN_CACHE.set(id, frozen);
  return frozen;
}
