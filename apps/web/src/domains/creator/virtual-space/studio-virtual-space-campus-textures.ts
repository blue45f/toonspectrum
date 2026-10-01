/**
 * 캠퍼스 전용 코드 텍스처(3/4 시점 벽·문·표지판·광고판·오락기·촬영 장비·액자·무대 등).
 *
 * - 이미지 자산이 없는 캠퍼스 오브젝트를 Canvas 2D로 2배 해상도에 그린 뒤 Phaser 텍스처로 캐시한다.
 *   같은 키가 있으면 다시 그리지 않는다(재입장·스타일 전환에도 한 번만 생성).
 * - 색은 월드 안 자산의 고정 팔레트(CAMPUS_ART, 사유: 테마가 바뀌어도 간판·기계의 고유 색이 유지되어야
 *   알아볼 수 있다)와 아트 스타일 팔레트를 섞어 쓴다. UI 색(말풍선 등)은 CSS 토큰을 읽는 emote-runtime이 맡는다.
 * - 글자는 표지판 기준 영문 대문자 22px 이상·한국어 부제 12px 이상(화면 배율 0.9에서도 11px 이상)으로 그린다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioCampusObject } from "./studio-virtual-space-campus-blueprint";

/** 월드 안 자산 팔레트(간판 남색·크림 글자·금속·목재 등). */
export const CAMPUS_ART = Object.freeze({
  navy: 0x1b2146,
  navyDeep: 0x10142e,
  cream: 0xf7f3ea,
  paper: 0xfbf8f1,
  ink: 0x272336,
  gold: 0xf2c75c,
  goldDeep: 0xb98a2e,
  metal: 0x8d93a6,
  metalDark: 0x4a4f63,
  wood: 0x9a6a45,
  woodDark: 0x6b4630,
  woodLight: 0xc89a6a,
  green: 0x3fbf62,
  greenDeep: 0x2a8a44,
  glass: 0x8fe3ff,
  pink: 0xff7aa8,
  violet: 0x9b7bff,
  cyan: 0x55e0ff,
  orange: 0xffa24d,
  red: 0xe4575f,
  shadow: 0x0b0d1a,
  rock: 0x6c5a4c,
  rockDark: 0x46382f,
  rockLight: 0x8f7a64,
} as const);

export const CAMPUS_TEXTURE_SCALE = 2;

type CampusTextureScene = Pick<Phaser.Scene, "textures">;

/** 24비트 RGB 비트 마스크(색 값이 아니다). */
const RGB_MASK = 0xff_ff_ff;

export function campusHex(color: number): string {
  return `#${(color & RGB_MASK).toString(16).padStart(6, "0")}`;
}

export function campusRgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${Math.max(0, Math.min(1, alpha))})`;
}

/** amount > 0이면 밝게, < 0이면 어둡게. */
export function campusShade(color: number, amount: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 255;
    const next = amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 아트 스타일에 맞춘 색 변환(흑백 원고는 무채색, 네온은 어둡게, 파스텔은 밝게). */
export function campusStyleColor(color: number, style: StudioVirtualArtStyleKey): number {
  if (style === "ink") {
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
    return (gray << 16) | (gray << 8) | gray;
  }
  if (style === "neon") return campusShade(color, -0.45);
  if (style === "pastel") return campusShade(color, 0.28);
  return color;
}

function createCanvasTexture(
  scene: CampusTextureScene,
  key: string,
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, Math.ceil(width * CAMPUS_TEXTURE_SCALE), Math.ceil(height * CAMPUS_TEXTURE_SCALE));
  const context = texture?.getContext();
  if (!texture || !context) return key;
  context.save();
  context.scale(CAMPUS_TEXTURE_SCALE, CAMPUS_TEXTURE_SCALE);
  context.imageSmoothingEnabled = true;
  draw(context);
  context.restore();
  texture.refresh();
  return key;
}

function rect(context: CanvasRenderingContext2D, color: number, x: number, y: number, width: number, height: number, alpha = 1): void {
  context.globalAlpha = alpha;
  context.fillStyle = campusHex(color);
  context.fillRect(x, y, width, height);
  context.globalAlpha = 1;
}

function roundRect(context: CanvasRenderingContext2D, color: number, x: number, y: number, width: number, height: number, radius: number, alpha = 1): void {
  context.globalAlpha = alpha;
  context.fillStyle = campusHex(color);
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.globalAlpha = 1;
}

function strokeRoundRect(context: CanvasRenderingContext2D, color: number, x: number, y: number, width: number, height: number, radius: number, lineWidth = 1, alpha = 1): void {
  context.globalAlpha = alpha;
  context.strokeStyle = campusHex(color);
  context.lineWidth = lineWidth;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.stroke();
  context.globalAlpha = 1;
}

function ellipse(context: CanvasRenderingContext2D, color: number, x: number, y: number, rx: number, ry: number, alpha = 1): void {
  context.globalAlpha = alpha;
  context.fillStyle = campusHex(color);
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function line(context: CanvasRenderingContext2D, color: number, x1: number, y1: number, x2: number, y2: number, width = 1, alpha = 1): void {
  context.globalAlpha = alpha;
  context.strokeStyle = campusHex(color);
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.globalAlpha = 1;
}

const DISPLAY_FONT = "Pretendard, 'Noto Sans KR', Inter, system-ui, sans-serif";

function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: number, weight = 800, align: CanvasTextAlign = "center"): void {
  context.font = `${weight} ${size}px ${DISPLAY_FONT}`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = campusHex(color);
  context.fillText(value, x, y);
}

/** 좁은 판에 긴 글자가 들어가면 글자 크기를 줄여 맞춘다(최소 크기 보장). */
function fittedText(context: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, minSize: number, maxWidth: number, color: number, weight = 800): void {
  let current = size;
  context.font = `${weight} ${current}px ${DISPLAY_FONT}`;
  while (current > minSize && context.measureText(value).width > maxWidth) {
    current -= 1;
    context.font = `${weight} ${current}px ${DISPLAY_FONT}`;
  }
  text(context, value, x, y, current, color, weight);
}

/* ---------------------------------------------------------------------------------------------- */
/* 벽                                                                                              */
/* ---------------------------------------------------------------------------------------------- */

export const CAMPUS_WALL_TILE = 64;

/** 북쪽 벽(3/4 시점): 윗면 16px 밝은 띠 + 앞면 40px 벽돌선. 가로로 반복되는 64px 타일. */
export function campusNorthWallTexture(scene: CampusTextureScene, tint: number, style: StudioVirtualArtStyleKey): string {
  const base = campusStyleColor(tint, style);
  return createCanvasTexture(scene, `campus-wall-north-${base.toString(16)}-${style}`, CAMPUS_WALL_TILE, 56, (context) => {
    rect(context, campusShade(base, 0.38), 0, 0, 64, 16);
    rect(context, campusShade(base, 0.55), 0, 0, 64, 3);
    rect(context, campusShade(base, -0.18), 0, 14, 64, 2);
    const face = context.createLinearGradient(0, 16, 0, 56);
    face.addColorStop(0, campusHex(base));
    face.addColorStop(1, campusHex(campusShade(base, -0.22)));
    context.fillStyle = face;
    context.fillRect(0, 16, 64, 40);
    const mortar = campusShade(base, -0.34);
    for (let row = 0; row < 4; row += 1) {
      const y = 16 + row * 10;
      line(context, mortar, 0, y + 10, 64, y + 10, 1, 0.55);
      const offset = row % 2 === 0 ? 0 : 16;
      for (let x = offset; x <= 64; x += 32) line(context, mortar, x, y, x, y + 10, 1, 0.5);
      rect(context, campusShade(base, 0.12), offset + 2, y + 2, 12, 2, 0.35);
    }
    rect(context, campusShade(base, -0.42), 0, 52, 64, 4);
  });
}

/** 옆벽 윗면(세로 반복). */
export function campusSideWallTexture(scene: CampusTextureScene, tint: number, style: StudioVirtualArtStyleKey): string {
  const base = campusStyleColor(tint, style);
  return createCanvasTexture(scene, `campus-wall-side-${base.toString(16)}-${style}`, 16, CAMPUS_WALL_TILE, (context) => {
    rect(context, campusShade(base, 0.34), 0, 0, 16, 64);
    rect(context, campusShade(base, 0.52), 2, 0, 3, 64);
    rect(context, campusShade(base, -0.28), 14, 0, 2, 64);
    rect(context, campusShade(base, -0.12), 0, 0, 1, 64);
    for (let y = 0; y < 64; y += 16) line(context, campusShade(base, 0.08), 0, y, 16, y, 1, 0.5);
  });
}

/** 남쪽 낮은 벽: 윗면 10px + 앞면 14px. */
export function campusSouthWallTexture(scene: CampusTextureScene, tint: number, style: StudioVirtualArtStyleKey): string {
  const base = campusStyleColor(tint, style);
  return createCanvasTexture(scene, `campus-wall-south-${base.toString(16)}-${style}`, CAMPUS_WALL_TILE, 24, (context) => {
    rect(context, campusShade(base, 0.36), 0, 0, 64, 10);
    rect(context, campusShade(base, 0.54), 0, 0, 64, 2);
    rect(context, campusShade(base, -0.06), 0, 10, 64, 14);
    rect(context, campusShade(base, -0.3), 0, 21, 64, 3);
    for (let x = 0; x <= 64; x += 32) line(context, campusShade(base, -0.3), x, 10, x, 22, 1, 0.5);
  });
}

/** 문턱 매트(바닥 장식). */
export function campusDoorMatTexture(scene: CampusTextureScene, style: StudioVirtualArtStyleKey): string {
  const mat = campusStyleColor(0x7a5646, style);
  return createCanvasTexture(scene, `campus-door-mat-${style}`, 112, 34, (context) => {
    roundRect(context, CAMPUS_ART.shadow, 2, 4, 108, 28, 7, 0.22);
    roundRect(context, mat, 2, 2, 108, 28, 7);
    strokeRoundRect(context, campusShade(mat, 0.4), 6, 6, 100, 20, 5, 1.5, 0.9);
    for (let x = 14; x < 100; x += 10) line(context, campusShade(mat, -0.25), x, 9, x, 23, 1, 0.5);
  });
}

/** 난간(카페 데크) 가로 반복. */
export function campusRailingTexture(scene: CampusTextureScene, style: StudioVirtualArtStyleKey): string {
  const wood = campusStyleColor(CAMPUS_ART.wood, style);
  return createCanvasTexture(scene, `campus-railing-${style}`, 64, 30, (context) => {
    rect(context, CAMPUS_ART.shadow, 0, 26, 64, 4, 0.18);
    rect(context, campusShade(wood, 0.2), 0, 4, 64, 5);
    rect(context, campusShade(wood, -0.2), 0, 9, 64, 2);
    for (const x of [4, 36]) {
      rect(context, wood, x, 4, 6, 24);
      rect(context, campusShade(wood, 0.3), x, 4, 2, 24);
    }
    rect(context, campusShade(wood, 0.1), 0, 17, 64, 3);
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* 표지판·광고판                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

export interface StudioCampusSignArt {
  readonly title: string;
  readonly subtitle: string;
  readonly width: number;
  readonly height: number;
  readonly accent: number;
}

/** 짙은 남색 판 + 얇은 밝은 테두리 + 굵은 영문 대문자 + 한국어 부제. */
export function campusSignTexture(scene: CampusTextureScene, sign: StudioCampusSignArt, style: StudioVirtualArtStyleKey): string {
  const plate = style === "ink" ? 0x2a2a30 : style === "neon" ? CAMPUS_ART.navyDeep : CAMPUS_ART.navy;
  const border = style === "neon" ? CAMPUS_ART.cyan : campusStyleColor(sign.accent, style);
  const key = `campus-sign-${sign.title}-${sign.subtitle}-${sign.width}-${style}`;
  return createCanvasTexture(scene, key, sign.width, sign.height, (context) => {
    const { width, height } = sign;
    roundRect(context, CAMPUS_ART.shadow, 2, 4, width - 4, height - 4, 9, 0.35);
    roundRect(context, plate, 1, 1, width - 4, height - 6, 9);
    const sheen = context.createLinearGradient(0, 0, 0, height);
    sheen.addColorStop(0, campusRgba(CAMPUS_ART.paper, 0.14));
    sheen.addColorStop(0.5, campusRgba(CAMPUS_ART.paper, 0));
    context.fillStyle = sheen;
    context.beginPath();
    context.roundRect(1, 1, width - 4, height - 6, 9);
    context.fill();
    strokeRoundRect(context, border, 3, 3, width - 8, height - 10, 7, 1.5, 0.95);
    for (const x of [8, width - 12]) ellipse(context, CAMPUS_ART.gold, x + 1, height / 2 - 2, 2, 2, 0.9);
    fittedText(context, sign.title, width / 2 - 1, height * 0.36, 24, 18, width - 34, CAMPUS_ART.cream, 900);
    fittedText(context, sign.subtitle, width / 2 - 1, height * 0.72, 12, 11, width - 30, campusShade(CAMPUS_ART.cream, -0.1), 700);
  });
}

/** 입구 광고판 'TOON SPECTRUM · CREATE MEET PLAY TOGETHER'. */
export function campusBillboardTexture(scene: CampusTextureScene, style: StudioVirtualArtStyleKey): string {
  return createCanvasTexture(scene, `campus-billboard-${style}`, 236, 132, (context) => {
    const wood = campusStyleColor(CAMPUS_ART.woodDark, style);
    for (const x of [44, 186]) {
      rect(context, wood, x, 84, 8, 46);
      rect(context, campusShade(wood, 0.3), x, 84, 2, 46);
    }
    ellipse(context, CAMPUS_ART.shadow, 118, 128, 100, 5, 0.25);
    roundRect(context, CAMPUS_ART.shadow, 6, 6, 226, 84, 10, 0.35);
    roundRect(context, CAMPUS_ART.navy, 4, 2, 226, 84, 10);
    const glow = context.createLinearGradient(4, 2, 230, 86);
    glow.addColorStop(0, campusRgba(CAMPUS_ART.violet, 0.35));
    glow.addColorStop(1, campusRgba(CAMPUS_ART.cyan, 0.22));
    context.fillStyle = glow;
    context.beginPath();
    context.roundRect(4, 2, 226, 84, 10);
    context.fill();
    strokeRoundRect(context, CAMPUS_ART.cyan, 7, 5, 220, 78, 8, 1.5, 0.9);
    text(context, "TOON SPECTRUM", 117, 25, 22, CAMPUS_ART.cream, 900);
    line(context, CAMPUS_ART.gold, 50, 40, 184, 40, 1.5, 0.8);
    text(context, "CREATE · MEET · PLAY", 117, 53, 13, CAMPUS_ART.cyan, 800);
    text(context, "TOGETHER", 117, 70, 13, CAMPUS_ART.pink, 800);
  });
}

/** 하위 맵 게이트 이름판(한국어 + 영문). */
export function campusGatePlateTexture(scene: CampusTextureScene, labelKo: string, labelEn: string, style: StudioVirtualArtStyleKey): string {
  return createCanvasTexture(scene, `campus-gate-plate-${labelEn}-${style}`, 124, 58, (context) => {
    const wood = campusStyleColor(CAMPUS_ART.woodDark, style);
    rect(context, wood, 58, 34, 8, 24);
    roundRect(context, CAMPUS_ART.shadow, 3, 4, 120, 34, 7, 0.3);
    roundRect(context, CAMPUS_ART.navy, 2, 2, 120, 34, 7);
    strokeRoundRect(context, CAMPUS_ART.violet, 4, 4, 116, 30, 5, 1.2, 0.95);
    fittedText(context, labelKo, 62, 14, 12, 11, 108, CAMPUS_ART.cream, 800);
    fittedText(context, labelEn, 62, 27, 9, 8, 108, CAMPUS_ART.cyan, 800);
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* 구역 전용 오브젝트                                                                               */
/* ---------------------------------------------------------------------------------------------- */

const ARCADE_BODIES = [0x5b3bd6, 0xd6395f, 0x2a9bd6, 0xe0a126] as const;
const FRAME_PAINTINGS = [
  { sky: 0x8fd3ff, land: 0x5fb36b, accent: 0xffd166 },
  { sky: 0xffc7d9, land: 0x9b7bff, accent: 0xfff1c1 },
  { sky: 0x1f2a5c, land: 0x55e0ff, accent: 0xff7aa8 },
] as const;

function drawReception(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const wood = campusStyleColor(CAMPUS_ART.woodLight, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 4, width / 2 - 6, 6, 0.25);
  roundRect(context, campusShade(wood, -0.25), 6, 30, width - 12, height - 34, 8);
  roundRect(context, campusShade(wood, 0.25), 2, 22, width - 4, 16, 7);
  rect(context, campusShade(wood, 0.45), 8, 23, width - 16, 3);
  for (let x = 24; x < width - 20; x += 36) rect(context, campusShade(wood, -0.38), x, 42, 2, height - 50, 0.6);
  roundRect(context, CAMPUS_ART.navy, width / 2 - 34, 46, 68, 20, 5);
  text(context, "WELCOME", width / 2, 56, 10, CAMPUS_ART.gold, 900);
  roundRect(context, CAMPUS_ART.metalDark, 30, 8, 30, 20, 3);
  rect(context, CAMPUS_ART.glass, 33, 11, 24, 13);
  rect(context, CAMPUS_ART.metal, 43, 28, 4, 4);
  ellipse(context, CAMPUS_ART.greenDeep, width - 40, 16, 12, 10);
  ellipse(context, CAMPUS_ART.green, width - 44, 12, 7, 6);
  rect(context, campusStyleColor(CAMPUS_ART.orange, style), width - 50, 20, 20, 6);
  ellipse(context, CAMPUS_ART.paper, width / 2 + 10, 18, 7, 4);
}

function drawGreenScreen(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const green = style === "ink" ? campusStyleColor(CAMPUS_ART.green, style) : CAMPUS_ART.green;
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 4, width / 2 - 10, 6, 0.25);
  for (const x of [8, width - 14]) {
    rect(context, CAMPUS_ART.metalDark, x, 4, 6, height - 8);
    rect(context, CAMPUS_ART.metal, x + 1, 4, 2, height - 8);
    rect(context, CAMPUS_ART.metalDark, x - 6, height - 8, 18, 4);
  }
  rect(context, CAMPUS_ART.metalDark, 8, 4, width - 16, 6);
  const cloth = context.createLinearGradient(0, 10, 0, height - 12);
  cloth.addColorStop(0, campusHex(campusShade(green, 0.12)));
  cloth.addColorStop(1, campusHex(campusShade(green, -0.2)));
  context.fillStyle = cloth;
  context.fillRect(16, 10, width - 32, height - 24);
  for (let x = 34; x < width - 30; x += 28) line(context, campusShade(green, -0.28), x, 12, x + 6, height - 16, 1.5, 0.4);
  rect(context, campusShade(green, -0.3), 16, height - 16, width - 32, 4);
}

function drawCamera(context: CanvasRenderingContext2D, width: number, height: number, variant: number): void {
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 4, 20, 5, 0.25);
  const legTop = 42;
  line(context, CAMPUS_ART.metalDark, width / 2, legTop, 8, height - 6, 3);
  line(context, CAMPUS_ART.metalDark, width / 2, legTop, width - 8, height - 6, 3);
  line(context, CAMPUS_ART.metal, width / 2, legTop, width / 2, height - 10, 3);
  roundRect(context, CAMPUS_ART.ink, 8, 16, width - 16, 26, 5);
  roundRect(context, CAMPUS_ART.metalDark, 14, 10, 18, 8, 2);
  ellipse(context, CAMPUS_ART.metalDark, width / 2 + 2, 29, 9, 9);
  ellipse(context, variant === 1 ? CAMPUS_ART.violet : CAMPUS_ART.glass, width / 2 + 2, 29, 5, 5);
  ellipse(context, CAMPUS_ART.red, width - 14, 20, 2.5, 2.5);
}

function drawSoftbox(context: CanvasRenderingContext2D, width: number, height: number): void {
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 4, 20, 5, 0.25);
  line(context, CAMPUS_ART.metalDark, width / 2, 46, 10, height - 6, 3);
  line(context, CAMPUS_ART.metalDark, width / 2, 46, width - 10, height - 6, 3);
  line(context, CAMPUS_ART.metal, width / 2, 40, width / 2, height - 10, 3);
  context.fillStyle = campusHex(CAMPUS_ART.ink);
  context.beginPath();
  context.moveTo(8, 6); context.lineTo(width - 8, 6); context.lineTo(width - 18, 42); context.lineTo(18, 42); context.closePath();
  context.fill();
  const glow = context.createLinearGradient(0, 8, 0, 40);
  glow.addColorStop(0, campusRgba(CAMPUS_ART.paper, 1));
  glow.addColorStop(1, campusRgba(0xffe4aa, 0.9));
  context.fillStyle = glow;
  context.beginPath();
  context.moveTo(12, 9); context.lineTo(width - 12, 9); context.lineTo(width - 20, 38); context.lineTo(20, 38); context.closePath();
  context.fill();
}

function drawWhiteboard(context: CanvasRenderingContext2D, width: number, height: number): void {
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 3, width / 2 - 14, 5, 0.25);
  for (const x of [18, width - 24]) rect(context, CAMPUS_ART.metalDark, x, 60, 6, height - 62);
  roundRect(context, CAMPUS_ART.metal, 6, 4, width - 12, 72, 5);
  rect(context, CAMPUS_ART.paper, 11, 9, width - 22, 62);
  const notes = [CAMPUS_ART.gold, CAMPUS_ART.pink, CAMPUS_ART.cyan, 0xa8e6a1];
  notes.forEach((color, index) => {
    const x = 20 + index * 34, y = 16 + (index % 2) * 8;
    rect(context, color, x, y, 22, 20);
    line(context, CAMPUS_ART.ink, x + 4, y + 8, x + 18, y + 8, 1, 0.5);
    line(context, CAMPUS_ART.ink, x + 4, y + 13, x + 14, y + 13, 1, 0.5);
  });
  line(context, CAMPUS_ART.violet, 20, 52, 90, 52, 2);
  line(context, CAMPUS_ART.violet, 90, 52, 84, 47, 2);
  line(context, CAMPUS_ART.violet, 90, 52, 84, 57, 2);
  ellipse(context, CAMPUS_ART.red, width - 50, 50, 16, 10, 0.18);
  context.strokeStyle = campusHex(CAMPUS_ART.red);
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(width - 50, 50, 16, 10, 0, 0, Math.PI * 2);
  context.stroke();
  rect(context, CAMPUS_ART.metalDark, 10, 72, width - 20, 5);
}

function drawCafeCounter(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const wood = campusStyleColor(CAMPUS_ART.wood, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 4, width / 2 - 8, 6, 0.25);
  roundRect(context, campusShade(wood, -0.2), 4, 40, width - 8, height - 44, 6);
  for (let x = 16; x < width - 10; x += 22) rect(context, campusShade(wood, -0.38), x, 48, 2, height - 58, 0.55);
  roundRect(context, campusShade(wood, 0.35), 0, 32, width, 14, 5);
  rect(context, campusShade(wood, 0.55), 6, 33, width - 12, 3);
  roundRect(context, CAMPUS_ART.metalDark, 22, 6, 52, 28, 5);
  rect(context, CAMPUS_ART.metal, 26, 10, 44, 8);
  ellipse(context, CAMPUS_ART.orange, 36, 26, 3, 3);
  ellipse(context, CAMPUS_ART.cyan, 48, 26, 3, 3);
  for (const [x, color] of [[98, CAMPUS_ART.paper], [114, CAMPUS_ART.pink], [130, CAMPUS_ART.paper]] as const) {
    roundRect(context, color, x, 20, 11, 13, 2);
    rect(context, CAMPUS_ART.woodDark, x + 2, 22, 7, 3);
  }
  roundRect(context, CAMPUS_ART.navy, width - 104, 0, 86, 30, 5);
  text(context, "CAFE", width - 61, 10, 11, CAMPUS_ART.gold, 900);
  text(context, "LATTE · TEA", width - 61, 22, 8, CAMPUS_ART.cream, 700);
  ellipse(context, 0xd9b38c, width - 150, 36, 16, 5);
  for (let index = 0; index < 5; index += 1) ellipse(context, CAMPUS_ART.woodLight, width - 160 + index * 5, 33, 3, 3);
}

function drawCafeTable(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const wood = campusStyleColor(CAMPUS_ART.woodLight, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 6, 34, 7, 0.25);
  for (const x of [12, width - 12]) {
    ellipse(context, campusShade(wood, -0.3), x, height - 16, 10, 5);
    ellipse(context, campusStyleColor(CAMPUS_ART.pink, style), x, height - 19, 10, 5);
  }
  rect(context, CAMPUS_ART.metalDark, width / 2 - 2, 18, 4, height - 26);
  ellipse(context, campusShade(wood, -0.25), width / 2, 18, 26, 9);
  ellipse(context, wood, width / 2, 15, 26, 9);
  ellipse(context, CAMPUS_ART.paper, width / 2 - 7, 13, 5, 3);
  ellipse(context, CAMPUS_ART.paper, width / 2 + 8, 15, 5, 3);
}

function drawMeetingTable(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const wood = campusStyleColor(CAMPUS_ART.woodDark, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 10, width / 2 - 6, 12, 0.25);
  ellipse(context, campusShade(wood, -0.2), width / 2, height / 2 + 6, width / 2 - 8, height / 2 - 10);
  ellipse(context, wood, width / 2, height / 2, width / 2 - 8, height / 2 - 12);
  ellipse(context, campusShade(wood, 0.25), width / 2, height / 2 - 6, width / 2 - 30, height / 2 - 26, 0.6);
  for (const [x, y] of [[70, 36], [width - 90, 38]] as const) {
    roundRect(context, CAMPUS_ART.metalDark, x, y, 26, 16, 2);
    rect(context, CAMPUS_ART.glass, x + 2, y + 2, 22, 10);
  }
  rect(context, CAMPUS_ART.paper, width / 2 - 14, 34, 22, 16);
  rect(context, CAMPUS_ART.paper, width / 2 + 2, 42, 22, 16);
  ellipse(context, CAMPUS_ART.gold, width / 2 + 40, 56, 5, 4);
}

function drawStage(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const deck = campusStyleColor(0x2c2f55, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 6, width / 2 - 4, 8, 0.3);
  roundRect(context, campusShade(deck, 0.25), 4, 6, width - 8, 58, 10);
  for (let x = 20; x < width - 20; x += 40) line(context, campusShade(deck, 0.05), x, 10, x, 60, 1, 0.5);
  rect(context, campusShade(deck, 0.5), 10, 8, width - 20, 3);
  const skirt = context.createLinearGradient(0, 64, 0, height - 10);
  skirt.addColorStop(0, campusHex(campusShade(deck, -0.1)));
  skirt.addColorStop(1, campusHex(campusShade(deck, -0.45)));
  context.fillStyle = skirt;
  context.fillRect(4, 64, width - 8, height - 76);
  for (let x = 30; x < width - 20; x += 44) ellipse(context, x % 88 === 30 ? CAMPUS_ART.cyan : CAMPUS_ART.pink, x, 72, 4, 3, 0.95);
  roundRect(context, campusShade(deck, 0.15), width / 2 - 60, height - 24, 120, 14, 3);
  rect(context, campusShade(deck, 0.35), width / 2 - 56, height - 22, 112, 3);
}

function drawStageScreen(context: CanvasRenderingContext2D, width: number, height: number): void {
  roundRect(context, CAMPUS_ART.shadow, 4, 6, width - 6, height - 8, 8, 0.4);
  roundRect(context, CAMPUS_ART.ink, 2, 2, width - 6, height - 8, 8);
  const screen = context.createLinearGradient(0, 8, width, height - 8);
  screen.addColorStop(0, campusHex(0x3a2a8f));
  screen.addColorStop(0.55, campusHex(0x1d3f9c));
  screen.addColorStop(1, campusHex(0x0f6d8f));
  context.fillStyle = screen;
  context.fillRect(10, 10, width - 22, height - 24);
  for (let index = 0; index < 18; index += 1) {
    ellipse(context, index % 3 === 0 ? CAMPUS_ART.gold : CAMPUS_ART.cyan, 16 + (index * 53) % (width - 32), 16 + (index * 29) % (height - 34), 1.4, 1.4, 0.8);
  }
  text(context, "GOOD CREATORS", width / 2 - 2, height * 0.34, 22, CAMPUS_ART.cream, 900);
  text(context, "BETTER WORLD", width / 2 - 2, height * 0.58, 22, CAMPUS_ART.gold, 900);
  line(context, CAMPUS_ART.cyan, 40, height * 0.76, width - 44, height * 0.76, 1.5, 0.7);
  text(context, "TOON SPECTRUM LIVE", width / 2 - 2, height * 0.84, 10, CAMPUS_ART.cyan, 800);
}

function drawSpeaker(context: CanvasRenderingContext2D, width: number, height: number): void {
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 3, width / 2 - 4, 4, 0.3);
  roundRect(context, CAMPUS_ART.ink, 4, 4, width - 8, height - 10, 5);
  ellipse(context, CAMPUS_ART.metalDark, width / 2, 24, 13, 13);
  ellipse(context, CAMPUS_ART.shadow, width / 2, 24, 6, 6);
  ellipse(context, CAMPUS_ART.metalDark, width / 2, 60, 9, 9);
  ellipse(context, CAMPUS_ART.cyan, width / 2, 60, 3, 3, 0.9);
}

function drawSeatRow(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const cushion = campusStyleColor(0x8a3f6a, style);
  for (let index = 0; index < 3; index += 1) {
    const x = 6 + index * (width - 12) / 3;
    const seatWidth = (width - 12) / 3 - 8;
    ellipse(context, CAMPUS_ART.shadow, x + seatWidth / 2, height - 4, seatWidth / 2, 4, 0.25);
    roundRect(context, campusShade(cushion, -0.25), x, 4, seatWidth, 22, 6);
    roundRect(context, cushion, x + 2, 6, seatWidth - 4, 16, 5);
    roundRect(context, campusShade(cushion, 0.15), x, 22, seatWidth, 14, 5);
    rect(context, CAMPUS_ART.metalDark, x + 4, 36, 4, height - 40);
    rect(context, CAMPUS_ART.metalDark, x + seatWidth - 8, 36, 4, height - 40);
  }
}

function drawArcadeCabinet(context: CanvasRenderingContext2D, width: number, height: number, variant: number, style: StudioVirtualArtStyleKey): void {
  const body = campusStyleColor(ARCADE_BODIES[variant % ARCADE_BODIES.length] ?? CAMPUS_ART.violet, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 3, width / 2 - 2, 5, 0.3);
  roundRect(context, campusShade(body, -0.3), 4, 8, width - 8, height - 12, 6);
  roundRect(context, body, 6, 6, width - 12, height - 14, 6);
  roundRect(context, CAMPUS_ART.ink, 8, 4, width - 16, 16, 4);
  text(context, ["PLAY", "JUMP", "PUZZLE", "RACE"][variant % 4] ?? "PLAY", width / 2, 12, 9, CAMPUS_ART.gold, 900);
  roundRect(context, CAMPUS_ART.ink, 10, 24, width - 20, 36, 4);
  const screen = context.createLinearGradient(0, 26, 0, 58);
  screen.addColorStop(0, campusHex([CAMPUS_ART.cyan, CAMPUS_ART.pink, CAMPUS_ART.gold, 0x7dffb2][variant % 4] ?? CAMPUS_ART.cyan));
  screen.addColorStop(1, campusHex(CAMPUS_ART.navy));
  context.fillStyle = screen;
  context.fillRect(13, 27, width - 26, 30);
  for (let index = 0; index < 4; index += 1) rect(context, CAMPUS_ART.cream, 16 + index * 9, 44 - (index % 2) * 6, 5, 5, 0.9);
  roundRect(context, campusShade(body, 0.2), 6, 62, width - 12, 16, 4);
  rect(context, CAMPUS_ART.metalDark, 18, 62, 3, 8);
  ellipse(context, CAMPUS_ART.red, 19.5, 62, 4, 4);
  ellipse(context, CAMPUS_ART.cyan, width - 24, 70, 3, 3);
  ellipse(context, CAMPUS_ART.gold, width - 15, 68, 3, 3);
  rect(context, campusShade(body, -0.45), 8, 84, width - 16, 3);
  rect(context, CAMPUS_ART.gold, width / 2 - 5, 92, 10, 4, 0.8);
}

function drawClawMachine(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const body = campusStyleColor(CAMPUS_ART.pink, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 3, width / 2 - 2, 5, 0.3);
  roundRect(context, campusShade(body, -0.25), 4, 6, width - 8, height - 10, 6);
  roundRect(context, CAMPUS_ART.glass, 9, 16, width - 18, 44, 3, 0.55);
  line(context, CAMPUS_ART.metal, width / 2, 16, width / 2, 30, 2);
  line(context, CAMPUS_ART.metal, width / 2 - 6, 34, width / 2, 30, 2);
  line(context, CAMPUS_ART.metal, width / 2 + 6, 34, width / 2, 30, 2);
  for (const [x, color] of [[20, CAMPUS_ART.gold], [32, CAMPUS_ART.cyan], [46, CAMPUS_ART.violet], [56, CAMPUS_ART.orange]] as const) ellipse(context, color, x, 54, 6, 5);
  roundRect(context, body, 6, 4, width - 12, 12, 4);
  roundRect(context, campusShade(body, 0.2), 6, 62, width - 12, 30, 4);
  ellipse(context, CAMPUS_ART.red, width - 20, 74, 4, 4);
}

function drawFrame(context: CanvasRenderingContext2D, width: number, height: number, variant: number): void {
  const painting = FRAME_PAINTINGS[variant % FRAME_PAINTINGS.length] ?? FRAME_PAINTINGS[0];
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 3, width / 2 - 8, 4, 0.25);
  line(context, CAMPUS_ART.woodDark, width / 2, 50, 16, height - 4, 3);
  line(context, CAMPUS_ART.woodDark, width / 2, 50, width - 16, height - 4, 3);
  roundRect(context, CAMPUS_ART.goldDeep, 4, 2, width - 8, 62, 3);
  rect(context, CAMPUS_ART.gold, 7, 5, width - 14, 56);
  rect(context, painting.sky, 12, 10, width - 24, 46);
  if (variant % 3 === 0) {
    context.fillStyle = campusHex(painting.land);
    context.beginPath();
    context.moveTo(12, 56); context.lineTo(34, 30); context.lineTo(52, 44); context.lineTo(64, 34); context.lineTo(width - 12, 56); context.closePath();
    context.fill();
    ellipse(context, painting.accent, width - 26, 20, 6, 6);
  } else if (variant % 3 === 1) {
    ellipse(context, painting.land, width / 2, 36, 14, 18);
    ellipse(context, painting.accent, width / 2, 26, 8, 8);
  } else {
    for (let index = 0; index < 5; index += 1) ellipse(context, index % 2 ? painting.accent : painting.land, 20 + index * 11, 20 + (index * 13) % 30, 7, 7, 0.9);
  }
  rect(context, CAMPUS_ART.paper, width / 2 - 14, 66, 28, 8);
}

function drawBoat(context: CanvasRenderingContext2D, width: number, height: number, style: StudioVirtualArtStyleKey): void {
  const wood = campusStyleColor(CAMPUS_ART.wood, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 12, width / 2 - 4, 12, 0.18);
  ellipse(context, campusShade(wood, -0.3), width / 2, height / 2 + 4, width / 2 - 6, height / 2 - 10);
  ellipse(context, wood, width / 2, height / 2, width / 2 - 8, height / 2 - 12);
  ellipse(context, campusShade(wood, 0.3), width / 2, height / 2 - 2, width / 2 - 20, height / 2 - 20);
  for (const x of [width / 2 - 26, width / 2 + 22]) rect(context, campusShade(wood, -0.35), x, height / 2 - 12, 6, 22);
  line(context, CAMPUS_ART.woodLight, width / 2 - 40, height / 2 + 14, width / 2 + 4, height / 2 - 18, 3);
}

function drawLounger(context: CanvasRenderingContext2D, width: number, height: number, variant: number, style: StudioVirtualArtStyleKey): void {
  const fabric = campusStyleColor(variant === 1 ? CAMPUS_ART.cyan : CAMPUS_ART.orange, style);
  ellipse(context, CAMPUS_ART.shadow, width / 2, height - 4, width / 2 - 4, 5, 0.22);
  roundRect(context, CAMPUS_ART.woodLight, 4, 16, width - 8, 20, 4);
  roundRect(context, fabric, 8, 12, width - 30, 18, 4);
  for (let x = 14; x < width - 30; x += 10) rect(context, campusShade(fabric, 0.35), x, 12, 4, 18, 0.6);
  roundRect(context, campusShade(fabric, -0.15), width - 26, 4, 20, 26, 5);
  rect(context, CAMPUS_ART.woodDark, 8, 36, 4, 8);
  rect(context, CAMPUS_ART.woodDark, width - 14, 36, 4, 8);
}

/** 오브젝트 종류별 텍스처 키(스타일·변형 포함). 텍스트가 필요한 게이트 이름판은 campusGatePlateTexture를 쓴다. */
export function campusObjectTexture(scene: CampusTextureScene, object: StudioCampusObject, style: StudioVirtualArtStyleKey): string | null {
  const variant = object.variant ?? 0;
  const key = `campus-object-${object.kind}-${variant}-${object.width}x${object.height}-${style}`;
  const draw = (renderer: (context: CanvasRenderingContext2D) => void) => createCanvasTexture(scene, key, object.width, object.height, renderer);
  const { width, height } = object;
  switch (object.kind) {
    case "reception": return draw((context) => drawReception(context, width, height, style));
    case "green-screen": return draw((context) => drawGreenScreen(context, width, height, style));
    case "camera": return draw((context) => drawCamera(context, width, height, variant));
    case "softbox": return draw((context) => drawSoftbox(context, width, height));
    case "whiteboard": return draw((context) => drawWhiteboard(context, width, height));
    case "cafe-counter": return draw((context) => drawCafeCounter(context, width, height, style));
    case "cafe-table": return draw((context) => drawCafeTable(context, width, height, style));
    case "meeting-table": return draw((context) => drawMeetingTable(context, width, height, style));
    case "stage": return draw((context) => drawStage(context, width, height, style));
    case "stage-screen": return draw((context) => drawStageScreen(context, width, height));
    case "speaker": return draw((context) => drawSpeaker(context, width, height));
    case "seat-row": return draw((context) => drawSeatRow(context, width, height, style));
    case "arcade-cabinet": return draw((context) => drawArcadeCabinet(context, width, height, variant, style));
    case "arcade-claw": return draw((context) => drawClawMachine(context, width, height, style));
    case "frame": return draw((context) => drawFrame(context, width, height, variant));
    case "billboard": return campusBillboardTexture(scene, style);
    case "boat": return draw((context) => drawBoat(context, width, height, style));
    case "lounger": return draw((context) => drawLounger(context, width, height, variant, style));
    case "gate-plate": return object.labelKo && object.labelEn ? campusGatePlateTexture(scene, object.labelKo, object.labelEn, style) : null;
    case "railing": return campusRailingTexture(scene, style);
  }
}

/**
 * 'X' 키캡 말풍선(월드 내 상호작용 프롬프트). HUD 도크 프롬프트·로비 조작 안내와 같은 키를 보여 준다(E도 같은 동작).
 */
export function campusKeycapTexture(scene: CampusTextureScene, paper: number, ink: number, accent: number): string {
  return createCanvasTexture(scene, `campus-keycap-x-${paper.toString(16)}-${ink.toString(16)}-${accent.toString(16)}`, 30, 34, (context) => {
    roundRect(context, CAMPUS_ART.shadow, 2, 4, 26, 26, 6, 0.3);
    roundRect(context, campusShade(paper, -0.12), 2, 3, 26, 26, 6);
    roundRect(context, paper, 2, 1, 26, 24, 6);
    strokeRoundRect(context, accent, 2.5, 1.5, 25, 23, 6, 1.5, 0.95);
    text(context, "X", 15, 13.5, 15, ink, 900);
    context.fillStyle = campusHex(paper);
    context.beginPath();
    context.moveTo(11, 27); context.lineTo(19, 27); context.lineTo(15, 33); context.closePath();
    context.fill();
  });
}

/**
 * 손에 든 커피잔(16×16, 받침·잔·커피 면·손잡이). 카페 주문 연출과 커피 리액션을 보낸 사람의 손에 붙는다.
 * 잔은 크림색, 커피는 갈색 픽셀 아트 팔레트다(흑백 원고는 무채색으로 바뀐다).
 */
export function campusCoffeeCupTexture(scene: CampusTextureScene, style: StudioVirtualArtStyleKey): string {
  return createCanvasTexture(scene, `campus-coffee-cup-${style}`, 16, 16, (context) => {
    const cup = campusStyleColor(CAMPUS_ART.cream, style);
    const coffee = campusStyleColor(0x6b3f24, style);
    const sleeve = campusStyleColor(CAMPUS_ART.orange, style);
    const outline = campusStyleColor(CAMPUS_ART.ink, style);
    ellipse(context, outline, 8, 14, 7, 2, 0.35);
    ellipse(context, campusShade(cup, -0.12), 8, 13, 6.5, 1.8);
    roundRect(context, outline, 2.5, 4.5, 10, 9, 2.5);
    roundRect(context, cup, 3.5, 5, 8, 7.5, 2);
    rect(context, sleeve, 3.5, 8, 8, 2.5);
    ellipse(context, coffee, 7.5, 5.6, 3.6, 1.3);
    rect(context, campusShade(cup, 0.4), 4.5, 6.5, 1.2, 4, 0.9);
    context.strokeStyle = campusHex(outline);
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(12.6, 8.3, 2, -Math.PI / 2, Math.PI / 2);
    context.stroke();
  });
}
