// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioScene3dAuthority } from "./studio-scene3d-authority";
import { parseStudioScene3dCutSource } from "./studio-scene3d-shot-versions";
import { prepareStudioScene3dCutAssets, type StudioScene3dPreparedCutAssets } from "./studio-scene3d-cut-assets";
import { createStudioScene3dCutBg3dHost, type StudioScene3dCutBg3dEditorHost } from "./studio-scene3d-cut-bg3d-host";
import {
  createDefaultStudioBg3dSceneDocument,
  normalizeStudioBg3dGlbAttachment,
  type StudioBg3dModelAttachment,
} from "../bg3d/studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument } from "../bg3d/studio-bg3d-scene-runtime";

vi.mock("./studio-scene3d-cut-assets", () => ({ prepareStudioScene3dCutAssets: vi.fn() }));
afterEach(() => vi.clearAllMocks());

function attachment(id: string): StudioBg3dModelAttachment {
  const value = normalizeStudioBg3dGlbAttachment({
    id, name: "고정 모델.glb", mime: "model/gltf-binary", byteSize: 100,
    hash: `sha256:${"a".repeat(64)}`, source: "local-library",
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  });
  if (!value) throw new Error("첨부 fixture 검증 실패");
  return value;
}

function fixture() {
  const events: string[] = [];
  const desiredAttachment = attachment("cut-attachment");
  const initialDocument = createDefaultStudioBg3dSceneDocument();
  let liveDocument = initialDocument;
  const attachmentByStorageModelIdRef = { current: new Map<string, StudioBg3dModelAttachment>() };
  const storageModelIdByAttachmentIdRef = { current: new Map<string, string>() };
  const history = vi.fn<StudioScene3dCutBg3dEditorHost["commitImmediateHistoryTransition"]>(() => { events.push("history"); });
  const replace = vi.fn<StudioScene3dCutBg3dEditorHost["replaceCanonicalDocumentState"]>((mutation) => {
    if (!mutation.document) throw new Error("컷 복귀 canonical 문서 없음");
    events.push("document"); liveDocument = mutation.document;
  });
  const camera = vi.fn(() => { events.push("camera"); return true; });
  const host: StudioScene3dCutBg3dEditorHost = {
    open: true, sceneBaseDocument: initialDocument, primitives: [], customModels: [],
    viewportBoxSize: { width: 1280, height: 720 },
    sharedStageSessionScopeKey: "cut-model-restore-test",
    modelRenderer: { domElement: document.createElement("canvas"), isWebGPURenderer: true, hasFeature: () => false },
    modelRootCacheRef: { current: new Map() },
    attachmentByStorageModelIdRef, storageModelIdByAttachmentIdRef,
    pendingInitialCameraRef: { current: null }, viewportApiRef: { current: { applyView: camera } },
    physicsRuntimeSourceRef: { current: { revision: 7 } },
    modalAssetSessionRef: { current: { epoch: 1 } },
    readCurrentCanonicalSceneForShot: () => liveDocument,
    commitImmediateHistoryTransition: history,
    replaceCanonicalDocumentState: replace,
    setLineArtPreview: vi.fn(),
  };
  const adapter = createStudioScene3dCutBg3dHost(host);
  const targetDocument = adaptStudioBg3dRuntimeToDocument({
    primitives: [],
    customModels: [{ id: "cut-model-node", modelId: "storage-new", position: [1, 0, 2], rotation: [0, 0, 0], scale: [1, 1, 1] }],
    attachmentByStorageModelId: new Map([["storage-new", desiredAttachment]]),
  }).document;
  const authority = createStudioScene3dAuthority({ authorityId: adapter.projectId, bg3d: targetDocument, viewportAspectRatio: 16 / 9, now: "2026-09-27T00:00:00.000Z" });
  const source = parseStudioScene3dCutSource({
    scene: { ...authority.document, activeCameraId: "camera:main" }, characters: {}, legacyBg3d: targetDocument,
  });
  const commitCache = vi.fn(() => { events.push("cache"); });
  const dispose = vi.fn(() => { events.push("dispose"); });
  const prepared: StudioScene3dPreparedCutAssets = {
    attachmentByStorageModelId: new Map([["storage-new", desiredAttachment]]),
    storageModelIdByAttachmentId: new Map([["cut-attachment", "storage-new"]]),
    commitCache, dispose,
  };
  vi.mocked(prepareStudioScene3dCutAssets).mockResolvedValue(prepared);
  return {
    adapter, source, host, initialDocument, targetDocument, attachmentByStorageModelIdRef,
    storageModelIdByAttachmentIdRef, history, replace, camera, prepared, commitCache, dispose, events,
  };
}

describe("실제 BG3D 컷 호스트의 모델 연결 확정 경계", () => {
  it("첨부 ID가 다른 저장 모델에 이미 연결되면 cache·maps·history·문서를 모두 보존한다", async () => {
    const value = fixture();
    value.storageModelIdByAttachmentIdRef.current.set("cut-attachment", "storage-old");
    value.attachmentByStorageModelIdRef.current.set("storage-old", attachment("cut-attachment"));
    const originalStorageMap = value.storageModelIdByAttachmentIdRef.current;
    const originalAttachmentMap = value.attachmentByStorageModelIdRef.current;

    await expect(value.adapter.applySource(value.source, null, new AbortController().signal))
      .rejects.toThrow(/같은 첨부 식별자가 다른 모델 원본/);

    expect(prepareStudioScene3dCutAssets).toHaveBeenCalledTimes(1);
    expect(value.commitCache).not.toHaveBeenCalled();
    expect(value.storageModelIdByAttachmentIdRef.current).toBe(originalStorageMap);
    expect([...originalStorageMap]).toEqual([["cut-attachment", "storage-old"]]);
    expect(value.attachmentByStorageModelIdRef.current).toBe(originalAttachmentMap);
    expect([...originalAttachmentMap.keys()]).toEqual(["storage-old"]);
    expect(value.history).not.toHaveBeenCalled();
    expect(value.replace).not.toHaveBeenCalled();
    expect(value.camera).not.toHaveBeenCalled();
    expect(value.host.readCurrentCanonicalSceneForShot()).toBe(value.initialDocument);
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });

  it("저장 모델 ID에 다른 첨부가 있으면 반대 방향 충돌도 확정 전에 거부한다", async () => {
    const value = fixture();
    value.attachmentByStorageModelIdRef.current.set("storage-new", attachment("undo-attachment"));
    value.storageModelIdByAttachmentIdRef.current.set("undo-attachment", "storage-new");
    await expect(value.adapter.applySource(value.source, null, new AbortController().signal))
      .rejects.toThrow(/같은 모델의 첨부 식별자/);
    expect(value.commitCache).not.toHaveBeenCalled();
    expect(value.history).not.toHaveBeenCalled();
    expect(value.replace).not.toHaveBeenCalled();
    expect(value.storageModelIdByAttachmentIdRef.current.has("cut-attachment")).toBe(false);
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });

  it("정상 준비가 끝난 뒤 cache·maps·history·canonical·camera 순서로 모델을 복원한다", async () => {
    const value = fixture();
    value.attachmentByStorageModelIdRef.current.set("undo-storage", attachment("undo-attachment"));
    value.storageModelIdByAttachmentIdRef.current.set("undo-attachment", "undo-storage");
    const gate = Promise.withResolvers<StudioScene3dPreparedCutAssets>();
    vi.mocked(prepareStudioScene3dCutAssets).mockReturnValueOnce(gate.promise);
    value.commitCache.mockImplementationOnce(() => {
      expect(value.history).not.toHaveBeenCalled();
      expect(value.replace).not.toHaveBeenCalled();
      expect(value.storageModelIdByAttachmentIdRef.current.has("cut-attachment")).toBe(false);
      value.events.push("cache");
    });
    value.history.mockImplementationOnce(() => {
      expect(value.storageModelIdByAttachmentIdRef.current.get("cut-attachment")).toBe("storage-new");
      expect(value.attachmentByStorageModelIdRef.current.get("storage-new")?.id).toBe("cut-attachment");
      value.events.push("history");
    });
    const applying = value.adapter.applySource(value.source, null, new AbortController().signal);
    expect(value.events).toEqual([]);
    expect(value.host.readCurrentCanonicalSceneForShot()).toBe(value.initialDocument);
    gate.resolve(value.prepared);
    await expect(applying).resolves.toBe("applied");
    expect(value.events).toEqual(["cache", "history", "document", "camera", "dispose"]);
    expect(value.storageModelIdByAttachmentIdRef.current.get("undo-attachment")).toBe("undo-storage");
    expect(value.replace).toHaveBeenCalledWith(expect.objectContaining({
      customModels: [expect.objectContaining({ id: "cut-model-node", modelId: "storage-new", position: [1, 0, 2] })],
      document: expect.objectContaining({ attachments: value.targetDocument.attachments }),
    }));
    expect(value.history.mock.calls[0]?.[4]).toMatchObject({ commandId: "scene3d.cut.restore", source: "inspector" });
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });

  it("cache 확정 실패는 준비한 maps를 공개하거나 문서 명령을 시작하지 않는다", async () => {
    const value = fixture();
    value.commitCache.mockImplementationOnce(() => { throw new Error("준비 cache가 다른 작업으로 교체됨"); });
    await expect(value.adapter.applySource(value.source, null, new AbortController().signal)).rejects.toThrow(/다른 작업/);
    expect(value.storageModelIdByAttachmentIdRef.current.size).toBe(0);
    expect(value.attachmentByStorageModelIdRef.current.size).toBe(0);
    expect(value.history).not.toHaveBeenCalled();
    expect(value.replace).not.toHaveBeenCalled();
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });
});
