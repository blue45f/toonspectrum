import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { decodePng } from "image-js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { STUDIO_ILLUSTRATION_SCENE_TEMPLATES } from "./studio-illustration-scene-templates";
import { summarizeStudioSceneTemplate } from "./studio-scene-template-summary";
import { STUDIO_ILLUSTRATION_RASTER_ASSETS } from "../render/studio-raster-assets";
import { getStudio2dAssetMetadata, isRecommendedStudio2dScene } from "../studio-2d-asset-quality";
import { BG_SCENES } from "../studio-bg-scenes";
import { postInsertFramesComposable } from "../studio-comipo-insert";
import { runStudioPageAddSceneTemplate, studioCanvasSnapshotFromElements } from "../studio-comipo-shipped";
import { STUDIO_ILLUSTRATION_BG_SCENES, STUDIO_ILLUSTRATION_PACK } from "./studio-illustration-pack";
import { getStudioSceneTemplateBackgroundIds } from "../studio-scene-template-asset-recommendations";
import { SCENE_TEMPLATES } from "../studio-scene-templates";
import { buildStudioUnifiedAssetCatalog, searchStudioUnifiedAssets } from "../studio-unified-asset-catalog";
import { deriveStudioUnifiedAssetFacet } from "../studio-unified-asset-intelligence";
import { resolveStudioUnifiedAssetRichPreview } from "../studio-unified-asset-preview";

describe("새 생성 일러스트 원본과 통합 카탈로그", () => {
  it("배포 출처 기록과 프롬프트 원문이 카탈로그 해시와 일치한다", () => {
    const directory = resolve(process.cwd(), "apps/web/public/assets/studio/illustration-20260926");
    const source: unknown = JSON.parse(readFileSync(resolve(directory, "SOURCE.json"), "utf8"));
    expect(source).toMatchObject(STUDIO_ILLUSTRATION_PACK);
    const prompts = z.object({
      prompts: z.array(z.object({ id: z.string(), prompt: z.string() })),
    }).parse(JSON.parse(readFileSync(resolve(directory, "PROMPTS.json"), "utf8"))).prompts;
    const promptHashes = new Map(prompts.map((prompt) => [prompt.id, createHash("sha256").update(prompt.prompt).digest("hex")]));
    for (const asset of STUDIO_ILLUSTRATION_PACK.assets) {
      expect(promptHashes.get(asset.sourcePromptId)).toBe(asset.promptSha256);
      if (asset.editPromptSha256) expect([...promptHashes.values()]).toContain(asset.editPromptSha256);
    }
    for (const asset of STUDIO_ILLUSTRATION_RASTER_ASSETS) {
      expect(asset.provenance.promptRetention).toBe("source-manifest");
      expect(asset.provenance.promptSource).toBe("/assets/studio/illustration-20260926/PROMPTS.json");
    }
  });

  it("확인하지 못한 모델 버전과 검수 주체를 정직하게 기록한다", () => {
    expect(STUDIO_ILLUSTRATION_PACK.generator).toEqual({
      provider: "openai", tool: "built-in image_gen", model: "unverified", modelVersionVerified: false,
    });
    const ids = STUDIO_ILLUSTRATION_PACK.assets.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    for (const asset of STUDIO_ILLUSTRATION_PACK.assets) {
      expect(asset.review.reviewer).toBe("assistant");
      expect(asset.review.method).toBe("full-image");
      expect(asset.containsText).toBe(false);
    }
  });

  it.each(STUDIO_ILLUSTRATION_PACK.assets)("$id 원본 PNG의 크기·해시·실제 알파를 검증한다", (asset) => {
    const bytes = readFileSync(resolve(process.cwd(), "apps/web/public", asset.src.slice(1)));
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const decoded = decodePng(new Uint8Array(bytes));
    expect([decoded.width, decoded.height]).toEqual([asset.width, asset.height]);
    if (asset.hasAlpha) {
      const raw = decoded.getRawImage();
      expect(raw.channels).toBe(4);
      let transparentPixels = 0;
      let paintedPixels = 0;
      const opaqueAlpha = 2 ** raw.bitDepth - 1;
      for (let index = 3; index < raw.data.length; index += 4) {
        if (raw.data[index] < opaqueAlpha) transparentPixels += 1;
        if (raw.data[index] > 0) paintedPixels += 1;
      }
      expect(transparentPixels).toBeGreaterThan(asset.width * asset.height * 0.05);
      expect(paintedPixels).toBeGreaterThan(asset.width * asset.height * 0.02);
    }
  });

  it("원본 배경을 추천·검색·미리보기에서 같은 경로로 찾는다", () => {
    const catalog = buildStudioUnifiedAssetCatalog({ backgrounds: BG_SCENES, elements: [], objects: [] });
    for (const scene of STUDIO_ILLUSTRATION_BG_SCENES) {
      expect(BG_SCENES).toContainEqual(scene);
      expect(isRecommendedStudio2dScene(scene)).toBe(true);
      expect(getStudio2dAssetMetadata(scene)?.provenance.modelVersionVerified).toBe(false);
      const item = searchStudioUnifiedAssets(catalog, { query: scene.label }).find((candidate) => candidate.id === `background:${scene.id}`);
      expect(item?.preview).toEqual({ kind: "image", src: scene.imgSrc });
    }
  });

  it("투명 소품을 벡터로 오인하지 않고 통합 검색과 비율 미리보기에 연결한다", () => {
    expect(STUDIO_ILLUSTRATION_RASTER_ASSETS).toHaveLength(STUDIO_ILLUSTRATION_PACK.assets.filter((asset) => asset.kind !== "background").length);
    const items = buildStudioUnifiedAssetCatalog({ rasterAssets: STUDIO_ILLUSTRATION_RASTER_ASSETS, elements: [], objects: [], nativeTools: [] });
    expect(items).toHaveLength(STUDIO_ILLUSTRATION_RASTER_ASSETS.length);
    for (const item of items) {
      expect(item.source.kind).toBe("builtin-raster");
      expect(deriveStudioUnifiedAssetFacet(item)).toMatchObject({ format: "image", editability: "flattened" });
      const preview = resolveStudioUnifiedAssetRichPreview(item);
      expect(preview.kind).toBe("image");
      if (preview.kind === "image") expect(preview.aspectRatio).toBeGreaterThan(0);
      expect(searchStudioUnifiedAssets(items, { query: item.title })).toContain(item);
    }
  });

  it("신규 8개 구성을 프레임·대사·텍스트로 유지하고 원점을 이동할 수 있다", () => {
    expect(STUDIO_ILLUSTRATION_SCENE_TEMPLATES).toHaveLength(8);
    const layouts = new Set<string>();
    for (const template of STUDIO_ILLUSTRATION_SCENE_TEMPLATES) {
      expect(SCENE_TEMPLATES).toContain(template);
      const seeds = template.build(0, 0);
      const summary = summarizeStudioSceneTemplate(template);
      expect(summary.width).toBe(720);
      expect(summary.height).toBeLessThanOrEqual(900);
      expect(seeds.some((seed) => seed.type === "bubble")).toBe(true);
      expect(seeds.every((seed) => seed.type === "frame" || seed.type === "bubble" || seed.type === "text")).toBe(true);
      expect(template.build(21, 40)).toEqual(seeds.map((seed) => ({ ...seed, x: seed.x + 21, y: seed.y + 40 })));
      expect(getStudioSceneTemplateBackgroundIds(template.id).length).toBeGreaterThanOrEqual(2);
      layouts.add(JSON.stringify(seeds.map((seed) => [seed.type, seed.x, seed.y, seed.width])));
    }
    expect(layouts.size).toBe(8);
  });

  it.each(STUDIO_ILLUSTRATION_SCENE_TEMPLATES)("$id 실제 장면 삽입 엔진에서 대사 충돌 없이 추가된다", (template) => {
    let sequence = 0;
    const result = runStudioPageAddSceneTemplate({
      elements: [], canvasW: 720, canvasH: 2_000, selected: null, viewCenter: { x: 360, y: 600 },
    }, template.id, () => `illustrated-${sequence++}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = studioCanvasSnapshotFromElements(result.elements);
    expect(snapshot.frames.length).toBeGreaterThan(0);
    expect(snapshot.decor.length).toBeGreaterThan(0);
    expect(postInsertFramesComposable(snapshot.frames, snapshot.decor)).toBe(true);
  });
});
