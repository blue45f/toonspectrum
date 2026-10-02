import { beforeAll, describe, expect, it } from "vitest";

import { failVisible } from "../contracts";
import { fnv1a32 } from "../shared/hash";
import { createMockEngine, syntheticRaster } from "../testing/mock-engine";
import { installPsdCanvasStub } from "../testing/psd-canvas-stub";
import { rasterEquals } from "../testing/raster-fixtures";
import { defaultRecipeFixture } from "../testing/recipe-fixtures";

import { MAX_PNG_EXPORT_DIMENSION, MAX_PSD_EXPORT_DIMENSION, buildCaptureRequest, exportFileName, exportGlb, exportLayeredPsd, exportRecipe, exportTransparentPng, isGlb, validateExportDimensions } from "./export-session";
import { decodePng } from "./png-encoder";
import { parseRecipeFile } from "./recipe-file";

import type { CaptureRequest } from "../contracts";

beforeAll(() => {
  installPsdCanvasStub();
});

describe("exportTransparentPng", () => {
  it("요청 해상도로 lit 패스를 캡처해 PNG로 인코딩한다(뷰포트 크기 무관)", async () => {
    const engine = createMockEngine();
    engine.resize(300, 200);
    let tick = 100;
    const result = await exportTransparentPng(engine, { width: 32, height: 24, settleSteps: 10 }, { now: () => (tick += 5) });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const decoded = await decodePng(result.bytes);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(24);
    expect(rasterEquals(decoded, syntheticRaster(32, 24, fnv1a32("lit")))).toBe(true);
    expect(decoded.rgba[3]).toBe(0); // 테두리 투명 보존
    expect(result.receipt).toMatchObject({ kind: "png", mime: "image/png", width: 32, height: 24, settleSteps: 10, fileName: "character-mock-32x24.png" });
    expect(result.receipt.durationMs).toBeGreaterThan(0);
    const settle = engine.calls.find((c) => c.method === "settle");
    expect(settle?.args).toEqual([10]);
    const passes = engine.calls.find((c) => c.method === "renderPasses");
    const request = passes?.args[0] as CaptureRequest;
    expect(request).toMatchObject({ width: 32, height: 24, passes: ["lit"], transparentBackground: true, settleSteps: 10 });
    expect(request.camera?.mode).toBe("full-body");
  });

  it("크기 검증·엔진 실패·settle 실패를 LabFailure로 돌려준다", async () => {
    const engine = createMockEngine();
    const tooBig = await exportTransparentPng(engine, { width: MAX_PNG_EXPORT_DIMENSION + 1, height: 16 });
    expect(!tooBig.ok && tooBig.failure.code).toBe("export-size");
    expect(engine.calls).toHaveLength(0);
    const fractional = validateExportDimensions(10.5, 16, 4096);
    expect(fractional?.code).toBe("export-size");

    const failing = createMockEngine({ failPasses: failVisible("mock-pass-fail", "모의 패스 실패", undefined, 1) });
    const failed = await exportTransparentPng(failing, { width: 16, height: 16 });
    expect(!failed.ok && failed.failure.code).toBe("mock-pass-fail");

    const broken = createMockEngine();
    broken.settle = async () => {
      throw new Error("settle boom");
    };
    const settleFailed = await exportTransparentPng(broken, { width: 16, height: 16, settleSteps: 3 });
    expect(!settleFailed.ok && settleFailed.failure.code).toBe("export-settle");
    expect(!settleFailed.ok && settleFailed.failure.detail).toMatch(/settle boom/u);

    const wrongSize = createMockEngine();
    const original = wrongSize.renderPasses.bind(wrongSize);
    wrongSize.renderPasses = async (req) => original({ ...req, width: 8, height: 8 });
    const mismatch = await exportTransparentPng(wrongSize, { width: 16, height: 16 });
    expect(!mismatch.ok && mismatch.failure.code).toBe("export-capture-size");
  });
});

describe("exportLayeredPsd", () => {
  it("5개 패스를 캡처해 PSD 바이트와 레이어 영수증을 돌려준다", async () => {
    const engine = createMockEngine({ partIdPalette: { 1: { role: "skin", labelKo: "피부" } } });
    const result = await exportLayeredPsd(engine, [], { width: 24, height: 24, includeIdMasks: true, includeReferencePasses: true });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(String.fromCharCode(...result.bytes.subarray(0, 4))).toBe("8BPS");
    expect(result.receipt.kind).toBe("psd");
    expect(result.receipt.fileName).toBe("character-mock-24x24.psd");
    expect(result.receipt.psd?.names).toContain("밑색");
    expect(result.receipt.psd?.names).toContain("참조/법선");
    const request = engine.calls.find((c) => c.method === "renderPasses")?.args[0] as CaptureRequest;
    expect(request.passes).toEqual(["flat", "lit", "normal", "depth", "part-id"]);
    const tooBig = await exportLayeredPsd(engine, [], { width: MAX_PSD_EXPORT_DIMENSION + 1, height: 16, includeIdMasks: false, includeReferencePasses: false });
    expect(!tooBig.ok && tooBig.failure.code).toBe("export-size");
  });
});

describe("exportGlb / exportRecipe", () => {
  it("GLB 매직을 검사하고 파일명을 만든다", async () => {
    const engine = createMockEngine();
    const recipe = defaultRecipeFixture();
    const result = await exportGlb(engine, recipe);
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(isGlb(result.bytes)).toBe(true);
    expect(result.receipt.mime).toBe("model/gltf-binary");
    expect(result.receipt.fileName).toMatch(/^character-[0-9a-f]{8}\.glb$/u);
    engine.exportGlb = async () => new Uint8Array([1, 2, 3]);
    const invalid = await exportGlb(engine, recipe);
    expect(!invalid.ok && invalid.failure.code).toBe("export-glb-invalid");
    engine.exportGlb = async () => {
      throw new Error("no scene");
    };
    const thrown = await exportGlb(engine, recipe);
    expect(!thrown.ok && thrown.failure.code).toBe("export-glb");
    expect(exportFileName("png", "abcdef0123", 10, 20)).toBe("character-abcdef01-10x20.png");
  });

  it("레시피 JSON은 페인트 레이어를 포함하고 다시 파싱된다", async () => {
    const recipe = defaultRecipeFixture();
    const layer = { part: "skin" as const, width: 4, height: 4, rgba: new Uint8ClampedArray(64).fill(255), revision: 1 };
    const result = await exportRecipe(recipe, [layer], { now: () => Date.UTC(2026, 9, 1) });
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(result.receipt.fileName).toMatch(/^character-[0-9a-f]{8}-20261001\.character\.json$/u);
    const parsed = parseRecipeFile(new TextDecoder().decode(result.bytes));
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    expect(parsed.recipe.paint.layers).toHaveLength(1);
    expect(buildCaptureRequest({ width: 8, height: 8, settleSteps: 99999 }, ["lit"]).settleSteps).toBe(600);
  });
});
