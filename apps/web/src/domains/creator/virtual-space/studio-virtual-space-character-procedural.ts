/**
 * 프로시저럴 캐릭터 스프라이트 생성기
 *
 * 외부 PNG 없이 캔버스에 직접 그려 캐릭터 스프라이트 시트를 만든다.
 * `studio-virtual-space-character-drawn-art.ts`가 참조하는 PNG 상당수가
 * public/에 없어 런타임 텍스처 로드 실패 가능성이 있기에, 이 모듈은
 * 네트워크 의존성 없는 폴백/주력 생성 경로를 제공한다.
 *
 * 시트 레이아웃 (B 트랙 렌더러·이 파일의 계약):
 * - 8행 × 10열, 셀 96×112px (전체 960×896)
 * - 행 순서: down, down-left, left, up-left, up, up-right, right, down-right
 *   (`studio-virtual-space-sprite.ts`의 DIRECTION_ROW과 동일)
 * - 열 0~5: 걷기 6프레임, 열 6~9: idle 호흡/눈깜빡임 4프레임
 * - 걷기 프레임 0은 중립 서기 자세라 idle 정지 프레임으로도 쓴다
 *   (`studioCharacterWalkClip`의 idleFrames 제약을 만족하기 위함)
 *
 * 순수 로직 + 캔버스 모듈. DOM 의존성은 `ProceduralSheetDeps`로 주입한다.
 */

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioCharacterAtlasLayout } from "./studio-virtual-space-character-atlas";
import type {
  StudioCharacterAtlasClip,
  StudioCharacterFramePresentation,
  StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import type {
  StudioVirtualAvatarAccessory,
  StudioVirtualAvatarHairStyle,
  StudioVirtualAvatarOutfitStyle,
  StudioVirtualAvatarProfile,
  StudioVirtualSpaceFacing,
} from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";

/** 스프라이트 팔레트. CSS 색상 문자열(oklch 권장)을 그대로 캔버스 fillStyle에 쓴다. */
export interface ProceduralCharacterPalette {
  readonly skin: string;
  readonly hair: string;
  readonly hairHighlight: string;
  readonly outfit: string;
  readonly accent: string;
}

/** 스프라이트 파츠 선택. 키는 `studio-virtual-space-model`의 아바타 타입과 공유한다. */
export interface ProceduralCharacterParts {
  readonly hairStyle: StudioVirtualAvatarHairStyle;
  readonly outfitStyle: StudioVirtualAvatarOutfitStyle;
  readonly accessory: StudioVirtualAvatarAccessory;
}

export const DEFAULT_PROCEDURAL_PARTS: ProceduralCharacterParts = Object.freeze({
  hairStyle: "short",
  outfitStyle: "tee",
  accessory: "none",
});

/** 셀 크기. `StudioVirtualAvatarFigure`의 viewBox(96×112)와 같은 비율이다. */
export const PROCEDURAL_FRAME_WIDTH = 96;
export const PROCEDURAL_FRAME_HEIGHT = 112;
/** 걷기 프레임 수 (`STUDIO_SPRITE_WALK_FRAME_COUNT`과 동일). */
export const PROCEDURAL_WALK_FRAME_COUNT = 6;
/** idle 호흡/깜빡임 프레임 수. */
export const PROCEDURAL_IDLE_FRAME_COUNT = 4;
export const PROCEDURAL_SHEET_COLUMNS = PROCEDURAL_WALK_FRAME_COUNT + PROCEDURAL_IDLE_FRAME_COUNT;
export const PROCEDURAL_SHEET_ROWS = 8;
export const PROCEDURAL_SHEET_WIDTH = PROCEDURAL_FRAME_WIDTH * PROCEDURAL_SHEET_COLUMNS;
export const PROCEDURAL_SHEET_HEIGHT = PROCEDURAL_FRAME_HEIGHT * PROCEDURAL_SHEET_ROWS;

/** 방향 → 시트 행. sprite.ts의 DIRECTION_ROW과 동일한 순서다. */
export const PROCEDURAL_DIRECTION_ROWS: Readonly<Record<StudioSpriteDirection, number>> = Object.freeze({
  "down": 0,
  "down-left": 1,
  "left": 2,
  "up-left": 3,
  "up": 4,
  "up-right": 5,
  "right": 6,
  "down-right": 7,
});

export const PROCEDURAL_SPRITE_DIRECTIONS: readonly StudioSpriteDirection[] = Object.freeze([
  "down", "down-left", "left", "up-left", "up", "up-right", "right", "down-right",
]);

/** 4방향 facing → 프로시저럴 시트 행 (대각선 행은 8방향 렌더러가 직접 사용). */
export const PROCEDURAL_FACING_ROWS: Readonly<Record<StudioVirtualSpaceFacing, number>> = Object.freeze({
  down: PROCEDURAL_DIRECTION_ROWS["down"],
  right: PROCEDURAL_DIRECTION_ROWS["right"],
  left: PROCEDURAL_DIRECTION_ROWS["left"],
  up: PROCEDURAL_DIRECTION_ROWS["up"],
});

function clampFrame(frame: number, count: number): number {
  if (!Number.isFinite(frame)) return 0;
  return ((Math.floor(frame) % count) + count) % count;
}

/**
 * 프로시저럴 시트의 셀 좌표 (B 트랙 블릿 계약).
 * `spriteSheetCell`과 달리 10열 레이아웃(걷기 6 + idle 4)을 사용한다.
 */
export function proceduralSheetCell(
  direction: StudioSpriteDirection,
  frame: number,
  motion: "idle" | "walk",
): { readonly row: number; readonly column: number } {
  const row = PROCEDURAL_DIRECTION_ROWS[direction] ?? 0;
  const column = motion === "idle"
    ? PROCEDURAL_WALK_FRAME_COUNT + clampFrame(frame, PROCEDURAL_IDLE_FRAME_COUNT)
    : clampFrame(frame, PROCEDURAL_WALK_FRAME_COUNT);
  return Object.freeze({ row, column });
}

/** 셀의 선형 인덱스 (Phaser 프레임 번호·skin idleFrames에 사용). */
export function proceduralSheetCellIndex(
  direction: StudioSpriteDirection,
  frame: number,
  motion: "idle" | "walk",
): number {
  const cell = proceduralSheetCell(direction, frame, motion);
  return cell.row * PROCEDURAL_SHEET_COLUMNS + cell.column;
}

/** idle 호흡 사이클 (ms). 4프레임: 들숨·날숨·깜빡임·휴지. */
export const PROCEDURAL_IDLE_CYCLE_MS = 2_400;

/**
 * idle 애니메이션 프레임 인덱스 (0~3).
 * reducedMotion이면 항상 0(정적 서기 자세). B 트랙은 motionState가 idle일 때
 * 이 값과 `proceduralSheetCell(direction, index, "idle")`을 조합해 렌더한다.
 */
export function proceduralIdleFrameIndex(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(timeMs) || timeMs < 0) return 0;
  return Math.floor(timeMs / (PROCEDURAL_IDLE_CYCLE_MS / PROCEDURAL_IDLE_FRAME_COUNT))
    % PROCEDURAL_IDLE_FRAME_COUNT;
}

/** idle 프레임별 호흡 오프셋(px, 음수=위로). */
export function proceduralIdleBobY(frame: number): number {
  return [0, -2, -1, -2.5][clampFrame(frame, PROCEDURAL_IDLE_FRAME_COUNT)] ?? 0;
}

/** idle 프레임 중 눈을 감는 프레임 (깜빡임). */
export function proceduralIdleBlink(frame: number): boolean {
  return clampFrame(frame, PROCEDURAL_IDLE_FRAME_COUNT) === 2;
}

/** 아바타 프로필 → 스프라이트 팔레트. */
export function proceduralPaletteFromAvatarProfile(profile: Pick<
  StudioVirtualAvatarProfile, "skin" | "hair" | "hairHighlight" | "outfit" | "accent"
>): ProceduralCharacterPalette {
  return Object.freeze({
    skin: profile.skin,
    hair: profile.hair,
    hairHighlight: profile.hairHighlight,
    outfit: profile.outfit,
    accent: profile.accent,
  });
}

/** 아바타 프로필 → 스프라이트 파츠. */
export function proceduralPartsFromAvatarProfile(profile: Pick<
  StudioVirtualAvatarProfile, "hairStyle" | "outfitStyle" | "accessory"
>): ProceduralCharacterParts {
  return Object.freeze({
    hairStyle: profile.hairStyle,
    outfitStyle: profile.outfitStyle ?? "tee",
    accessory: profile.accessory,
  });
}

/** 캔버스 생성 의존성. 테스트에서는 가짜 팩토리를 주입한다. */
export interface ProceduralSheetDeps {
  readonly createCanvas: (width: number, height: number) => HTMLCanvasElement;
}

export function defaultProceduralSheetDeps(): ProceduralSheetDeps {
  return {
    createCanvas: (width: number, height: number) => {
      if (typeof document === "undefined") {
        throw new Error("프로시저럴 스프라이트 시트는 브라우저 환경에서만 생성할 수 있습니다.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
  };
}

function assertPalette(palette: ProceduralCharacterPalette): void {
  const entries = [["skin", palette.skin], ["hair", palette.hair], ["hairHighlight", palette.hairHighlight],
    ["outfit", palette.outfit], ["accent", palette.accent]] as const;
  for (const [name, value] of entries) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`프로시저럴 팔레트의 ${name} 색상이 비어 있습니다.`);
    }
  }
}

/* ---------------- 캔버스 드로잉 ---------------- */

const PANTS = "#3a3a44";
const SHOE = "#26262e";
const INK = "#26262e";
const SHADOW = "rgba(0,0,0,0.18)";

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fill();
}

function strokePath(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.beginPath();
  draw();
  ctx.stroke();
}

type FigureView = "front" | "side" | "back";

export interface ProceduralCharacterFrameDrawOptions {
  readonly palette: ProceduralCharacterPalette;
  readonly parts: ProceduralCharacterParts;
  readonly view: FigureView;
  /** 걷기 위상(rad). null이면 정지 자세. */
  readonly walkPhase: number | null;
  /** 호흡/걷기 바운스 오프셋(px, 음수=위로). */
  readonly bobY: number;
  /** 눈 감기 (idle 깜빡임). */
  readonly blink: boolean;
  /** 좌우 반전 (left 방향). */
  readonly mirror: boolean;
  /** 대각선 기울기(rad). */
  readonly tilt: number;
}

/**
 * 96×112 셀 하나에 치비 캐릭터를 그린다. 호출 전에 셀 원점으로 translate되어 있다고 가정한다.
 * `StudioVirtualAvatarFigure`(SVG)와 같은 치수·같은 파츠 체계를 캔버스로 옮긴 것이다.
 */
export function drawProceduralCharacterFrame(
  ctx: CanvasRenderingContext2D,
  options: ProceduralCharacterFrameDrawOptions,
): void {
  ctx.save();
  try {
    if (options.tilt !== 0) {
      ctx.translate(48, 60);
      ctx.rotate(options.tilt);
      ctx.translate(-48, -60);
    } else if (options.mirror) {
      ctx.translate(PROCEDURAL_FRAME_WIDTH, 0);
      ctx.scale(-1, 1);
    }
    drawFigure(ctx, options);
  } finally {
    ctx.restore();
  }
}

function drawFigure(ctx: CanvasRenderingContext2D, options: ProceduralCharacterFrameDrawOptions): void {
  const { palette, parts, view, blink } = options;
  const bob = options.bobY;
  const swing = options.walkPhase === null ? 0 : Math.sin(options.walkPhase);

  // 그림자
  ctx.fillStyle = SHADOW;
  ellipse(ctx, 48, 104, 17, 4.5);

  // 다리
  const legSwing = swing * 4.5;
  ctx.fillStyle = PANTS;
  roundRect(ctx, 40, 88 + legSwing + bob * 0.4, 8, 14, 3);
  roundRect(ctx, 50, 88 - legSwing + bob * 0.4, 8, 14, 3);
  ctx.fillStyle = SHOE;
  roundRect(ctx, 39, 99 + legSwing + bob * 0.4, 10, 5, 2.5);
  roundRect(ctx, 49, 99 - legSwing + bob * 0.4, 10, 5, 2.5);

  // 팔 (다리와 반대로 흔들림)
  const armSwing = -swing * 3;
  ctx.fillStyle = palette.outfit;
  roundRect(ctx, 26, 62 + armSwing + bob * 0.5, 7, 19, 3.5);
  roundRect(ctx, 63, 62 - armSwing + bob * 0.5, 7, 19, 3.5);
  ctx.fillStyle = palette.skin;
  circle(ctx, 29.5, 83 + armSwing + bob * 0.5, 3.5);
  circle(ctx, 66.5, 83 - armSwing + bob * 0.5, 3.5);

  // 몸통
  ctx.fillStyle = palette.outfit;
  roundRect(ctx, 33, 58 + bob * 0.5, 30, 32, 10);
  drawOutfitDetail(ctx, parts.outfitStyle, palette.accent, bob);

  // 머리
  const headY = 38 + bob;
  if (view === "back") {
    drawHairBack(ctx, parts.hairStyle, palette.hair, palette.hairHighlight, headY);
  } else {
    ctx.fillStyle = palette.skin;
    circle(ctx, 31.5, headY, 3.2);
    circle(ctx, 64.5, headY, 3.2);
    circle(ctx, 48, headY, 17);
    drawHairFront(ctx, parts.hairStyle, palette.hair, palette.hairHighlight, headY);
    if (view === "front") drawFaceFront(ctx, blink, headY);
    else drawFaceSide(ctx, headY);
  }
  drawAccessory(ctx, parts.accessory, palette, view, headY);
}

function drawFaceFront(ctx: CanvasRenderingContext2D, blink: boolean, headY: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (blink) {
    strokePath(ctx, () => { ctx.moveTo(39.5, headY); ctx.lineTo(44.5, headY); });
    strokePath(ctx, () => { ctx.moveTo(51.5, headY); ctx.lineTo(56.5, headY); });
  } else {
    circle(ctx, 42, headY, 2.8);
    circle(ctx, 54, headY, 2.8);
    ctx.fillStyle = "#ffffff";
    circle(ctx, 43, headY - 1, 0.9);
    circle(ctx, 55, headY - 1, 0.9);
    ctx.fillStyle = INK;
  }
  strokePath(ctx, () => { ctx.moveTo(43, headY + 7); ctx.quadraticCurveTo(48, headY + 12, 53, headY + 7); });
}

function drawFaceSide(ctx: CanvasRenderingContext2D, headY: number): void {
  ctx.fillStyle = INK;
  circle(ctx, 55, headY, 2.4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  strokePath(ctx, () => { ctx.moveTo(62, headY + 2); ctx.quadraticCurveTo(65, headY + 3, 64, headY + 6); });
  strokePath(ctx, () => { ctx.moveTo(55, headY + 8); ctx.quadraticCurveTo(58, headY + 10, 61, headY + 8); });
}

function hairShine(ctx: CanvasRenderingContext2D, highlight: string): void {
  ctx.strokeStyle = highlight;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.75;
  strokePath(ctx, () => { ctx.moveTo(38, 22); ctx.quadraticCurveTo(44, 18, 51, 20); });
  ctx.globalAlpha = 1;
}

function drawHairFront(
  ctx: CanvasRenderingContext2D,
  style: StudioVirtualAvatarHairStyle,
  hair: string,
  highlight: string,
  headY: number,
): void {
  void headY;
  ctx.fillStyle = hair;
  const cap = () => ellipse(ctx, 48, 27, 18, 11);
  switch (style) {
    case "bob":
      cap(); hairShine(ctx, highlight);
      roundRect(ctx, 29, 28, 9, 24, 4.5);
      roundRect(ctx, 58, 28, 9, 24, 4.5);
      break;
    case "long":
      cap(); hairShine(ctx, highlight);
      roundRect(ctx, 28, 28, 9, 52, 4.5);
      roundRect(ctx, 59, 28, 9, 52, 4.5);
      break;
    case "short":
      ellipse(ctx, 48, 27, 17, 10);
      hairShine(ctx, highlight);
      break;
    case "twin":
      cap(); hairShine(ctx, highlight);
      ellipse(ctx, 22, 56, 7, 13);
      ellipse(ctx, 74, 56, 7, 13);
      ctx.fillStyle = highlight;
      circle(ctx, 24, 42, 3.2);
      circle(ctx, 72, 42, 3.2);
      break;
    case "wave":
      cap(); hairShine(ctx, highlight);
      ctx.strokeStyle = hair;
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(30, 30); ctx.quadraticCurveTo(23, 40, 30, 50); ctx.quadraticCurveTo(37, 60, 30, 68); });
      strokePath(ctx, () => { ctx.moveTo(66, 30); ctx.quadraticCurveTo(73, 40, 66, 50); ctx.quadraticCurveTo(59, 60, 66, 68); });
      break;
    case "crop":
      ellipse(ctx, 48, 26, 18, 9);
      hairShine(ctx, highlight);
      roundRect(ctx, 33, 28, 30, 9, 4.5);
      break;
    case "ponytail":
      cap(); hairShine(ctx, highlight);
      ctx.strokeStyle = hair;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(62, 24); ctx.quadraticCurveTo(74, 16, 78, 4); });
      ctx.fillStyle = highlight;
      circle(ctx, 62, 24, 3.5);
      break;
    case "bun":
      cap(); hairShine(ctx, highlight);
      ctx.fillStyle = hair;
      circle(ctx, 48, 13, 8);
      ctx.strokeStyle = highlight;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      strokePath(ctx, () => { ctx.moveTo(40, 13); ctx.arc(48, 13, 8, Math.PI, 0); });
      ctx.globalAlpha = 1;
      break;
    case "curly":
      cap();
      for (const [x, y, r] of [[32, 22, 5.5], [41, 16, 5.5], [50, 14, 5.5], [59, 17, 5.5], [65, 24, 5.5], [29, 31, 5], [67, 31, 5]] as const) {
        circle(ctx, x, y, r);
      }
      break;
    case "braid":
      cap(); hairShine(ctx, highlight);
      ellipse(ctx, 63, 48, 5, 6.5);
      ellipse(ctx, 63, 59, 5, 6.5);
      ellipse(ctx, 63, 70, 5, 6.5);
      ctx.fillStyle = highlight;
      circle(ctx, 63, 77, 3);
      break;
    case "pigtails":
      cap(); hairShine(ctx, highlight);
      ellipse(ctx, 27, 42, 6, 9);
      ellipse(ctx, 69, 42, 6, 9);
      ctx.fillStyle = highlight;
      circle(ctx, 29, 33, 2.8);
      circle(ctx, 67, 33, 2.8);
      break;
    case "mohawk":
      ctx.fillStyle = hair;
      roundRect(ctx, 43, 10, 10, 24, 5);
      ctx.strokeStyle = highlight;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.8;
      strokePath(ctx, () => { ctx.moveTo(48, 12); ctx.lineTo(48, 30); });
      ctx.globalAlpha = 1;
      break;
    default:
      cap();
      hairShine(ctx, highlight);
      break;
  }
}

function drawHairBack(
  ctx: CanvasRenderingContext2D,
  style: StudioVirtualAvatarHairStyle,
  hair: string,
  highlight: string,
  headY: number,
): void {
  void highlight;
  void headY;
  ctx.fillStyle = hair;
  const panel = () => ellipse(ctx, 48, 38, 19, 20);
  switch (style) {
    case "long":
      panel();
      roundRect(ctx, 28, 40, 10, 44, 5);
      roundRect(ctx, 58, 40, 10, 44, 5);
      break;
    case "twin":
      panel();
      ellipse(ctx, 22, 56, 7, 13);
      ellipse(ctx, 74, 56, 7, 13);
      break;
    case "ponytail":
      panel();
      ctx.strokeStyle = hair;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(60, 26); ctx.quadraticCurveTo(72, 18, 76, 6); });
      break;
    case "braid":
      panel();
      ellipse(ctx, 48, 52, 6, 7);
      ellipse(ctx, 48, 64, 6, 7);
      ellipse(ctx, 48, 76, 6, 7);
      break;
    case "bun":
      panel();
      circle(ctx, 48, 16, 8);
      break;
    case "mohawk":
      roundRect(ctx, 43, 12, 10, 26, 5);
      break;
    default:
      panel();
      break;
  }
}

function drawOutfitDetail(
  ctx: CanvasRenderingContext2D,
  style: StudioVirtualAvatarOutfitStyle,
  accent: string,
  bob: number,
): void {
  const line = "rgba(0,0,0,0.22)";
  const y = bob * 0.5;
  switch (style) {
    case "hoodie":
      ctx.strokeStyle = line;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(38, 60 + y); ctx.quadraticCurveTo(48, 51 + y, 58, 60 + y); });
      ctx.fillStyle = line;
      roundRect(ctx, 41, 73 + y, 14, 9, 3);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      strokePath(ctx, () => { ctx.moveTo(45, 63 + y); ctx.lineTo(45, 71 + y); });
      strokePath(ctx, () => { ctx.moveTo(51, 63 + y); ctx.lineTo(51, 71 + y); });
      break;
    case "tee":
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      circle(ctx, 48, 69 + y, 4);
      ctx.globalAlpha = 1;
      break;
    case "jacket":
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.moveTo(48, 60 + y); ctx.lineTo(42, 72 + y); ctx.lineTo(48, 80 + y); ctx.lineTo(54, 72 + y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      strokePath(ctx, () => { ctx.moveTo(48, 60 + y); ctx.lineTo(48, 90 + y); });
      ctx.globalAlpha = 1;
      break;
    case "dress":
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(37, 76 + y); ctx.lineTo(29, 96 + y); ctx.lineTo(67, 96 + y); ctx.lineTo(59, 76 + y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = line;
      roundRect(ctx, 36, 74 + y, 24, 4, 2);
      break;
    case "suit":
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(48, 60 + y); ctx.lineTo(43, 70 + y); ctx.lineTo(48, 76 + y); ctx.lineTo(53, 70 + y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(48, 63 + y); ctx.lineTo(45, 69 + y); ctx.lineTo(48, 82 + y); ctx.lineTo(51, 69 + y);
      ctx.closePath(); ctx.fill();
      break;
    case "sweater":
      ctx.fillStyle = line;
      roundRect(ctx, 42, 56 + y, 12, 5, 2.5);
      ctx.lineWidth = 2;
      ctx.strokeStyle = line;
      strokePath(ctx, () => { ctx.moveTo(34, 70 + y); ctx.lineTo(62, 70 + y); });
      strokePath(ctx, () => { ctx.moveTo(34, 78 + y); ctx.lineTo(62, 78 + y); });
      break;
    case "uniform":
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(42, 58 + y); ctx.lineTo(48, 63 + y); ctx.lineTo(54, 58 + y); });
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      circle(ctx, 48, 70 + y, 1.6);
      circle(ctx, 48, 76 + y, 1.6);
      ctx.fillStyle = line;
      roundRect(ctx, 53, 66 + y, 7, 6, 1.5);
      break;
    case "apron":
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      strokePath(ctx, () => { ctx.moveTo(41, 58 + y); ctx.lineTo(41, 68 + y); });
      strokePath(ctx, () => { ctx.moveTo(55, 58 + y); ctx.lineTo(55, 68 + y); });
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.8;
      roundRect(ctx, 39, 66 + y, 18, 22, 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = line;
      roundRect(ctx, 43, 76 + y, 10, 7, 2);
      break;
    case "coat":
      ctx.fillStyle = line;
      ctx.globalAlpha = 0.35;
      roundRect(ctx, 31, 58 + y, 34, 38, 10);
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(31, 74 + y, 34, 5);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(42, 58 + y); ctx.lineTo(48, 64 + y); ctx.lineTo(54, 58 + y); });
      ctx.globalAlpha = 1;
      break;
    case "sportswear":
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(33, 66 + y, 30, 5);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(27, 68.5 + y); ctx.lineTo(34, 68.5 + y); });
      strokePath(ctx, () => { ctx.moveTo(62, 68.5 + y); ctx.lineTo(69, 68.5 + y); });
      break;
    case "cardigan":
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(48, 60 + y); ctx.lineTo(48, 90 + y); });
      ctx.fillStyle = INK;
      circle(ctx, 48, 68 + y, 1.6);
      circle(ctx, 48, 75 + y, 1.6);
      circle(ctx, 48, 82 + y, 1.6);
      break;
    case "overalls":
      ctx.fillStyle = accent;
      ctx.fillRect(40, 56 + y, 5, 16);
      ctx.fillRect(51, 56 + y, 5, 16);
      ctx.globalAlpha = 0.85;
      roundRect(ctx, 40, 70 + y, 16, 13, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = line;
      roundRect(ctx, 44, 74 + y, 8, 5, 1.5);
      break;
    default:
      break;
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  accessory: StudioVirtualAvatarAccessory,
  palette: ProceduralCharacterPalette,
  view: FigureView,
  headY: number,
): void {
  const accent = palette.accent;
  const hair = palette.hair;
  const line = "rgba(0,0,0,0.2)";
  const y = headY - 38; // 머리 중심 오프셋 (bob 반영)
  switch (accessory) {
    case "beret":
      ctx.save();
      ctx.translate(40, 16 + y);
      ctx.rotate(-0.21);
      ctx.fillStyle = accent;
      ellipse(ctx, 0, 0, 12, 7);
      ctx.restore();
      ctx.fillStyle = accent;
      circle(ctx, 40, 8.5 + y, 1.8);
      break;
    case "bow":
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(62, 20 + y); ctx.lineTo(54, 14 + y); ctx.lineTo(56, 24 + y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(62, 20 + y); ctx.lineTo(70, 14 + y); ctx.lineTo(68, 24 + y);
      ctx.closePath(); ctx.fill();
      circle(ctx, 62, 20 + y, 3);
      break;
    case "cat":
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.moveTo(36, 22 + y); ctx.lineTo(30, 8 + y); ctx.lineTo(45, 17 + y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(60, 22 + y); ctx.lineTo(66, 8 + y); ctx.lineTo(51, 17 + y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e8a0a0";
      ctx.beginPath();
      ctx.moveTo(37, 19 + y); ctx.lineTo(33, 11 + y); ctx.lineTo(42, 16 + y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(59, 19 + y); ctx.lineTo(63, 11 + y); ctx.lineTo(54, 16 + y);
      ctx.closePath(); ctx.fill();
      break;
    case "headphones":
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(30, 34 + y); ctx.quadraticCurveTo(30, 12 + y, 48, 12 + y); ctx.quadraticCurveTo(66, 12 + y, 66, 34 + y); });
      ctx.fillStyle = accent;
      roundRect(ctx, 26, 30 + y, 7, 12, 3.5);
      roundRect(ctx, 63, 30 + y, 7, 12, 3.5);
      break;
    case "leaf":
      ctx.fillStyle = "#4caf6d";
      ctx.beginPath();
      ctx.moveTo(62, 18 + y);
      ctx.quadraticCurveTo(70, 12 + y, 74, 18 + y);
      ctx.quadraticCurveTo(68, 24 + y, 62, 18 + y);
      ctx.closePath(); ctx.fill();
      break;
    case "star":
      ctx.fillStyle = accent;
      drawStar(ctx, 63, 16 + y, 5);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "glasses":
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      if (view === "side") {
        roundRect(ctx, 50, 34 + y, 12, 8, 3);
        ctx.stroke();
      } else {
        roundRect(ctx, 36, 34 + y, 11, 9, 3.5);
        ctx.stroke();
        roundRect(ctx, 49, 34 + y, 11, 9, 3.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(47, 37 + y); ctx.lineTo(49, 37 + y);
        ctx.stroke();
      }
      break;
    case "cap":
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(31, 26 + y);
      ctx.arc(48, 26 + y, 17, Math.PI, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = line;
      roundRect(ctx, 30, 24 + y, 36, 5, 2.5);
      ctx.fill();
      break;
    case "headband":
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(32, 28 + y); ctx.quadraticCurveTo(48, 18 + y, 64, 28 + y); });
      break;
    case "none":
      break;
    default:
      break;
  }
}

/* ---------------- 시트 생성 ---------------- */

/** 프로시저럴 스프라이트 시트 (B 트랙 렌더러·미리보기 공용). */
export interface ProceduralCharacterSheet {
  readonly canvas: HTMLCanvasElement;
  /** Phaser 텍스처·<img>에 바로 쓰는 dataURL. */
  readonly dataUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly width: number;
  readonly height: number;
  readonly directions: Readonly<Record<StudioSpriteDirection, number>>;
}

interface CellDrawSpec {
  readonly direction: StudioSpriteDirection;
  readonly view: FigureView;
  readonly mirror: boolean;
  readonly tilt: number;
  readonly walkPhase: number | null;
  readonly bobY: number;
  readonly blink: boolean;
}

function cellSpec(
  direction: StudioSpriteDirection,
  frame: number,
  motion: "idle" | "walk",
): CellDrawSpec {
  let view: FigureView = "front";
  let mirror = false;
  let tilt = 0;
  switch (direction) {
    case "down": view = "front"; break;
    case "down-left": view = "front"; tilt = -0.24; break;
    case "down-right": view = "front"; tilt = 0.24; break;
    case "left": view = "side"; mirror = true; break;
    case "right": view = "side"; break;
    case "up": view = "back"; break;
    case "up-left": view = "back"; tilt = -0.24; break;
    case "up-right": view = "back"; tilt = 0.24; break;
  }
  if (motion === "idle") {
    return { direction, view, mirror, tilt, walkPhase: null,
      bobY: proceduralIdleBobY(frame), blink: proceduralIdleBlink(frame) };
  }
  const phase = (clampFrame(frame, PROCEDURAL_WALK_FRAME_COUNT) / PROCEDURAL_WALK_FRAME_COUNT) * Math.PI * 2;
  return { direction, view, mirror, tilt, walkPhase: phase,
    bobY: -2 * Math.abs(Math.cos(phase)), blink: false };
}

/**
 * 팔레트·파츠로 8방향 × (걷기 6 + idle 4) 스프라이트 시트를 만든다.
 * B 트랙 계약: `{ canvas, frameWidth, frameHeight, directions }`.
 */
export function buildProceduralCharacterSheet(
  palette: ProceduralCharacterPalette,
  parts: ProceduralCharacterParts = DEFAULT_PROCEDURAL_PARTS,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): ProceduralCharacterSheet {
  assertPalette(palette);
  const canvas = deps.createCanvas(PROCEDURAL_SHEET_WIDTH, PROCEDURAL_SHEET_HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, PROCEDURAL_SHEET_WIDTH, PROCEDURAL_SHEET_HEIGHT);
  for (const direction of PROCEDURAL_SPRITE_DIRECTIONS) {
    const row = PROCEDURAL_DIRECTION_ROWS[direction] ?? 0;
    for (let frame = 0; frame < PROCEDURAL_WALK_FRAME_COUNT; frame++) {
      const spec = cellSpec(direction, frame, "walk");
      ctx.save();
      ctx.translate(frame * PROCEDURAL_FRAME_WIDTH, row * PROCEDURAL_FRAME_HEIGHT);
      drawProceduralCharacterFrame(ctx, { palette, parts, view: spec.view, walkPhase: spec.walkPhase,
        bobY: spec.bobY, blink: spec.blink, mirror: spec.mirror, tilt: spec.tilt });
      ctx.restore();
    }
    for (let frame = 0; frame < PROCEDURAL_IDLE_FRAME_COUNT; frame++) {
      const spec = cellSpec(direction, frame, "idle");
      ctx.save();
      ctx.translate((PROCEDURAL_WALK_FRAME_COUNT + frame) * PROCEDURAL_FRAME_WIDTH, row * PROCEDURAL_FRAME_HEIGHT);
      drawProceduralCharacterFrame(ctx, { palette, parts, view: spec.view, walkPhase: spec.walkPhase,
        bobY: spec.bobY, blink: spec.blink, mirror: spec.mirror, tilt: spec.tilt });
      ctx.restore();
    }
  }
  return Object.freeze({
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
    frameWidth: PROCEDURAL_FRAME_WIDTH,
    frameHeight: PROCEDURAL_FRAME_HEIGHT,
    width: PROCEDURAL_SHEET_WIDTH,
    height: PROCEDURAL_SHEET_HEIGHT,
    directions: PROCEDURAL_DIRECTION_ROWS,
  });
}

/** 커스터마이저 미리보기용 단일 셀 (정면 idle, 깜빡임 없음). */
export function renderProceduralCharacterPreview(
  palette: ProceduralCharacterPalette,
  parts: ProceduralCharacterParts = DEFAULT_PROCEDURAL_PARTS,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): { readonly dataUrl: string; readonly width: number; readonly height: number } {
  assertPalette(palette);
  const canvas = deps.createCanvas(PROCEDURAL_FRAME_WIDTH, PROCEDURAL_FRAME_HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, PROCEDURAL_FRAME_WIDTH, PROCEDURAL_FRAME_HEIGHT);
  const spec = cellSpec("down", 0, "idle");
  drawProceduralCharacterFrame(ctx, { palette, parts, view: spec.view, walkPhase: spec.walkPhase,
    bobY: 0, blink: false, mirror: spec.mirror, tilt: spec.tilt });
  return Object.freeze({ dataUrl: canvas.toDataURL("image/png"), width: PROCEDURAL_FRAME_WIDTH, height: PROCEDURAL_FRAME_HEIGHT });
}

/* ---------------- 스킨 등록 ---------------- */

export interface ProceduralCharacterSkinIdentity {
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
  /**
   * 독립 작화의 출처 테마. 프로시저럴 원본은 아트 스타일과 무관하므로
   * `studioCharacterSkinForArtStyle`의 v5 URL 재매핑에서 원본을 보존하기 위해
   * 고정 테마를 지정한다.
   */
  readonly nativeArtStyle?: StudioVirtualArtStyleKey;
}

const PROCEDURAL_PRESENTATION: StudioCharacterFramePresentation = Object.freeze({
  originX: 0.5,
  originY: 0.95,
  displayHeightRatio: 0.96,
});

const PROCEDURAL_ATLAS: StudioCharacterAtlasLayout = Object.freeze({
  width: PROCEDURAL_SHEET_WIDTH,
  height: PROCEDURAL_SHEET_HEIGHT,
  columns: PROCEDURAL_SHEET_COLUMNS,
  rows: PROCEDURAL_SHEET_ROWS,
  slicing: "rounded-grid",
});

const PROCEDURAL_FRAMES = Object.freeze(
  Array.from({ length: PROCEDURAL_SHEET_COLUMNS * PROCEDURAL_SHEET_ROWS }, () => PROCEDURAL_PRESENTATION),
);

/**
 * 프로시저럴 시트를 `StudioCharacterSkin`으로 등록한다.
 * - sharedAtlas: 전 방향·행동이 하나의 dataURL 원본을 공유한다
 * - 걷기 클립: 방향별 6프레임, idle 정지 프레임은 클립 0번(중립 서기)
 * - wave/sit 포즈는 별도 시트가 없어 생략한다 (렌더러가 idle 프레임으로 폴백)
 */
export function createProceduralCharacterSkin(
  identity: ProceduralCharacterSkinIdentity,
  palette: ProceduralCharacterPalette,
  parts: ProceduralCharacterParts = DEFAULT_PROCEDURAL_PARTS,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioCharacterSkin {
  const sheet = buildProceduralCharacterSheet(palette, parts, deps);
  const url = sheet.dataUrl;
  const walkClip = (facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip => {
    const start = (PROCEDURAL_FACING_ROWS[facing] ?? 0) * PROCEDURAL_SHEET_COLUMNS;
    return Object.freeze({
      textureUrl: url,
      frameWidth: PROCEDURAL_FRAME_WIDTH,
      frameHeight: PROCEDURAL_FRAME_HEIGHT,
      atlas: PROCEDURAL_ATLAS,
      start,
      end: start + PROCEDURAL_WALK_FRAME_COUNT - 1,
      frameRate: 8,
      repeat: -1,
      distancePerCycle: 76,
      technique: "drawn",
      frames: Object.freeze(PROCEDURAL_FRAMES.slice(start, start + PROCEDURAL_WALK_FRAME_COUNT)),
    });
  };
  const actionClip = (facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip => {
    const index = (PROCEDURAL_FACING_ROWS[facing] ?? 0) * PROCEDURAL_SHEET_COLUMNS + PROCEDURAL_WALK_FRAME_COUNT;
    return Object.freeze({
      textureUrl: url,
      frameWidth: PROCEDURAL_FRAME_WIDTH,
      frameHeight: PROCEDURAL_FRAME_HEIGHT,
      atlas: PROCEDURAL_ATLAS,
      start: index,
      end: index,
      frameRate: 2,
      repeat: 0,
      technique: "drawn",
      frames: Object.freeze(PROCEDURAL_FRAMES.slice(index, index + 1)),
    });
  };
  const actions = Object.freeze({
    talk: Object.freeze({ down: actionClip("down"), right: actionClip("right"), left: actionClip("left"), up: actionClip("up") }),
    draw: Object.freeze({ down: actionClip("down"), right: actionClip("right"), left: actionClip("left"), up: actionClip("up") }),
    review: Object.freeze({ down: actionClip("down"), right: actionClip("right"), left: actionClip("left"), up: actionClip("up") }),
  });
  return Object.freeze({
    key: identity.key,
    labelKo: identity.labelKo,
    labelEn: identity.labelEn,
    ...(identity.nativeArtStyle ? { nativeArtStyle: identity.nativeArtStyle } : {}),
    sharedAtlas: true,
    directional: Object.freeze({ down: url, right: url, left: url, up: url }),
    clips: Object.freeze({
      "walk-down": walkClip("down"),
      "walk-right": walkClip("right"),
      "walk-left": walkClip("left"),
      "walk-up": walkClip("up"),
    }),
    idleFrames: Object.freeze({
      down: proceduralSheetCellIndex("down", 0, "walk"),
      right: proceduralSheetCellIndex("right", 0, "walk"),
      left: proceduralSheetCellIndex("left", 0, "walk"),
      up: proceduralSheetCellIndex("up", 0, "walk"),
    }),
    actions,
  });
}
