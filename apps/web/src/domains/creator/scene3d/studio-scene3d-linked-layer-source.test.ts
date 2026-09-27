import { describe, expect, it } from "vitest";

import {
  captureStudioBg3dShot,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument, hydrateStudioBg3dDocumentToRuntime } from "../bg3d/studio-bg3d-scene-runtime";
import { createStudioLinked3dRenderPageFixture, createStudioLinked3dPassRevisionFixture } from "../studio-linked-3d-render-test-fixture";
import { upsertStudioLinked3dRenderLink } from "../studio-linked-3d-render-document";
import { migrateStudioShared3dStageCollectionDocument } from "../studio-shared-3d-stage-collection";
import { createStudioShared3dStageDocument } from "../studio-shared-3d-stage-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";
import { createStudioScene3dAuthority, projectStudioScene3dAuthorityToSources } from "./studio-scene3d-authority";
import { approveStudioScene3dVersionedCut, createStudioScene3dVersionedCut } from "./studio-scene3d-shot-versions";
import { describeStudioScene3dLinkedLayerReview, resolveStudioScene3dLinkedLayerEditSource, snapshotStudioScene3dLinkedLayerEditSource } from "./studio-scene3d-linked-layer-source";

function fixture() {
  const page = createStudioLinked3dRenderPageFixture();
  const element = page.elements[0];
  const bundleId = element?.type === "image" ? element.bg3dLtBundleId : undefined;
  const linked3dRender = page.linked3dRender;
  const shared3dStage = page.shared3dStage;
  if (
    !element
    || element.type !== "image"
    || !bundleId
    || !element.bg3dScene
    || !shared3dStage
    || !linked3dRender
  ) {
    throw new Error("Linked 3D fixture is incomplete.");
  }
  return {
    page,
    element,
    bundleId,
    linked3dRender,
    shared3dStage,
  };
}

function pinnedFixture(exportAspectRatio?: number) {
  const original = fixture();
  const baseSource = original.element.bg3dScene;
  if (!baseSource) throw new Error("컷 원본이 없습니다.");
  const source = exportAspectRatio === undefined ? baseSource : {
    ...baseSource, output: { ...baseSource.output, exportAspectRatio },
  };
  const cut = approveStudioScene3dVersionedCut(createStudioScene3dVersionedCut({
    id: "cut:linked-approved",
    name: "승인된 1컷",
    scene: projectStudioBg3dDocumentToScene3d({ documentId: "project:linked-cut", source, viewportAspectRatio: 800 / 1_080 }),
    characters: {},
    legacyBg3d: source,
  }));
  const scene: StudioBg3dSceneDocument = { ...source, pinnedVersionedCut: cut };
  const provisional = { ...original.element, bg3dScene: scene };
  const shared3dStage = migrateStudioShared3dStageCollectionDocument(createStudioShared3dStageDocument({
    backgroundBundleId: original.bundleId,
    elements: [provisional],
    capturePolicy: "background-only",
  }));
  const sourceHash = shared3dStage?.stages[0]?.background.sourceHash;
  if (!shared3dStage || !sourceHash || !scene.activeShotId) throw new Error("컷 Stage를 만들지 못했습니다.");
  const passRevision = createStudioLinked3dPassRevisionFixture(scene, sourceHash);
  const elements = [{ ...provisional, src: passRevision.artifact.locator }];
  const linked3dRender = upsertStudioLinked3dRenderLink({
    value: undefined,
    bundleId: original.bundleId,
    shotId: scene.activeShotId,
    passRevision,
    elements,
    shared3dStage,
  });
  if (!linked3dRender) throw new Error("컷 line pass를 연결하지 못했습니다.");
  return { scene, cut, elements, bundleId: original.bundleId, shared3dStage, linked3dRender };
}

describe("Studio Scene3D lightweight linked source", () => {
  it("restores the canonical BG3D scene without constructing Scene3D authority", () => {
    const { page, element, bundleId, linked3dRender, shared3dStage } = fixture();
    const scene = resolveStudioScene3dLinkedLayerEditSource({
      bundleId,
      linked3dRender,
      shared3dStage,
      elements: page.elements,
    });
    expect(scene).toEqual(element.bg3dScene);
  });

  it("2D 원본을 다시 열 때 가변 저장 문서와 독립된 장면을 고정한다", () => {
    const { page, bundleId, linked3dRender, shared3dStage } = fixture();
    const elements = structuredClone(page.elements);
    const anchor = elements[0];
    if (anchor?.type !== "image" || !anchor.bg3dScene) {
      throw new Error("연결된 3D 원본 앵커가 없습니다.");
    }
    const scene = resolveStudioScene3dLinkedLayerEditSource({
      bundleId,
      linked3dRender,
      shared3dStage,
      elements,
    });
    expect(scene).not.toBeNull();
    expect(scene).not.toBe(anchor.bg3dScene);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene?.camera)).toBe(true);

    const originalFov = scene?.camera.fovDegrees;
    expect(Reflect.set(anchor.bg3dScene.camera, "fovDegrees", 75)).toBe(true);
    expect(scene?.camera.fovDegrees).toBe(originalFov);
  });

  it("fails closed when the linked shot and canonical scene diverge", () => {
    const { element, bundleId, linked3dRender, shared3dStage } = fixture();
    const divergedScene = captureStudioBg3dShot(element.bg3dScene, {
      id: "other-shot",
      name: "Other shot",
    });
    if (!divergedScene) throw new Error("Diverged shot fixture could not be created.");
    const scene = resolveStudioScene3dLinkedLayerEditSource({
      bundleId,
      linked3dRender,
      shared3dStage,
      elements: [{ ...element, bg3dScene: divergedScene }],
    });
    expect(scene).toBeNull();
  });

  it("실제 원고 line pass에 고정 원본과 승인 컷을 저장하고 재편집 시 같은 버전을 복원한다", () => {
    const input = pinnedFixture();
    const serialized = serializeStudioBg3dSceneDocument(input.scene);
    if (!serialized) throw new Error("고정 컷 저장 실패");
    const persisted = parseStudioBg3dSceneDocument(serialized);
    if (!persisted) throw new Error("고정 컷 복원 실패");
    const reopened = resolveStudioScene3dLinkedLayerEditSource({
      ...input,
      elements: input.elements.map((element) => ({ ...element, bg3dScene: persisted })),
    });
    expect(reopened?.pinnedVersionedCut).toEqual(input.cut);
    expect(reopened?.pinnedVersionedCut?.status).toBe("approved");
    expect(reopened?.pinnedVersionedCut?.sourceHash).toBe(input.cut.sourceHash);
    expect(reopened?.pinnedVersionedCut).not.toBe(input.cut);
    expect(Object.isFrozen(reopened?.pinnedVersionedCut?.source.scene)).toBe(true);
    expect(describeStudioScene3dLinkedLayerReview({ ...input, scene: persisted })).toMatchObject({
      pinnedCutId: input.cut.id,
      pinnedApproval: "approved",
      cameraNeedsReview: false,
      sceneNeedsReview: false,
      automaticSurfaceReprojection: false,
    });
  });

  it("고정 컷 해시 손상은 저장·복원·대화형 정규화에서 원본 삭제로 숨기지 않는다", () => {
    const { scene, cut } = pinnedFixture();
    const damaged = { ...scene, pinnedVersionedCut: { ...cut, sourceHash: "damaged" } };
    expect(serializeStudioBg3dSceneDocument(damaged)).toBeNull();
    expect(parseStudioBg3dSceneDocument(JSON.stringify(damaged))).toBeNull();
    expect(() => normalizeStudioBg3dSceneDocument(damaged)).toThrow("고정 컷 원본이 손상");
  });

  it("단일 PNG 원본도 승인 snapshot을 독립 복원하고 중첩된 컷 재귀를 거부한다", () => {
    const { scene, cut } = pinnedFixture();
    const restored = snapshotStudioScene3dLinkedLayerEditSource(scene);
    expect(restored?.pinnedVersionedCut).toEqual(cut);
    expect(restored?.pinnedVersionedCut).not.toBe(cut);
    expect(Object.isFrozen(restored?.pinnedVersionedCut)).toBe(true);
    const nested = { ...scene, pinnedVersionedCut: {
      ...cut, source: { ...cut.source, legacyBg3d: scene },
    } };
    expect(serializeStudioBg3dSceneDocument(nested)).toBeNull();
    expect(parseStudioBg3dSceneDocument(JSON.stringify(nested))).toBeNull();
  });

  it("편집기 재진입 hydration과 실제 출력 adapter를 지나도 고정 컷을 보존한다", () => {
    const { scene, cut } = pinnedFixture();
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: scene, storageModelIdByAttachmentId: new Map() });
    expect(hydrated.ok).toBe(true);
    const exported = adaptStudioBg3dRuntimeToDocument({
      baseDocument: scene,
      primitives: hydrated.primitives,
      customModels: hydrated.customModels,
      attachmentByStorageModelId: new Map(),
    });
    expect(exported.diagnostics).toEqual([]);
    expect(exported.document.pinnedVersionedCut).toEqual(cut);
    expect(parseStudioBg3dSceneDocument(exported.serialized)?.pinnedVersionedCut).toEqual(cut);
  });

  it("갱신된 화면 보정과 표면 부착 보정은 별도 재검토로 표시하고 재투영 성공을 만들지 않는다", () => {
    const input = pinnedFixture();
    const cut = createStudioScene3dVersionedCut({
      ...input.cut.source,
      id: "cut:review",
      name: "보정 검토",
      corrections: [
        { id: "screen", elementId: "draw:screen", kind: "screen-space", status: "needs-review" },
        { id: "surface", elementId: "draw:surface", kind: "surface-attached", status: "needs-review",
          entityId: "retired-character", surfaceId: "face", topologyRevision: "old-topology" },
      ],
    });
    const review = describeStudioScene3dLinkedLayerReview({ scene: { ...input.scene, pinnedVersionedCut: cut } });
    expect(review).toMatchObject({
      screenSpaceReviewElementIds: ["draw:screen"],
      surfaceReviewElementIds: ["draw:surface"],
      automaticSurfaceReprojection: false,
    });
    expect(review?.message).toContain("화면 좌표 보정 1개 재검토 필요");
    expect(review?.message).toContain("표면 부착 보정 1개 재부착 검토 필요 · 자동 재투영 미지원");
    expect(input.cut.status).toBe("approved");
  });

  it("기존 DrawEl이 새 pass에 재적용되어도 좌표 보정을 검토 완료로 간주하지 않는다", () => {
    const input = pinnedFixture();
    const previousLink = input.linked3dRender.links[0];
    if (!previousLink) throw new Error("연결된 pass가 없습니다.");
    const passRevision = createStudioLinked3dPassRevisionFixture(input.scene, previousLink.stageSourceHash, { revision: 2 });
    const review = describeStudioScene3dLinkedLayerReview({
      ...input,
      linked3dRender: {
        ...input.linked3dRender,
        links: [{ ...previousLink, passRevision, corrections: [{
          elementId: "draw:previous-pass",
          sourcePassRevision: 1,
          appliedPassRevision: 2,
          status: "applied",
          conflictCode: null,
        }] }],
      },
    });
    expect(review?.screenSpaceReviewElementIds).toEqual(["draw:previous-pass"]);
    expect(review?.pinnedApproval).toBe("approved");
    expect(review?.message).toContain("원본 승인");
    expect(review?.message).toContain("화면 좌표 보정 1개 재검토 필요");
  });

  it("고정 컷 이후 카메라 편집은 현재 화면 재검토로 구분하고 이전 승인을 보존한다", () => {
    const input = pinnedFixture();
    const scene = { ...input.scene, camera: { ...input.scene.camera, fovDegrees: 72 } };
    const review = describeStudioScene3dLinkedLayerReview({ ...input, scene });
    expect(review?.pinnedApproval).toBe("approved");
    expect(review?.cameraNeedsReview).toBe(true);
    expect(review?.message).toContain("현재 화면의 카메라가 고정 컷과 달라 재검토 필요");
    expect(scene.pinnedVersionedCut?.sourceHash).toBe(input.cut.sourceHash);
    expect(scene.pinnedVersionedCut?.status).toBe("approved");
  });

  it("컷 원본의 장면을 변경하면 기존 화면 보정도 재검토 대상으로 표시한다", () => {
    const input = pinnedFixture();
    const cut = approveStudioScene3dVersionedCut(createStudioScene3dVersionedCut({
      ...input.cut.source, id: "cut:corrected", name: "보정한 컷",
      corrections: [{ id: "screen", elementId: "draw:screen", kind: "screen-space", status: "current" }],
    }));
    const scene = { ...input.scene, pinnedVersionedCut: cut, background: { ...input.scene.background, color: "#00ff00" } };
    const review = describeStudioScene3dLinkedLayerReview({ ...input, scene });
    expect(review?.sceneNeedsReview).toBe(true);
    expect(review?.cameraNeedsReview).toBe(false);
    expect(review?.screenSpaceReviewElementIds).toEqual(["draw:screen"]);
    expect(review?.message).toContain("현재 장면·모델·포즈가 고정 컷 원본과 달라 재검토 필요");
    expect(scene.pinnedVersionedCut.status).toBe("approved");
    expect(scene.pinnedVersionedCut.sourceHash).toBe(cut.sourceHash);
  });

  it.each([undefined, 16 / 9])("정상 컷 projection의 광원 방향 정규화와 출력 비율 고정(%s)을 원본 변경으로 오인하지 않는다", (aspect) => {
    const input = pinnedFixture(aspect);
    const source = input.cut.source.legacyBg3d;
    if (!source) throw new Error("원본 BG3D 장면이 없습니다.");
    const authority = createStudioScene3dAuthority({
      authorityId: input.cut.source.scene.documentId,
      bg3d: source,
      viewportAspectRatio: input.cut.source.scene.output.width / input.cut.source.scene.output.height,
      now: input.cut.source.scene.createdAt,
    });
    const projection = projectStudioScene3dAuthorityToSources(authority, input.cut.source.scene);
    expect(projection.issues).toEqual([]);
    const review = describeStudioScene3dLinkedLayerReview({
      ...input,
      scene: { ...projection.bg3d, pinnedVersionedCut: input.cut },
    });
    expect(review?.cameraNeedsReview).toBe(false);
    expect(review?.sceneNeedsReview).toBe(false);
  });
});
