/**
 * 프로시저럴 파티클 스프라이트 (Track 4 · 이펙트 에셋)
 *
 * 발자국 먼지·반짝임·빗방울·눈송이·나뭇잎·연기·꽃가루·물튐 8종을
 * 캔버스 2D로 직접 그린다. 외부 에셋 없이 코드만으로 생성한다.
 *
 * 각 스프라이트는 가로 스트립(프레임 수 × 셀 크기) dataURL이다.
 */

import { defaultProceduralSheetDeps, type ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";

/** 파티클 스프라이트 종류. */
export type StudioParticleSpriteKind =
  | "dust"
  | "sparkle"
  | "raindrop"
  | "snowflake"
  | "leaf"
  | "smoke"
  | "confetti"
  | "splash";

export const STUDIO_PARTICLE_SPRITE_KINDS: readonly StudioParticleSpriteKind[] = Object.freeze([
  "dust", "sparkle", "raindrop", "snowflake", "leaf", "smoke", "confetti", "splash",
]);

const META: Readonly<Record<StudioParticleSpriteKind, {
  readonly ko: string; readonly en: string; readonly cell: number; readonly frames: number;
}>> = Object.freeze({
  dust:      { ko: "먼지", en: "Dust", cell: 24, frames: 4 },
  sparkle:   { ko: "반짝임", en: "Sparkle", cell: 24, frames: 4 },
  raindrop:  { ko: "빗방울", en: "Raindrop", cell: 16, frames: 2 },
  snowflake: { ko: "눈송이", en: "Snowflake", cell: 20, frames: 2 },
  leaf:      { ko: "나뭇잎", en: "Leaf", cell: 20, frames: 3 },
  smoke:     { ko: "연기", en: "Smoke", cell: 32, frames: 4 },
  confetti:  { ko: "꽃가루", en: "Confetti", cell: 16, frames: 3 },
  splash:    { ko: "물튐", en: "Splash", cell: 28, frames: 4 },
});

/** 파티클 한글·영문 이름. */
export function studioParticleSpriteLabel(kind: string): { readonly ko: string; readonly en: string } {
  const entry = META[kind as StudioParticleSpriteKind];
  return entry ? { ko: entry.ko, en: entry.en } : { ko: "파티클", en: "Particle" };
}

export interface StudioParticleSprite {
  readonly kind: StudioParticleSpriteKind;
  readonly dataUrl: string;
  readonly cell: number;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
}

function drawDust(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  const radius = 3 + t * (cell / 2 - 3);
  ctx.fillStyle = `rgba(232, 228, 218, ${0.55 * (1 - t) + 0.05})`;
  ctx.beginPath();
  ctx.arc(cell / 2, cell / 2, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSparkle(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  const scale = 0.4 + 0.6 * Math.sin(t * Math.PI);
  const cx = cell / 2, cy = cell / 2;
  const arm = cell * 0.42 * scale;
  ctx.fillStyle = `rgba(255, 240, 180, ${0.35 + 0.65 * Math.sin(t * Math.PI)})`;
  ctx.beginPath();
  for (let armIndex = 0; armIndex < 4; armIndex += 1) {
    const angle = (armIndex / 4) * Math.PI * 2 + Math.PI / 4;
    const narrow = armIndex % 2 === 0 ? 0.16 : 0.3;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle - narrow) * arm, cy + Math.sin(angle - narrow) * arm);
    ctx.lineTo(cx + Math.cos(angle) * arm * 1.25, cy + Math.sin(angle) * arm * 1.25);
    ctx.lineTo(cx + Math.cos(angle + narrow) * arm, cy + Math.sin(angle + narrow) * arm);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fffbe8";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2 * scale + 0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawRaindrop(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const stretch = frame === 0 ? 1 : 1.35;
  ctx.fillStyle = "rgba(140, 190, 240, 0.85)";
  ctx.beginPath();
  ctx.ellipse(cell / 2, cell / 2, 3, 5.5 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(220, 240, 255, 0.7)";
  ctx.beginPath();
  ctx.ellipse(cell / 2 - 1, cell / 2 - 2, 1.1, 2.4 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowflake(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const cx = cell / 2, cy = cell / 2;
  const radius = cell * 0.36;
  const rotation = frame === 0 ? 0 : Math.PI / 6;
  ctx.strokeStyle = "rgba(240, 248, 255, 0.95)";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (let arm = 0; arm < 6; arm += 1) {
    const angle = rotation + (arm / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
    // 가지
    const bx = cx + Math.cos(angle) * radius * 0.6;
    const by = cy + Math.sin(angle) * radius * 0.6;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle + side * 0.5) * radius * 0.3, by + Math.sin(angle + side * 0.5) * radius * 0.3);
      ctx.stroke();
    }
  }
}

function drawLeaf(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const cx = cell / 2, cy = cell / 2;
  const tilt = (frame - 1) * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.fillStyle = frame === 2 ? "#d8a24a" : "#7fbf6a";
  ctx.beginPath();
  ctx.ellipse(0, 0, cell * 0.32, cell * 0.2, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 90, 50, 0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.28, cell * 0.1);
  ctx.lineTo(cell * 0.28, -cell * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawSmoke(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  const radius = cell * (0.18 + t * 0.22);
  const y = cell * (0.62 - t * 0.3);
  ctx.fillStyle = `rgba(200, 200, 205, ${0.4 * (1 - t) + 0.06})`;
  ctx.beginPath();
  ctx.arc(cell / 2 + Math.sin(t * 4) * 2, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawConfetti(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const colors = ["#ff8fb3", "#ffd166", "#8fd6ff"];
  const cx = cell / 2, cy = cell / 2;
  const angle = frame * 0.9;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = colors[frame % colors.length] ?? "#ffd166";
  ctx.fillRect(-5, -2.5, 10, 5);
  ctx.restore();
  ctx.fillStyle = colors[(frame + 1) % colors.length] ?? "#ff8fb3";
  ctx.beginPath();
  ctx.arc(cx - 4, cy + 5, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawSplash(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  ctx.strokeStyle = `rgba(150, 205, 250, ${0.9 * (1 - t) + 0.1})`;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  const baseY = cell * 0.72;
  const spread = 3 + t * (cell * 0.36);
  const height = 4 + Math.sin(t * Math.PI) * cell * 0.28;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cell / 2, baseY);
    ctx.quadraticCurveTo(cell / 2 + side * spread * 0.5, baseY - height, cell / 2 + side * spread, baseY - height * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(170, 215, 255, ${0.85 * (1 - t) + 0.1})`;
  ctx.beginPath();
  ctx.arc(cell / 2, baseY - height * 0.9, 2.6 * (1 - t * 0.5), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 파티클 스프라이트 스트립을 만든다.
 * 스킨 생성에 캔버스가 필요하므로 deps를 주입받는다.
 */
export function buildStudioParticleSprite(
  kind: StudioParticleSpriteKind,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioParticleSprite {
  const entry = META[kind];
  if (!entry) throw new Error(`알 수 없는 파티클 스프라이트: ${kind}`);
  const { cell, frames } = entry;
  const canvas = deps.createCanvas(cell * frames, cell);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, cell * frames, cell);
  for (let frame = 0; frame < frames; frame += 1) {
    ctx.save();
    ctx.translate(frame * cell, 0);
    switch (kind) {
      case "dust": drawDust(ctx, cell, frame, frames); break;
      case "sparkle": drawSparkle(ctx, cell, frame, frames); break;
      case "raindrop": drawRaindrop(ctx, cell, frame); break;
      case "snowflake": drawSnowflake(ctx, cell, frame); break;
      case "leaf": drawLeaf(ctx, cell, frame); break;
      case "smoke": drawSmoke(ctx, cell, frame, frames); break;
      case "confetti": drawConfetti(ctx, cell, frame); break;
      case "splash": drawSplash(ctx, cell, frame, frames); break;
    }
    ctx.restore();
  }
  return Object.freeze({
    kind,
    dataUrl: canvas.toDataURL("image/png"),
    cell,
    frames,
    width: cell * frames,
    height: cell,
  });
}
