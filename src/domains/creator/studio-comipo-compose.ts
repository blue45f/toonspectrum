/**
 * 코미포·툰스푼식 공간 조립 — 장면/대사 시드를 패널 프레임 안에 맞춰 배치한다.
 * 패널 프레임과 겹치지 않게 하고, 장면 템플릿의 중복 frame 시드는 제거한다.
 */

import { parseDialogueScript, type DialogueBubbleSeed } from "./studio-dialogue";

import type { PanelLayoutFrame } from "./studio-panel-layouts";
import type { SceneSeed } from "./studio-scene-templates";

const CANVAS_W = 720;
const FRAME_PAD = 20;

export type ComposeBounds = { x: number; y: number; w: number; h: number };

/** 시드의 대략적 bbox (width/height 없는 타입은 최소 크기 추정). */
export function seedBounds(seed: SceneSeed | DialogueBubbleSeed): ComposeBounds {
  if (seed.type === "text") {
    return { x: seed.x, y: seed.y, w: seed.width, h: seed.fontSize * 1.4 };
  }
  if (seed.type === "bubble") {
    return { x: seed.x, y: seed.y, w: seed.width, h: seed.height };
  }
  if (seed.type === "frame") {
    return { x: seed.x, y: seed.y, w: seed.width, h: seed.height };
  }
  if (seed.type === "focusLines" || seed.type === "speedLines") {
    return { x: seed.x, y: seed.y, w: seed.width, h: seed.height };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function unionSeedBounds(seeds: readonly (SceneSeed | DialogueBubbleSeed)[]): ComposeBounds | null {
  if (seeds.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seed of seeds) {
    const b = seedBounds(seed);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boundsOverlap(a: ComposeBounds, b: ComposeBounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 두 패널 프레임 bbox가 겹치는지. */
export function framesOverlap(frames: readonly PanelLayoutFrame[]): boolean {
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i]!;
      const b = frames[j]!;
      if (
        boundsOverlap(
          { x: a.x, y: a.y, w: a.width, h: a.height },
          { x: b.x, y: b.y, w: b.width, h: b.height }
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function translateSceneSeed(seed: SceneSeed, dx: number, dy: number): SceneSeed {
  return { ...seed, x: seed.x + dx, y: seed.y + dy };
}

function scaleSceneSeed(seed: SceneSeed, scale: number, originX: number, originY: number): SceneSeed {
  const sx = (v: number) => originX + (v - originX) * scale;
  const sy = (v: number) => originY + (v - originY) * scale;
  if (seed.type === "text") {
    return {
      ...seed,
      x: sx(seed.x),
      y: sy(seed.y),
      width: Math.round(seed.width * scale),
      fontSize: Math.max(10, Math.round(seed.fontSize * scale)),
      strokeWidth: seed.strokeWidth != null ? Math.max(1, seed.strokeWidth * scale) : seed.strokeWidth,
    };
  }
  if (seed.type === "bubble") {
    return {
      ...seed,
      x: sx(seed.x),
      y: sy(seed.y),
      width: Math.round(seed.width * scale),
      height: Math.round(seed.height * scale),
    };
  }
  if (seed.type === "focusLines" || seed.type === "speedLines") {
    return {
      ...seed,
      x: sx(seed.x),
      y: sy(seed.y),
      width: Math.round(seed.width * scale),
      height: Math.round(seed.height * scale),
      strokeWidth: Math.max(1, seed.strokeWidth * scale),
      innerRadius: seed.type === "focusLines" ? seed.innerRadius * scale : undefined,
      outerRadius: seed.type === "focusLines" ? seed.outerRadius * scale : undefined,
    } as SceneSeed;
  }
  return seed;
}

/**
 * 장면 템플릿 시드를 대상 패널 프레임 안에 맞춘다.
 * 장면 자체 frame 시드는 제거(패널 프레임 재사용)하고, 나머지를 scale+translate 한다.
 */
export function composeSceneIntoFrame(
  sceneSeeds: readonly SceneSeed[],
  frame: PanelLayoutFrame,
  padding = FRAME_PAD
): SceneSeed[] {
  const decor = sceneSeeds.filter((s) => s.type !== "frame");
  if (decor.length === 0) return [];

  const bbox = unionSeedBounds(decor);
  if (!bbox || bbox.w <= 0 || bbox.h <= 0) return decor;

  const innerW = frame.width - padding * 2;
  const innerH = frame.height - padding * 2;
  const scale = Math.min(1, innerW / bbox.w, innerH / bbox.h);
  const originX = bbox.x;
  const originY = bbox.y;

  const scaled = decor.map((seed) => scaleSceneSeed(seed, scale, originX, originY));
  const scaledBox = unionSeedBounds(scaled);
  if (!scaledBox) return scaled;

  const targetX = frame.x + padding + (innerW - scaledBox.w) / 2;
  const targetY = frame.y + padding + (innerH - scaledBox.h) / 2;
  const dx = targetX - scaledBox.x;
  const dy = targetY - scaledBox.y;

  return scaled.map((seed) => translateSceneSeed(seed, dx, dy));
}

/** 대사 라인을 프레임 순서대로 배치(한 줄 = 한 프레임, 초과 시 순환). */
export function composeDialogueIntoFrames(
  script: string,
  frames: readonly PanelLayoutFrame[],
  canvasWidth = CANVAS_W
): DialogueBubbleSeed[] {
  const lines = parseDialogueScript(script);
  if (lines.length === 0 || frames.length === 0) return [];

  const margin = 28;
  const gap = 16;
  const speechWidth = Math.round(canvasWidth * 0.5);
  const out: DialogueBubbleSeed[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const frame = frames[i % frames.length]!;
    const innerMargin = Math.min(margin, Math.round(frame.width * 0.08));
    const maxBubbleW = Math.min(speechWidth, frame.width - innerMargin * 2);

    if (line.kind === "narration") {
      const width = frame.width - innerMargin * 2;
      const height = Math.max(72, Math.round(line.text.length * 0.55 + 36));
      out.push({
        type: "bubble",
        variant: "box",
        text: line.text,
        x: frame.x + innerMargin,
        y: frame.y + innerMargin,
        width,
        height,
        fill: "#1c1c1c",
        textFill: "#f4f4f4",
        rotation: 0,
        align: "center",
      });
      continue;
    }

    const height = Math.max(80, Math.round(line.text.length * 0.42 + 40));
    const x =
      line.side === "left"
        ? frame.x + innerMargin
        : frame.x + frame.width - innerMargin - maxBubbleW;
    const y = frame.y + innerMargin + gap;

    out.push({
      type: "bubble",
      variant: "speech",
      text: line.text,
      x,
      y,
      width: maxBubbleW,
      height,
      fill: "#ffffff",
      textFill: "#1a1a1a",
      rotation: 0,
      tail: line.side,
      tailDirection: "bottom",
      align: "left",
    });
  }

  return out;
}

/** 말풍선/장식 시드가 지정 프레임 안에 완전히 들어가는지. */
export function seedsFitInsideFrame(
  seeds: readonly (SceneSeed | DialogueBubbleSeed)[],
  frame: PanelLayoutFrame,
  slack = 2
): boolean {
  for (const seed of seeds) {
    if (seed.type === "frame") continue;
    const b = seedBounds(seed);
    if (
      b.x < frame.x - slack ||
      b.y < frame.y - slack ||
      b.x + b.w > frame.x + frame.width + slack ||
      b.y + b.h > frame.y + frame.height + slack
    ) {
      return false;
    }
  }
  return true;
}

/** 조립 결과가 '배치 가능한 상태'인지 — 패널 프레임끼리 안 겹치고, 장식이 어떤 프레임 안에든 들어감. */
export function isComposableAssembly(
  frames: readonly PanelLayoutFrame[],
  decorSeeds: readonly (SceneSeed | DialogueBubbleSeed)[],
  canvasH: number,
  canvasWidth = CANVAS_W
): boolean {
  if (frames.length === 0) return false;
  if (framesOverlap(frames)) return false;
  for (const frame of frames) {
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > canvasWidth + 1 || frame.y + frame.height > canvasH + 1) {
      return false;
    }
  }
  for (const seed of decorSeeds) {
    if (seed.type === "frame") continue;
    if (!frames.some((f) => seedsFitInsideFrame([seed], f, 4))) return false;
  }
  return true;
}