/**
 * 프로시저럴 동물 스프라이트 (Track 4 · 펫·크리터)
 *
 * 고양이·강아지·여우(펫 3종)와 새·나비·토끼(앰비언트 크리터 3종)를
 * 캔버스 2D로 직접 그려 스프라이트 시트를 만든다. 외부 에셋 없이
 * 코드만으로 생성하므로 라이선스 문제가 없다.
 *
 * 시트 구성: 3방향(정면/후면/측면) × (걷기 4프레임 + idle 3프레임).
 * B 트랙 계약: `{ dataUrl, frameWidth, frameHeight, width, height, directions }`.
 */

import { defaultProceduralSheetDeps, type ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";

/** 동물 스프라이트 종류. */
export type StudioAnimalSpriteKind = "cat" | "dog" | "fox" | "bird" | "butterfly" | "rabbit";

export const STUDIO_ANIMAL_SPRITE_KINDS: readonly StudioAnimalSpriteKind[] = Object.freeze([
  "cat", "dog", "fox", "bird", "butterfly", "rabbit",
]);

/** 펫으로 입양 가능한 종류. */
export const STUDIO_PET_ANIMAL_KINDS: readonly StudioAnimalSpriteKind[] = Object.freeze(["cat", "dog", "fox"]);

export const STUDIO_ANIMAL_FRAME = 64;
export const STUDIO_ANIMAL_WALK_FRAMES = 4;
export const STUDIO_ANIMAL_IDLE_FRAMES = 3;
const COLUMNS = STUDIO_ANIMAL_WALK_FRAMES + STUDIO_ANIMAL_IDLE_FRAMES;
const ROWS = 3;

type AnimalView = "front" | "side" | "back";

interface AnimalPalette {
  readonly body: string;
  readonly belly: string;
  readonly ear: string;
  readonly accent: string;
}

const PALETTES: Readonly<Record<StudioAnimalSpriteKind, AnimalPalette>> = Object.freeze({
  cat:      { body: "#e8913a", belly: "#f7d9a8", ear: "#c96f22", accent: "#8a4d16" },
  dog:      { body: "#a9744f", belly: "#d9b98c", ear: "#7c5233", accent: "#5b3a22" },
  fox:      { body: "#d9622b", belly: "#f6ead9", ear: "#a83f14", accent: "#7c2d0d" },
  bird:     { body: "#5aa9e6", belly: "#cfe8fa", ear: "#3d7fb8", accent: "#f5a623" },
  butterfly:{ body: "#6b4fa1", belly: "#c084fc", ear: "#f0abfc", accent: "#3d2b5c" },
  rabbit:   { body: "#b8b2a7", belly: "#e8e2d6", ear: "#d8a7b1", accent: "#8a8478" },
});

const META: Readonly<Record<StudioAnimalSpriteKind, { readonly ko: string; readonly en: string }>> = Object.freeze({
  cat: { ko: "고양이", en: "Cat" },
  dog: { ko: "강아지", en: "Dog" },
  fox: { ko: "여우", en: "Fox" },
  bird: { ko: "새", en: "Bird" },
  butterfly: { ko: "나비", en: "Butterfly" },
  rabbit: { ko: "토끼", en: "Rabbit" },
});

/** 동물 한글·영문 이름. */
export function studioAnimalSpriteLabel(kind: string): { readonly ko: string; readonly en: string } {
  return META[kind as StudioAnimalSpriteKind] ?? { ko: "동물", en: "Animal" };
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function triangle(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

interface DrawSpec {
  readonly view: AnimalView;
  readonly walkPhase: number | null;
  readonly bobY: number;
  readonly blink: boolean;
  readonly tailWag: number;
}

function drawLegs(ctx: CanvasRenderingContext2D, color: string, cx: number, baseY: number, spec: DrawSpec, spread: number): void {
  ctx.fillStyle = color;
  for (let leg = 0; leg < 4; leg += 1) {
    const swing = spec.walkPhase === null ? 0 : Math.sin(spec.walkPhase + leg * Math.PI) * 4;
    const lx = cx + (leg < 2 ? -spread : spread) + (leg % 2 === 0 ? -4 : 4);
    ctx.fillRect(lx - 2.5, baseY - 8 + swing * 0.4, 5, 10 - swing * 0.4);
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, blink: boolean): void {
  ctx.fillStyle = "#26262e";
  if (blink) {
    ctx.fillRect(x1 - 3, y - 1, 6, 2);
    ctx.fillRect(x2 - 3, y - 1, 6, 2);
  } else {
    circle(ctx, x1, y, 2.4);
    circle(ctx, x2, y, 2.4);
  }
}

/** 네 발 동물(고양이·강아지·여우·토끼) 몸통. */
function drawQuadruped(
  ctx: CanvasRenderingContext2D,
  kind: StudioAnimalSpriteKind,
  palette: AnimalPalette,
  spec: DrawSpec,
): void {
  const cx = 32;
  const bob = spec.bobY;
  if (spec.view === "side") {
    // 몸통 (수평 타원)
    ctx.fillStyle = palette.body;
    ellipse(ctx, cx, 40 + bob, 17, 10);
    ctx.fillStyle = palette.belly;
    ellipse(ctx, cx + 2, 43 + bob, 11, 6);
    // 다리
    drawLegs(ctx, palette.accent, cx, 50 + bob, spec, 10);
    // 머리 (앞쪽)
    ctx.fillStyle = palette.body;
    circle(ctx, cx + 16, 30 + bob, 9);
    if (kind === "dog" || kind === "fox") {
      ctx.fillStyle = palette.belly;
      ellipse(ctx, cx + 20, 33 + bob, 5, 3.5); // 주둥이
      ctx.fillStyle = "#26262e";
      circle(ctx, cx + 24, 31 + bob, 1.8); // 코
    }
    if (kind === "rabbit") {
      // 긴 귀
      ctx.fillStyle = palette.body;
      ellipse(ctx, cx + 13, 16 + bob, 3.4, 9);
      ellipse(ctx, cx + 19, 16 + bob, 3.4, 9);
      ctx.fillStyle = palette.ear;
      ellipse(ctx, cx + 13, 16 + bob, 1.6, 6);
      ellipse(ctx, cx + 19, 16 + bob, 1.6, 6);
      // 몽글 꼬리
      ctx.fillStyle = palette.belly;
      circle(ctx, cx - 17, 38 + bob, 4.5);
    } else {
      // 뾰족 귀 (고양이·여우) / 처진 귀 (강아지)
      if (kind === "dog") {
        ctx.fillStyle = palette.ear;
        ellipse(ctx, cx + 11, 30 + bob, 3.5, 7);
      } else {
        ctx.fillStyle = palette.ear;
        triangle(ctx, cx + 10, 26 + bob, cx + 14, 16 + bob, cx + 17, 25 + bob);
        triangle(ctx, cx + 16, 25 + bob, cx + 20, 16 + bob, cx + 22, 26 + bob);
      }
      // 꼬리 (흔들림)
      const wag = Math.sin(spec.tailWag) * 4;
      ctx.strokeStyle = palette.body;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 16, 36 + bob);
      ctx.quadraticCurveTo(cx - 26, 32 + bob + wag, cx - 24, 22 + bob + wag);
      ctx.stroke();
      if (kind === "fox") {
        ctx.fillStyle = palette.belly;
        circle(ctx, cx - 24, 22 + bob + wag, 3.6); // 여우 꼬리 끝 흰색
      }
    }
    drawEyes(ctx, cx + 14, cx + 20, 29 + bob, spec.blink);
  } else {
    // 정면/후면
    const isBack = spec.view === "back";
    ctx.fillStyle = palette.body;
    ellipse(ctx, cx, 42 + bob, 13, 11);
    drawLegs(ctx, palette.accent, cx, 52 + bob, spec, 7);
    if (isBack) {
      // 후면: 꼬리·귀만
      ctx.fillStyle = palette.body;
      if (kind === "rabbit") {
        ellipse(ctx, cx - 5, 30 + bob, 3.4, 9);
        ellipse(ctx, cx + 5, 30 + bob, 3.4, 9);
        circle(ctx, cx, 44 + bob, 4.5);
      } else {
        const wag = Math.sin(spec.tailWag) * 3;
        ctx.save();
        ctx.translate(cx, 40 + bob);
        ctx.rotate(wag * 0.06);
        ellipse(ctx, 0, 8, 5, 10);
        ctx.restore();
        if (kind !== "dog") {
          ctx.fillStyle = palette.ear;
          triangle(ctx, cx - 9, 32 + bob, cx - 6, 22 + bob, cx - 2, 31 + bob);
          triangle(ctx, cx + 2, 31 + bob, cx + 6, 22 + bob, cx + 9, 32 + bob);
        }
      }
    } else {
      // 정면: 얼굴
      ctx.fillStyle = palette.body;
      circle(ctx, cx, 30 + bob, 10);
      if (kind === "rabbit") {
        ctx.fillStyle = palette.body;
        ellipse(ctx, cx - 5, 16 + bob, 3.4, 9);
        ellipse(ctx, cx + 5, 16 + bob, 3.4, 9);
        ctx.fillStyle = palette.ear;
        ellipse(ctx, cx - 5, 16 + bob, 1.6, 6);
        ellipse(ctx, cx + 5, 16 + bob, 1.6, 6);
      } else if (kind === "dog") {
        ctx.fillStyle = palette.ear;
        ellipse(ctx, cx - 8, 30 + bob, 3.5, 7);
        ellipse(ctx, cx + 8, 30 + bob, 3.5, 7);
        ctx.fillStyle = palette.belly;
        ellipse(ctx, cx, 34 + bob, 5, 3.5);
      } else {
        ctx.fillStyle = palette.ear;
        triangle(ctx, cx - 9, 26 + bob, cx - 6, 16 + bob, cx - 2, 25 + bob);
        triangle(ctx, cx + 2, 25 + bob, cx + 6, 16 + bob, cx + 9, 26 + bob);
        if (kind === "fox") {
          ctx.fillStyle = palette.belly;
          triangle(ctx, cx - 4, 36 + bob, cx + 4, 36 + bob, cx, 32 + bob);
        }
      }
      drawEyes(ctx, cx - 4, cx + 4, 29 + bob, spec.blink);
    }
  }
}

/** 새. */
function drawBird(ctx: CanvasRenderingContext2D, palette: AnimalPalette, spec: DrawSpec): void {
  const cx = 32;
  const bob = spec.bobY;
  const flap = spec.walkPhase === null ? Math.sin(spec.tailWag * 0.6) * 0.35 : Math.sin(spec.walkPhase) * 0.9;
  ctx.fillStyle = palette.body;
  if (spec.view === "side") {
    ellipse(ctx, cx, 36 + bob, 11, 8);
    // 날개 (퍼덕임)
    ctx.save();
    ctx.translate(cx - 2, 34 + bob);
    ctx.rotate(-0.4 - flap * 0.7);
    ellipse(ctx, -7, 0, 9, 4);
    ctx.restore();
    circle(ctx, cx + 9, 30 + bob, 6.5); // 머리
    ctx.fillStyle = palette.accent;
    triangle(ctx, cx + 14, 29 + bob, cx + 19, 31 + bob, cx + 14, 33 + bob); // 부리
    ctx.fillStyle = palette.ear;
    triangle(ctx, cx - 10, 34 + bob, cx - 17, 30 + bob, cx - 10, 38 + bob); // 꼬리
    drawEyes(ctx, cx + 8, cx + 12, 29 + bob, spec.blink);
    // 다리
    ctx.fillStyle = palette.accent;
    ctx.fillRect(cx - 3, 43 + bob, 2.5, 6);
    ctx.fillRect(cx + 3, 43 + bob, 2.5, 6);
  } else {
    const isBack = spec.view === "back";
    ellipse(ctx, cx, 38 + bob, 9, 9);
    ctx.save();
    ctx.translate(cx, 36 + bob);
    ctx.rotate(-0.5 - flap * 0.7);
    ellipse(ctx, -8, 0, 9, 4);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, 36 + bob);
    ctx.rotate(0.5 + flap * 0.7);
    ellipse(ctx, 8, 0, 9, 4);
    ctx.restore();
    if (!isBack) {
      circle(ctx, cx, 30 + bob, 6);
      ctx.fillStyle = palette.accent;
      triangle(ctx, cx - 2, 31 + bob, cx + 2, 31 + bob, cx, 35 + bob);
      drawEyes(ctx, cx - 3, cx + 3, 29 + bob, spec.blink);
    }
  }
}

/** 나비. */
function drawButterfly(ctx: CanvasRenderingContext2D, palette: AnimalPalette, spec: DrawSpec): void {
  const cx = 32;
  const bob = spec.bobY;
  const flap = spec.walkPhase === null ? 0.45 + Math.sin(spec.tailWag * 0.8) * 0.35 : 0.2 + Math.abs(Math.sin(spec.walkPhase)) * 0.7;
  const wingH = 13 * flap + 3;
  ctx.fillStyle = palette.ear;
  ellipse(ctx, cx - 8, 32 + bob, 8, wingH);
  ellipse(ctx, cx + 8, 32 + bob, 8, wingH);
  ctx.fillStyle = palette.belly;
  ellipse(ctx, cx - 8, 32 + bob, 4, wingH * 0.55);
  ellipse(ctx, cx + 8, 32 + bob, 4, wingH * 0.55);
  // 몸통
  ctx.fillStyle = palette.body;
  ellipse(ctx, cx, 34 + bob, 3, 9);
  circle(ctx, cx, 26 + bob, 3);
  // 더듬이
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 1, 24 + bob);
  ctx.quadraticCurveTo(cx - 5, 18 + bob, cx - 8, 19 + bob);
  ctx.moveTo(cx + 1, 24 + bob);
  ctx.quadraticCurveTo(cx + 5, 18 + bob, cx + 8, 19 + bob);
  ctx.stroke();
}

export interface StudioAnimalSpriteSheet {
  readonly kind: StudioAnimalSpriteKind;
  /** Phaser 텍스처·<img>에 바로 쓰는 dataURL. */
  readonly dataUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly width: number;
  readonly height: number;
  readonly walkFrames: number;
  readonly idleFrames: number;
  readonly directions: Readonly<Record<"down" | "up" | "side", number>>;
}

function drawAnimalFrame(
  ctx: CanvasRenderingContext2D,
  kind: StudioAnimalSpriteKind,
  view: AnimalView,
  frame: number,
  motion: "walk" | "idle",
  timeSeed: number,
): void {
  const palette = PALETTES[kind];
  const walkPhase = motion === "walk" ? (frame / STUDIO_ANIMAL_WALK_FRAMES) * Math.PI * 2 : null;
  const spec: DrawSpec = {
    view,
    walkPhase,
    bobY: motion === "walk" ? -2 * Math.abs(Math.cos(walkPhase ?? 0)) : Math.sin(frame * 1.7) * 1.2,
    blink: motion === "idle" && frame === 2,
    tailWag: timeSeed + frame * 0.9,
  };
  if (kind === "bird") drawBird(ctx, palette, spec);
  else if (kind === "butterfly") drawButterfly(ctx, palette, spec);
  else drawQuadruped(ctx, kind, palette, spec);
}

/**
 * 동물 스프라이트 시트를 만든다.
 * 스킨 생성에 캔버스가 필요하므로 deps를 주입받는다 (테스트에서 스텁 주입).
 */
export function buildStudioAnimalSpriteSheet(
  kind: StudioAnimalSpriteKind,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioAnimalSpriteSheet {
  if (!PALETTES[kind]) throw new Error(`알 수 없는 동물 스프라이트: ${kind}`);
  const width = STUDIO_ANIMAL_FRAME * COLUMNS;
  const height = STUDIO_ANIMAL_FRAME * ROWS;
  const canvas = deps.createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, width, height);
  const views: readonly AnimalView[] = ["front", "back", "side"];
  views.forEach((view, row) => {
    for (let frame = 0; frame < STUDIO_ANIMAL_WALK_FRAMES; frame += 1) {
      ctx.save();
      ctx.translate(frame * STUDIO_ANIMAL_FRAME, row * STUDIO_ANIMAL_FRAME);
      drawAnimalFrame(ctx, kind, view, frame, "walk", row * 7 + frame);
      ctx.restore();
    }
    for (let frame = 0; frame < STUDIO_ANIMAL_IDLE_FRAMES; frame += 1) {
      ctx.save();
      ctx.translate((STUDIO_ANIMAL_WALK_FRAMES + frame) * STUDIO_ANIMAL_FRAME, row * STUDIO_ANIMAL_FRAME);
      drawAnimalFrame(ctx, kind, view, frame, "idle", row * 7 + frame);
      ctx.restore();
    }
  });
  return Object.freeze({
    kind,
    dataUrl: canvas.toDataURL("image/png"),
    frameWidth: STUDIO_ANIMAL_FRAME,
    frameHeight: STUDIO_ANIMAL_FRAME,
    width,
    height,
    walkFrames: STUDIO_ANIMAL_WALK_FRAMES,
    idleFrames: STUDIO_ANIMAL_IDLE_FRAMES,
    directions: Object.freeze({ down: 0, up: 1, side: 2 }),
  });
}

/** 미리보기용 단일 셀 (정면 idle 첫 프레임). */
export function renderStudioAnimalPreview(
  kind: StudioAnimalSpriteKind,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): { readonly dataUrl: string; readonly width: number; readonly height: number } {
  if (!PALETTES[kind]) throw new Error(`알 수 없는 동물 스프라이트: ${kind}`);
  const canvas = deps.createCanvas(STUDIO_ANIMAL_FRAME, STUDIO_ANIMAL_FRAME);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, STUDIO_ANIMAL_FRAME, STUDIO_ANIMAL_FRAME);
  drawAnimalFrame(ctx, kind, "front", 0, "idle", 0);
  return Object.freeze({ dataUrl: canvas.toDataURL("image/png"), width: STUDIO_ANIMAL_FRAME, height: STUDIO_ANIMAL_FRAME });
}
