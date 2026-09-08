import type { BrushQualityPolicy } from "./brush-studio-v5-quality-types";

export type BrushQualityFieldView = "composite" | "surface" | "wetness" | "pigment" | "height" | "pattern";

export interface BrushQualityPreviewOptions {
  readonly width?: number;
  readonly height?: number;
  readonly settleProgress?: number;
  readonly fieldView?: BrushQualityFieldView;
  readonly seed?: number;
}

export interface BrushQualityPreviewStats {
  readonly sampleCount: number;
  readonly markCount: number;
  readonly activeFields: number;
  readonly pressureRange: number;
  readonly settleProgress: number;
  readonly signature: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tilt: number;
  readonly tangent: number;
  readonly speed: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ state >>> 15, 1 | state);
    state ^= state + Math.imul(state ^ state >>> 7, 61 | state);
    return ((state ^ state >>> 14) >>> 0) / 4294967296;
  };
}

function noise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.0137) * 43758.5453;
  return value - Math.floor(value);
}

function pressureCurve(raw: number, policy: BrushQualityPolicy): number {
  const range = Math.max(0.001, policy.input.pressureSaturation - policy.input.pressureOnset);
  const normalized = clamp((raw - policy.input.pressureOnset) / range);
  return normalized ** policy.input.pressureGamma;
}

function pointAt(index: number, count: number, left: number, top: number, width: number, height: number, policy: BrushQualityPolicy): Point {
  const t = index / Math.max(1, count - 1);
  const next = Math.min(1, t + 1 / Math.max(1, count - 1));
  const curve = (value: number) => top + height * (0.5 + Math.sin(value * Math.PI * 2.05) * 0.25 + Math.sin(value * Math.PI * 5.2) * 0.045);
  const x = left + width * t;
  const y = curve(t);
  const nextY = curve(next);
  const rawPressure = clamp(0.06 + Math.sin(t * Math.PI) * 0.92 + Math.sin(t * Math.PI * 7) * 0.04);
  return {
    x,
    y,
    presssure: pressureCurve(rawPressure, policy),
    tilt: clamp((Math.sin(t * Math.PI * 1.3 - 0.35) + 1) * 0.5),
    tangent: Math.atan2(nextY - y, width / Math.max(1, count - 1)),
    speed: clamp(0.2 + Math.abs(Math.cos(t * Math.PI * 2.4)) * 0.8),
  };
}

function roundedPanel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, title: string): void {
  context.save();
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.strokeStyle = "rgba(28,25,23,0.13)";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, width, height, 18);
  context.fill();
  context.stroke();
  context.fillStyle = "rgba(28,25,23,0.75)";
  context.font = "600 13px system-ui, sans-serif";
  context.fillText(title, x + 16, y + 24);
  context.restore();
}

function drawPaper(context: CanvasRenderingContext2D, width: number, height: number, policy: BrushQualityPolicy, seed: number): void {
  const random = seededRandom(seed);
  const tooth = policy.material.surfaceTooth;
  const fiber = policy.material.fiberAnisotropy;
  context.fillStyle = "rgb(246,243,235)";
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "multiply";
  for (let index = 0; index < Math.round(180 + tooth * 1_200); index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.25 + random() * (0.7 + tooth * 1.7);
    const alpha = 0.008 + tooth * 0.025 * random();
    context.fillStyle = `rgba(74,63,45,${alpha})`;
    context.beginPath();
    context.ellipse(x, y, radius * (0.65 + random()), radius, random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.lineWidth = 0.45 + fiber * 0.6;
  context.strokeStyle = `rgba(91,74,51,${0.01 + fiber * 0.035})`;
  for (let index = 0; index < Math.round(30 + fiber * 150); index += 1) {
    const x = random() * width;
    const y = random() * height;
    const length = 18 + random() * 60;
    const angle = (random() - 0.5) * 0.4;
    context.beginPath();
    context.moveTo(x - Math.cos(angle) * length * 0.5, y - Math.sin(angle) * length * 0.5);
    context.quadraticCurveTo(x, y + (random() - 0.5) * 5, x + Math.cos(angle) * length * 0.5, y + Math.sin(angle) * length * 0.5);
    context.stroke();
  }
  context.restore();
}
