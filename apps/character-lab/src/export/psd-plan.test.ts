import { describe, expect, it } from "vitest";

import { captureResultFixture, fillRaster, pixelAt, solidRaster } from "../testing/raster-fixtures";

import { PSD_MAX_DIMENSION, buildIdMaskLayers, depthToRaster, downsampleRaster, idMaskColor, planCharacterPsd } from "./psd-plan";

import type { PaintLayer } from "../contracts";
import type { PsdLayerPlan } from "./psd-plan";

function paintLayer(part: PaintLayer["part"], size: number, paint: boolean): PaintLayer {
  const rgba = new Uint8ClampedArray(size * size * 4);
  if (paint) {
    for (let y = 0; y < size / 2; y += 1) {
      for (let x = 0; x < size / 2; x += 1) {
        const i = (y * size + x) * 4;
        rgba[i] = 255;
        rgba[i + 3] = 255;
      }
    }
  }
  return { part, width: size, height: size, rgba, revision: 1 };
}

function flatten(layers: readonly PsdLayerPlan[], prefix = ""): string[] {
  return layers.flatMap((layer) => (layer.kind === "group" ? [`${prefix}${layer.name}`, ...flatten(layer.children, `${prefix}${layer.name}/`)] : [`${prefix}${layer.name}`]));
}

describe("planCharacterPsd", () => {
  it("레이어 순서·blend·숨김 스냅샷과 재합성 MAE", () => {
    // 기본 fixture의 깊이 램프(16px에 0→1)는 실제 캡처보다 수십 배 가파르므로 평탄한 깊이로 바꾼다.
    const capture = captureResultFixture({ width: 16, height: 16, depth: { width: 16, height: 16, depth: new Float32Array(256).fill(0.5), near: 0.1, far: 10 } });
    const result = planCharacterPsd(capture, [paintLayer("skin", 64, true), paintLayer("hair", 64, false)], { includeIdMasks: true, includeReferencePasses: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const { plan } = result;
    expect(plan.width).toBe(16);
    expect(flatten(plan.layers)).toEqual([
      "참조",
      "참조/깊이",
      "부위 ID 마스크",
      "부위 ID 마스크/피부",
      "밑색",
      "음영",
      "하이라이트",
      "페인트",
      "페인트/피부 (UV 공간 1/4)",
      "주선",
    ]);
    expect(plan.receipt.names).toEqual(flatten(plan.layers));
    expect(plan.receipt.layerCount).toBe(7);
    expect(plan.receipt.groupCount).toBe(3);
    const byName = new Map<string, PsdLayerPlan>();
    const walk = (items: readonly PsdLayerPlan[]): void => {
      for (const item of items) {
        byName.set(item.name, item);
        if (item.kind === "group") walk(item.children);
      }
    };
    walk(plan.layers);
    const shade = byName.get("음영");
    const highlight = byName.get("하이라이트");
    const flat = byName.get("밑색");
    const line = byName.get("주선");
    expect(shade?.kind === "raster" && shade.blendMode).toBe("multiply");
    expect(highlight?.kind === "raster" && highlight.blendMode).toBe("screen");
    expect(flat?.kind === "raster" && flat.blendMode).toBe("normal");
    expect(flat?.hidden).toBe(false);
    expect(byName.get("참조")?.hidden).toBe(true);
    expect(byName.get("부위 ID 마스크")?.hidden).toBe(true);
    expect(byName.get("페인트")?.hidden).toBe(true);
    expect(line?.kind === "raster" && line.raster.rgba[(8 * 16 + 8) * 4 + 3]).toBe(0);
    expect(plan.receipt.lineArtPixels).toBeGreaterThan(8);
    expect(plan.receipt.recomposeMae).toBeLessThanOrEqual(2);
    expect(plan.composite).toBe(capture.passes.lit);
    expect(plan.receipt.skippedKo).toEqual(["참조/법선: normal 패스가 없습니다.", "페인트/헤어: 칠한 픽셀이 없습니다."]);
    const paint = byName.get("페인트/피부 (UV 공간 1/4)") ?? byName.get("피부 (UV 공간 1/4)");
    expect(paint?.kind === "raster" && paint.raster.width).toBe(16);
    expect(paint?.kind === "raster" && pixelAt(paint.raster, 2, 2)).toEqual([255, 0, 0, 255]);
    const mask = byName.get("피부");
    expect(mask?.kind === "raster" && pixelAt(mask.raster, 8, 8)[3]).toBe(255);
    expect(mask?.kind === "raster" && pixelAt(mask.raster, 0, 0)[3]).toBe(0);
  });

  it("옵션을 끄면 참조·ID 마스크 그룹이 없고 part-id 패스가 없으면 사유를 남긴다", () => {
    const capture = captureResultFixture({ width: 8, height: 8 });
    const minimal = planCharacterPsd(capture, [], { includeIdMasks: false, includeReferencePasses: false });
    if (!minimal.ok) throw new Error(minimal.failure.reasonKo);
    expect(flatten(minimal.plan.layers)).toEqual(["밑색", "음영", "하이라이트", "주선"]);

    const noId = captureResultFixture({ width: 8, height: 8, passes: { flat: solidRaster(8, 8, [10, 20, 30, 255]), lit: solidRaster(8, 8, [5, 10, 15, 255]) } });
    const planned = planCharacterPsd(noId, [], { includeIdMasks: true, includeReferencePasses: false });
    if (!planned.ok) throw new Error(planned.failure.reasonKo);
    expect(planned.plan.receipt.skippedKo).toEqual(["부위 ID 마스크: part-id 패스가 없습니다."]);
  });

  it("실패 경로: 상한 초과·패스 누락·패스 크기 불일치", () => {
    const big = captureResultFixture({ width: 4, height: 4 });
    const tooLarge = planCharacterPsd({ ...big, width: PSD_MAX_DIMENSION + 1 }, [], { includeIdMasks: false, includeReferencePasses: false }, 1);
    expect(!tooLarge.ok && tooLarge.failure.code).toBe("psd-too-large");
    const missing = planCharacterPsd(captureResultFixture({ passes: { lit: solidRaster(16, 16, [0, 0, 0, 255]) } }), [], { includeIdMasks: false, includeReferencePasses: false });
    expect(!missing.ok && missing.failure.code).toBe("psd-missing-pass");
    const mismatch = planCharacterPsd(captureResultFixture({ passes: { flat: solidRaster(16, 16, [0, 0, 0, 255]), lit: solidRaster(8, 8, [0, 0, 0, 255]) } }), [], {
      includeIdMasks: false,
      includeReferencePasses: false,
    });
    expect(!mismatch.ok && mismatch.failure.code).toBe("psd-pass-size");
  });

  it("보조 함수: 마스크 색 결정성, 깊이 래스터, 박스 다운샘플", () => {
    expect(idMaskColor("skin")).toEqual(idMaskColor("skin"));
    expect(idMaskColor("skin")).not.toEqual(idMaskColor("hair"));
    const masks = buildIdMaskLayers(new Uint16Array([0, 1, 2, 2]), 2, 2, { 1: { role: "skin", labelKo: "피부" }, 2: { role: "hair", labelKo: "헤어" }, 9: { role: "top", labelKo: "상의" } });
    expect(masks.map((m) => m.name)).toEqual(["피부", "헤어"]);
    expect(pixelAt(masks[1]?.raster ?? solidRaster(2, 2, [0, 0, 0, 0]), 1, 1)[3]).toBe(255);
    const lit = fillRaster(2, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
    const depth = depthToRaster({ width: 2, height: 1, depth: new Float32Array([0.5, 0.25]), near: 0, far: 1 }, lit);
    expect(pixelAt(depth, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(depth, 1, 0)).toEqual([191, 191, 191, 255]);
    const source = fillRaster(4, 4, (x) => (x < 2 ? [200, 100, 50, 255] : [0, 0, 0, 0]));
    const small = downsampleRaster(source, 2);
    expect(small.width).toBe(2);
    expect(pixelAt(small, 0, 0)).toEqual([200, 100, 50, 255]);
    expect(pixelAt(small, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(downsampleRaster(source, 1)).toBe(source);
  });
});
