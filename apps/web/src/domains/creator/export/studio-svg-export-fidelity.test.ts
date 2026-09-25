import { describe, expect, it } from "vitest";

import { serializeStudioDynamicCoverageMarks } from "./studio-svg-export-coverage";
import { StudioSvgTextureBudgetError } from "./studio-svg-export-fidelity";
import {
  STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET,
  svgAlphaMapTextureAsset,
} from "./studio-svg-export-png";

import type { StudioBrushTipAlphaMap } from "../brush/studio-brush-tip-stamp";
import type { StudioDynamicBrushCoverageMark } from "../studio-dynamic-brush-coverage-renderer";
import type { ExportCtx } from "./studio-svg-export-types";

function context(usedBytes = 0): ExportCtx {
  return {
    defs: [], skips: [], fonts: new Set(), theme: "classic", seq: 0,
    brushTextureAssets: new Map(), brushTextureAssetsByAlphaMap: new Map(),
    brushTextureSerializedUtf16Bytes: usedBytes, r8EmbeddedRgbaBytes: 0,
  };
}

function tip(revision: string): StudioBrushTipAlphaMap {
  return {
    size: 8, shape: "grain", softness: 0, custom: true, revision,
    alphas: Float32Array.from({ length: 64 }, (_, index) => index / 63),
  };
}

function mark(alphaMap: StudioBrushTipAlphaMap): StudioDynamicBrushCoverageMark {
  return {
    x: 12, y: 18, radiusX: 8, radiusY: 4, angleRadians: 0.5,
    alpha: 0.6, color: "#123456", texture: { kind: "alpha-map", alphaMap },
  };
}

describe("SVG 브러시 외관 보존 경계", () => {
  it("정확히 예산에 맞는 원본 팁은 유지하고 같은 팁 재사용에는 추가 예산이 들지 않는다", () => {
    const alpha = tip("same-tip");
    const measured = context();
    svgAlphaMapTextureAsset(measured, alpha);
    const ctx = context(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET - measured.brushTextureSerializedUtf16Bytes);
    const first = svgAlphaMapTextureAsset(ctx, alpha);
    expect(first).not.toBeNull();
    expect(ctx.brushTextureSerializedUtf16Bytes).toBe(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET);
    expect(svgAlphaMapTextureAsset(ctx, alpha)).toBe(first);
    expect(ctx.defs).toHaveLength(1);
    expect(ctx.defs[0]).toContain("data:image/png;base64,");
  });

  it("예산을 1바이트 초과하면 질감을 제거하지 않고 전체 출력을 거절한다", () => {
    const alpha = tip("boundary");
    const measured = context();
    svgAlphaMapTextureAsset(measured, alpha);
    const remaining = measured.brushTextureSerializedUtf16Bytes - 1;
    const ctx = context(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET - remaining);
    expect(() => serializeStudioDynamicCoverageMarks(ctx, [mark(alpha)], 0.7, true, undefined))
      .toThrow(StudioSvgTextureBudgetError);
    expect(ctx.defs).toEqual([]);
    expect(ctx.seq).toBe(0);
    expect(ctx.brushTextureAssets.size).toBe(0);
    expect(ctx.brushTextureAssetsByAlphaMap.size).toBe(0);
    expect(ctx.brushTextureSerializedUtf16Bytes).toBe(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET - remaining);
  });

  it("한 획의 중간 팁이 예산을 넘으면 앞서 만든 부분 자산도 복구한다", () => {
    const first = tip("first");
    const measured = context();
    svgAlphaMapTextureAsset(measured, first);
    const remaining = measured.brushTextureSerializedUtf16Bytes;
    const ctx = context(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET - remaining);
    const second = { ...tip("second"), alphas: new Float32Array(64).fill(0.5) };
    expect(() => serializeStudioDynamicCoverageMarks(ctx, [mark(first), mark(second)], 1, false, undefined))
      .toThrow(StudioSvgTextureBudgetError);
    expect(ctx.defs).toEqual([]);
    expect(ctx.seq).toBe(0);
    expect(ctx.brushTextureAssets.size).toBe(0);
    expect(ctx.brushTextureAssetsByAlphaMap.size).toBe(0);
  });

  it("revision이 달라도 원본 픽셀이 같으면 한 PNG만 보관하고 변경된 픽셀은 분리한다", () => {
    const ctx = context();
    const first = svgAlphaMapTextureAsset(ctx, tip("first"));
    const bytes = ctx.brushTextureSerializedUtf16Bytes;
    expect(svgAlphaMapTextureAsset(ctx, tip("second"))).toBe(first);
    expect(ctx.defs).toHaveLength(1);
    expect(ctx.brushTextureSerializedUtf16Bytes).toBe(bytes);
    expect(svgAlphaMapTextureAsset(ctx, { ...tip("changed"), alphas: new Float32Array(64).fill(0.5) })).not.toBe(first);
    expect(ctx.defs).toHaveLength(2);
  });

  it("오류는 외관 보존 출력을 안내하며 질감 예산을 낮추거나 높이지 않는다", () => {
    const error = new StudioSvgTextureBudgetError(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET);
    expect(error.name).toBe("StudioSvgTextureBudgetError");
    expect(error.message).toContain("외관 보존 SVG");
    expect(error.byteBudget).toBe(64 * 1024 * 1024);
  });
});
