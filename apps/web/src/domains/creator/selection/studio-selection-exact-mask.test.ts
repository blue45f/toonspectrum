import { describe, expect, it } from "vitest";
import { applyExactSelectionMask, exactSelectionFromMask } from "./studio-selection-exact-mask";
import { layerAlphaToPixelSelection } from "../layer/studio-layer-alpha-selection";
import { commitPixelSelectionHistory, createPixelSelectionHistory, redoPixelSelectionHistory, undoPixelSelectionHistory } from "../studio-pixel-selection-history";
import { buildStudioSelectionBorderMask, studioSelectionBorderFromMask } from "../studio-selection-border";
import { pointInSelection } from "../studio-selection-tools";

const contains = (selection: ReturnType<typeof exactSelectionFromMask>, x: number, y: number, width: number, height: number) =>
  pointInSelection(selection, { x: (x + 0.5) / width, y: (y + 0.5) / height });

describe("원본 픽셀 선택 확정", () => {
  it("대각선 접점과 1픽셀 구멍을 변경 없이 왕복한다", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const mask = { width: 12, height: 10, alpha: Uint8ClampedArray.from({ length: 120 }, (_, index) => (index * 37 + seed * 13) % 11 < 6 ? 255 : 0) };
      const selection = exactSelectionFromMask(mask);
      for (let index = 0; index < mask.alpha.length; index += 1) {
        expect(contains(selection, index % mask.width, Math.floor(index / mask.width), mask.width, mask.height)).toBe(mask.alpha[index] === 255);
      }
    }
  });

  it("2560px 원본의 1px 선·구멍·독립 픽셀과 Undo/Redo를 보존한다", () => {
    const width = 2560, height = 1280;
    const alpha = new Uint8ClampedArray(width * height);
    for (let y = 100; y < 900; y += 1) alpha.fill(255, y * width + 100, y * width + 900);
    alpha[500 * width + 500] = 0;
    alpha[1000 * width + 1700] = 255;
    for (let y = 10; y < 100; y += 1) alpha[y * width + 1800] = 255;
    const selection = layerAlphaToPixelSelection({ width, height, alpha });
    expect(contains(selection, 500, 500, width, height)).toBe(false);
    expect(contains(selection, 1700, 1000, width, height)).toBe(true);
    expect(contains(selection, 1800, 50, width, height)).toBe(true);
    const committed = commitPixelSelectionHistory(createPixelSelectionHistory("image", null), "image", selection);
    const undone = undoPixelSelectionHistory(committed.history, "image");
    const restored = redoPixelSelectionHistory(undone.history, "image");
    expect(restored.selection).toEqual(selection);
  });

  it.each([1, 2])("2560px 원고에서 요청한 %ipx 테두리를 그대로 확정한다", (widthPx) => {
    const width = 2560, height = 1280;
    const mask = { width, height, alpha: new Uint8ClampedArray(width * height).fill(255) };
    mask.alpha[640 * width + 1200] = 0;
    const options = { widthPx, placement: "inside" as const, displayWidth: width, displayHeight: height };
    const border = buildStudioSelectionBorderMask(mask, options);
    expect(border.alpha[100 * width + widthPx - 1]).toBe(255);
    expect(border.alpha[100 * width + widthPx]).toBe(0);
    const selection = studioSelectionBorderFromMask(mask, { subpaths: [], invert: true, featherPx: 0 }, options);
    expect(contains(selection, 1200, 640, width, height)).toBe(false);
    expect(contains(selection, 1201, 640, width, height)).toBe(true);
    expect(contains(selection, widthPx - 1, 100, width, height)).toBe(true);
    expect(contains(selection, widthPx, 100, width, height)).toBe(false);
  });

  it("구멍이 있는 원본의 추가/제거가 기존 선택을 되살리거나 삭제하지 않는다", () => {
    const mask = { width: 8, height: 8, alpha: new Uint8ClampedArray(64).fill(255) };
    mask.alpha[3 * 8 + 3] = 0;
    const full = { subpaths: [], invert: true, featherPx: 0 };
    expect(contains(applyExactSelectionMask(full, mask, "add"), 3, 3, 8, 8)).toBe(true);
    expect(contains(applyExactSelectionMask(null, mask, "subtract"), 3, 3, 8, 8)).toBe(false);
  });
});
