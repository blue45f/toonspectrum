import { Group } from "three";
import { describe, expect, it, vi } from "vitest";

import { prepareStudioScene3dCutAssets, type StudioScene3dCutAssetPreparation } from "./studio-scene3d-cut-assets";
import { createDefaultStudioBg3dSceneDocument, type StudioBg3dModelAttachment } from "../bg3d/studio-bg3d-scene-document";
import { resolveStudioBg3dDeviceQuality } from "../bg3d/studio-bg3d-device-quality";
import { classifyStudioBg3dThreeSemanticMaterials } from "../bg3d/studio-bg3d-three-semantic-materials";
import type { Bg3dVerifiedStoredRecord } from "../bg3d/studio-bg3d-model-library-loader";
import type { StudioBg3dModelRootCacheEntry } from "../bg3d/studio-bg3d-model-runtime-admission";

function record(index: number): Bg3dVerifiedStoredRecord {
  return {
    id: `stored:${index}`, storageVersion: 2, name: `모델 ${index}.glb`, format: "glb",
    blob: new Blob([new Uint8Array(100)], { type: "model/gltf-binary" }), thumbnail: null,
    createdAt: 1, updatedAt: 1, contentHash: `sha256:${String(index).repeat(64)}`,
    byteSize: 100, mime: "model/gltf-binary", validationVersion: 1, validatedAt: 1, validatorProfile: "desktop",
    validatorMetrics: {
      byteSize: 100, jsonByteSize: 80, binByteSize: 0, nodes: 0, meshes: 0, meshPrimitives: 0,
      drawCalls: 0, triangles: 0, materials: 0, textures: 0, images: 0, imageBytes: 0,
      estimatedDecodedImageBytes: 0, maxImageDimension: 0, undeterminedImageDimensions: 0,
      lights: 0, animations: 0, animationChannels: 0, animationKeyframes: 0, animationValues: 0,
      skins: 0, joints: 0, morphTargets: 0, accessorElements: 0, estimatedDecodedGeometryBytes: 0,
    },
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  };
}

function entry(model: Bg3dVerifiedStoredRecord): StudioBg3dModelRootCacheEntry {
  const root = new Group();
  return {
    root, record: model, dispose: vi.fn(), animations: [], admittedProfiles: new Set(["desktop"]),
    admissionPolicyKeys: new Set(["initial"]), joints: [], morphTargets: [], genericHints: {},
    semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(root),
    metrics: { nodes: 1, triangles: 1, drawCalls: 1, materials: 1, lights: 0, animations: 0,
      animationChannels: 0, animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0,
      morphTargets: 0, accessorElements: 3, estimatedDecodedGeometryBytes: 36, textures: 0,
      textureBytes: 0, maxTextureDimension: 0 },
  };
}

function fixture(count = 2) {
  const records = Array.from({ length: count }, (_, index) => record(index + 1));
  const attachments: StudioBg3dModelAttachment[] = records.map((model, index) => ({
    id: `attachment-${index + 1}`, name: model.name, mime: model.mime, byteSize: model.byteSize,
    hash: model.contentHash, rights: model.rights, source: "local-library",
  }));
  const document = { ...createDefaultStudioBg3dSceneDocument(), attachments };
  const controller = new AbortController();
  const created: StudioBg3dModelRootCacheEntry[] = [];
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>();
  const resolveModel = vi.fn<NonNullable<StudioScene3dCutAssetPreparation["resolveModel"]>>(async (hash) => ({
    record: records.find((model) => model.contentHash === hash) ?? null, deletionReceipt: null,
  }));
  const admitModel = vi.fn<NonNullable<StudioScene3dCutAssetPreparation["admitModel"]>>(async (args) => {
    const existing = args.cache.get(args.record.id);
    if (existing) { existing.admissionPolicyKeys?.add("revalidated"); return existing; }
    const result = entry(args.record);
    created.push(result);
    args.cache.set(args.record.id, result);
    args.onCacheEntryCreated?.(args.record.id, result);
    return result;
  });
  let epoch = 1;
  let revision = "input:1";
  const args: StudioScene3dCutAssetPreparation = {
    document, signal: controller.signal,
    quality: resolveStudioBg3dDeviceQuality({ document, mode: "edit", preference: "desktop", signals: { cssWidth: 1280, cssHeight: 720, devicePixelRatio: 1 } }),
    renderer: null, cache, isCurrent: () => epoch === 1,
    expectedInputRevision: "input:1", readInputRevision: () => revision,
    resolveModel, admitModel,
  };
  return { args, cache, records, document, created, controller, resolveModel, admitModel,
    changeEpoch: () => { epoch++; }, changeRevision: () => { revision = "input:2"; } };
}

describe("컷 원본 모델 준비와 소유권 이전", () => {
  it("기존 해시 해석·입장·첨부 연결 경로로 준비하고 확정 전 live cache와 원본을 보존한다", async () => {
    const fixtureValue = fixture();
    const before = JSON.stringify(fixtureValue.document);
    const prepared = await prepareStudioScene3dCutAssets(fixtureValue.args);
    expect(fixtureValue.cache.size).toBe(0);
    expect(JSON.stringify(fixtureValue.document)).toBe(before);
    expect([...prepared.storageModelIdByAttachmentId]).toEqual([
      ["attachment-1", "stored:1"], ["attachment-2", "stored:2"],
    ]);
    expect(fixtureValue.admitModel.mock.calls.map(([args]) => args.cumulativeUsedBytes)).toEqual([0, 100]);
    expect(fixtureValue.admitModel.mock.calls[0]?.[0]).toMatchObject({
      renderer: fixtureValue.args.renderer, quality: fixtureValue.args.quality, signal: fixtureValue.args.signal,
    });
    prepared.commitCache();
    expect(fixtureValue.cache.size).toBe(2);
    prepared.dispose();
    fixtureValue.created.forEach((value) => expect(value.dispose).not.toHaveBeenCalled());
    expect(() => prepared.commitCache()).toThrow(/이미 확정/);
  });

  it("취소된 해시 조회가 늦게 끝나도 입장이나 live cache 설치를 시작하지 않는다", async () => {
    const value = fixture(1);
    const gate = Promise.withResolvers<Awaited<ReturnType<NonNullable<StudioScene3dCutAssetPreparation["resolveModel"]>>>>();
    value.resolveModel.mockReturnValueOnce(gate.promise);
    const preparing = prepareStudioScene3dCutAssets(value.args);
    const rejection = expect(preparing).rejects.toMatchObject({ name: "AbortError" });
    value.controller.abort();
    gate.resolve({ record: value.records[0], deletionReceipt: null });
    await rejection;
    expect(value.admitModel).not.toHaveBeenCalled();
    expect(value.cache.size).toBe(0);
  });

  it.each(["modal-epoch", "input-revision", "abort"] as const)("디코드 중 %s 변경이면 이 작업이 만든 GPU 자원만 폐기한다", async (boundary) => {
    const value = fixture(1);
    const base = value.admitModel.getMockImplementation();
    if (!base) throw new Error("입장 fixture 없음");
    value.admitModel.mockImplementationOnce(async (args) => {
      const result = await base(args);
      if (boundary === "modal-epoch") value.changeEpoch();
      else if (boundary === "input-revision") value.changeRevision();
      else value.controller.abort();
      expect(args.isActive()).toBe(false);
      return result;
    });
    await expect(prepareStudioScene3dCutAssets(value.args)).rejects.toThrow();
    expect(value.cache.size).toBe(0);
    expect(value.created[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("일부 모델 준비 뒤 admission 예산/renderer 오류면 성공 결과 없이 새 자원을 모두 해제한다", async () => {
    const value = fixture();
    const base = value.admitModel.getMockImplementation();
    if (!base) throw new Error("입장 fixture 없음");
    value.admitModel.mockImplementation(async (args) => {
      if (args.record.id === "stored:2") throw new Error("model-byte-budget-exceeded");
      return base(args);
    });
    await expect(prepareStudioScene3dCutAssets(value.args)).rejects.toThrow("model-byte-budget-exceeded");
    expect(value.cache.size).toBe(0);
    expect(value.created[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("해시 또는 권한이 다른 모델과 삭제된 원본을 임의 대체하지 않는다", async () => {
    const value = fixture(1);
    const model = value.records[0];
    value.resolveModel.mockResolvedValueOnce({ record: { ...model, rights: { ...model.rights, commercialUse: false } }, deletionReceipt: null });
    await expect(prepareStudioScene3dCutAssets(value.args)).rejects.toThrow(/해시·크기·권한/);
    value.resolveModel.mockResolvedValueOnce({ record: null, deletionReceipt: null });
    await expect(prepareStudioScene3dCutAssets(value.args)).rejects.toThrow(/원본을 찾지/);
    expect(value.admitModel).not.toHaveBeenCalled();
  });

  it("기존 GPU cache를 빌려도 확정 전 policy stamp를 바꾸거나 dispose하지 않는다", async () => {
    const value = fixture(1);
    const cached = entry(value.records[0]);
    value.cache.set("stored:1", cached);
    const prepared = await prepareStudioScene3dCutAssets(value.args);
    expect(value.cache.get("stored:1")).toBe(cached);
    expect(cached.admissionPolicyKeys).toEqual(new Set(["initial"]));
    prepared.dispose();
    expect(cached.dispose).not.toHaveBeenCalled();
    expect(() => prepared.commitCache()).toThrow(/폐기/);
  });

  it("준비 뒤 다른 작업이 설치한 cache를 덮어쓰거나 해제하지 않는다", async () => {
    const value = fixture(1);
    const prepared = await prepareStudioScene3dCutAssets(value.args);
    const competing = entry(value.records[0]);
    value.cache.set("stored:1", competing);
    expect(() => prepared.commitCache()).toThrow();
    expect(value.cache.get("stored:1")).toBe(competing);
    expect(competing.dispose).not.toHaveBeenCalled();
    expect(value.created[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("준비 후 입력 revision이 바뀌면 확정하지 않고 문서 snapshot은 요청 시점을 유지한다", async () => {
    const value = fixture(1);
    const preparing = prepareStudioScene3dCutAssets(value.args);
    value.document.attachments[0] = { ...value.document.attachments[0], name: "대기 중 변경" };
    const prepared = await preparing;
    expect(prepared.attachmentByStorageModelId.get("stored:1")?.name).toBe("모델 1.glb");
    value.changeRevision();
    expect(() => prepared.commitCache()).toThrow();
    expect(value.cache.size).toBe(0);
    expect(value.created[0]?.dispose).toHaveBeenCalledTimes(1);
  });
});
