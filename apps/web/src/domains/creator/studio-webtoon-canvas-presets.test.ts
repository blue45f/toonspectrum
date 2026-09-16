import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findStudioWebtoonCanvasPreset,
  STUDIO_WEBTOON_CANVAS_PRESETS,
  studioWebtoonCanvasMagicResizePreset,
} from "./studio-webtoon-canvas-presets";

const creatorDir = dirname(fileURLToPath(import.meta.url));

describe("studio webtoon canvas presets", () => {
  it("maps a platform target onto a fixed-width magic-resize preset", () => {
    const kakao = findStudioWebtoonCanvasPreset("webtoon-kakao");
    expect(kakao).toBeDefined();
    expect(studioWebtoonCanvasMagicResizePreset(kakao!)).toEqual({
      id: "webtoon-kakao",
      label: kakao!.labelKo,
      hint: "720 × 8000px 플랫폼 비율로 현재 캔버스를 바꿉니다.",
      aspectW: 720,
      aspectH: 8000,
    });
    expect(STUDIO_WEBTOON_CANVAS_PRESETS.map((preset) => preset.id)).toContain("webtoon-naver");
  });

  it("wires the platform picker into both canvas-size editors", () => {
    const resizePanel = readFileSync(join(creatorDir, "StudioMagicResizePanel.tsx"), "utf8");
    const canvasResizer = readFileSync(join(creatorDir, "canvas/StudioCanvasResizer.tsx"), "utf8");
    expect(resizePanel).toContain("StudioWebtoonCanvasPresetPicker");
    expect(canvasResizer).toContain("StudioWebtoonCanvasPresetPicker");
  });
});
