import { describe, expect, it } from "vitest";
import { createCharacterDocumentV2, projectCharacterRecipeV1 } from "../character-platform/document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../character-platform/document/character-document-v3";
import type { CharacterRecipe } from "../character-shaper/character-shaper-contract";
import { createStudioWebAuthoringProjectV3, parseStudioWebAuthoringProjectV3, serializeStudioWebAuthoringProjectV3 } from "../studio-web-runtime/studio-web-authoring-project-v3";
import { StudioWebAuthoringProjectV3Repository } from "../studio-web-runtime/studio-web-authoring-project-v3-repository";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import {
  approveStudioScene3dVersionedCut,
  compareStudioScene3dCutSource,
  createStudioScene3dVersionedCut,
  editStudioScene3dCutPerformance,
  materializeStudioScene3dVersionedCut,
  reviewStudioScene3dCutCorrection,
  updateStudioScene3dCutSource,
  validateStudioScene3dShotVersionCollection,
} from "./studio-scene3d-shot-versions";

const recipe: CharacterRecipe = {
  version: 1,
  slots: { "face-shape": null, eyes: null, irises: null, nose: null, mouth: null, ears: null, hair: null, body: null, top: null, bottom: null, shoes: null, accessory: [], expression: null, pose: null, "hand-pose": null },
  colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  handSide: "both",
};

function source(revision = 1) {
  const baseHero = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:hero",
    model: { assetId: "hero", assetVersion: "1", contentSha256: null, mode: "canonical", topologyFamily: "toon-standard", topologyRevision: `topology:v${revision}`, rigRevision: "rig:v1", morphRevision: "morph:v1", rendererRevision: "renderer:v1" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:v1" },
    recipe: projectCharacterRecipeV1(recipe), colors: recipe.colors, revision,
    now: "2026-09-27T00:00:00.000Z",
  }));
  const hero = { ...baseHero, topology: { ...baseHero.topology, stableSurfaceIds: ["face"] } };
  const scene = {
    ...createStudioScene3dDocument("project:cuts", "2026-09-27T00:00:00.000Z"), revision,
    assets: [{ id: "asset:hero", kind: "character" as const, version: String(revision), contentSha256: String(revision).repeat(64), uri: "character-source:hero", mime: "model/vrm", byteSize: 1,
      rights: { commercialUse: true, redistribution: true, derivativeUse: true, licenseName: "original" }, quality: { accepted: true, score: 100, reportUri: "/assets/quality/hero.json" } }],
    entities: [{ id: "entity:hero", name: "주인공", kind: "character" as const, assetId: "asset:hero", characterDocumentId: hero.documentId, characterRevision: revision,
      transform: { position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as const }, visible: true, locked: false, castShadow: true, receiveShadow: false, parentId: null }],
  };
  return { scene, characters: { [hero.documentId]: hero } };
}

describe("3D 컷 원본 버전 고정", () => {
  it("같은 캐릭터를 3컷에서 독립 연기·카메라로 재사용하고 새 원본과 함께 저장·복원한다", async () => {
    const initial = source();
    const before = JSON.stringify(initial);
    const cuts = [0, 1, 2].map((index) => {
      const cut = createStudioScene3dVersionedCut({ ...initial, id: `cut:${index}`, name: `컷 ${index + 1}` });
      const hero = initial.characters["character:hero"];
      return approveStudioScene3dVersionedCut(editStudioScene3dCutPerformance(cut, {
        camera: { ...initial.scene.cameras[0], focalLengthMm: 35 + index * 25 },
        performances: { "entity:hero": { pose: { ...hero.pose, root: { ...hero.pose.root, position: [index, 0, 0] } }, expression: { ...hero.expression, weights: { happy: index / 2 } } } },
      }));
    });
    const latest = source(2);
    const project = createStudioWebAuthoringProjectV3({ projectId: latest.scene.documentId, title: "3컷", ...latest });
    const serialized = serializeStudioWebAuthoringProjectV3({ ...project, shotVersions: { version: 1, cuts } });
    const rows = new Map<string, string>();
    const store: StudioAsyncKeyValueStore = {
      get: async (key) => rows.get(key) ?? null,
      set: async (key, value) => { rows.set(key, value); },
      delete: async (key) => { rows.delete(key); },
    };
    const repository = new StudioWebAuthoringProjectV3Repository({
      storeFactory: async () => store,
      // 이 단일 저장 테스트의 잠금 포트. 교차 instance 경합은 repository suite에서 별도 검증한다.
      lockProvider: { request: async (_name, _options, operation) => operation() },
    });
    await expect(repository.save(parseStudioWebAuthoringProjectV3(serialized))).resolves.toMatchObject({ status: "saved" });
    const restored = await repository.load(project.projectId);
    if (!restored) throw new Error("3컷 프로젝트 복원 실패");
    expect(restored.shotVersions?.cuts).toHaveLength(3);
    restored.shotVersions?.cuts.forEach((cut, index) => {
      const rendered = materializeStudioScene3dVersionedCut(cut);
      expect(cut.status).toBe("approved");
      expect(cut.source.scene.revision).toBe(1);
      expect(rendered.charactersByEntityId["entity:hero"].revision).toBe(1);
      expect(rendered.charactersByEntityId["entity:hero"].pose.root.position).toEqual([index, 0, 0]);
      expect(rendered.charactersByEntityId["entity:hero"].expression.weights.happy).toBe(index / 2);
      expect(rendered.scene.cameras.find((camera) => camera.id === rendered.scene.activeCameraId)?.focalLengthMm).toBe(35 + index * 25);
      expect(compareStudioScene3dCutSource(cut, latest).changedCharacterIds).toEqual(["character:hero"]);
    });
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("선택한 컷의 캐릭터만 갱신하고 연기·카메라와 다른 승인 컷을 보존한다", () => {
    const initial = source();
    const first = approveStudioScene3dVersionedCut(createStudioScene3dVersionedCut({ ...initial, id: "cut:a", name: "첫 컷" }));
    const second = createStudioScene3dVersionedCut({ ...initial, id: "cut:b", name: "둘째 컷" });
    const changed = updateStudioScene3dCutSource(first, source(2), { scene: false, characterIds: ["character:hero"] });
    expect(changed.source.characters["character:hero"].revision).toBe(2);
    expect(changed.source.scene.entities[0]).toMatchObject({ characterRevision: 2 });
    expect(changed.source.scene.assets[0].version).toBe("2");
    expect(changed.camera).toEqual(first.camera);
    expect(changed.performances).toEqual(first.performances);
    expect(changed.status).toBe("needs-review");
    expect(second.source.characters["character:hero"].revision).toBe(1);
    expect(first.status).toBe("approved");
  });

  it("화면 좌표 보정과 표면 부착을 구분하고 변경 뒤 명시적 재검토 전 승인을 막는다", () => {
    const initial = source();
    const cut = createStudioScene3dVersionedCut({ ...initial, id: "cut:a", name: "컷", corrections: [
      { id: "ink:screen", kind: "screen-space", elementId: "draw:screen", status: "current" },
      { id: "ink:surface", kind: "surface-attached", elementId: "draw:surface", entityId: "entity:hero", topologyRevision: "topology:v1", surfaceId: "face", status: "current" },
    ] });
    const updated = updateStudioScene3dCutSource(cut, source(2), { scene: false, characterIds: ["character:hero"] });
    expect(updated.corrections.map((entry) => [entry.kind, entry.status])).toEqual([["screen-space", "needs-review"], ["surface-attached", "needs-review"]]);
    expect(() => approveStudioScene3dVersionedCut(updated)).toThrow(/보정.*재검토/);
    expect(updated.corrections[1]).toMatchObject({ topologyRevision: "topology:v1" });
  });

  it("카메라 변경은 화면 보정을 재검토로 표시하고 잘못된 캐릭터 선택은 원본을 보존한다", () => {
    const initial = source();
    const cut = createStudioScene3dVersionedCut({ ...initial, id: "cut:a", name: "컷", corrections: [{ id: "ink:screen", kind: "screen-space", elementId: "draw:screen", status: "current" }] });
    const edited = editStudioScene3dCutPerformance(cut, { camera: { ...cut.camera, focalLengthMm: 85 } });
    expect(edited.corrections[0].status).toBe("needs-review");
    const before = JSON.stringify(cut);
    expect(() => updateStudioScene3dCutSource(cut, source(2), { scene: false, characterIds: ["missing"] })).toThrow();
    expect(JSON.stringify(cut)).toBe(before);
  });

  it("저장된 해시·버전 참조 위조와 중복 컷을 거부한다", () => {
    const cut = createStudioScene3dVersionedCut({ ...source(), id: "cut:a", name: "컷" });
    expect(() => validateStudioScene3dShotVersionCollection({ version: 1, cuts: [cut, cut] })).toThrow();
    expect(() => validateStudioScene3dShotVersionCollection({ version: 1, cuts: [{ ...cut, sourceHash: `sha256:${"f".repeat(64)}` }] })).toThrow();
    expect(() => createStudioScene3dVersionedCut({ ...source(), characters: source(2).characters, id: "cut:a", name: "컷" })).toThrow(/버전/);
    expect(() => validateStudioScene3dShotVersionCollection({ version: 1, cuts: [{ ...cut, performances: {} }] })).toThrow(/연기/);
    expect(() => createStudioScene3dVersionedCut({ ...source(), id: "cut:a", name: "컷", corrections: [{ id: "ink:bad", kind: "surface-attached", elementId: "draw:bad", entityId: "entity:hero", topologyRevision: "topology:v1", surfaceId: "missing", status: "current" }] })).toThrow(/표면/);
  });

  it("낮은 원본 버전과 같은 버전의 다른 내용을 선택적 업데이트로 적용하지 않는다", () => {
    const cut = createStudioScene3dVersionedCut({ ...source(2), id: "cut:a", name: "컷" });
    expect(() => updateStudioScene3dCutSource(cut, source(1), { scene: true, characterIds: ["character:hero"] })).toThrow(/버전/);
    const latest = source(2);
    const character = latest.characters["character:hero"];
    expect(() => updateStudioScene3dCutSource(cut, { ...latest, characters: { "character:hero": { ...character, look: { ...character.look, colors: { ...character.look.colors, hairBase: "#ff0000" } } } } }, { scene: false, characterIds: ["character:hero"] })).toThrow(/버전/);
  });

  it("화면 보정은 명시적 검토 후 승인하고 표면 보정은 새 원본에 다시 부착해야 한다", () => {
    const initial = source();
    const cut = createStudioScene3dVersionedCut({ ...initial, id: "cut:a", name: "컷", corrections: [
      { id: "ink:screen", kind: "screen-space", elementId: "draw:screen", status: "current" },
      { id: "ink:surface", kind: "surface-attached", elementId: "draw:surface", entityId: "entity:hero", topologyRevision: "topology:v1", surfaceId: "face", status: "current" },
    ] });
    const changed = updateStudioScene3dCutSource(cut, source(2), { scene: false, characterIds: ["character:hero"] });
    const screen = changed.corrections[0];
    const reviewed = reviewStudioScene3dCutCorrection(changed, { ...screen, status: "current" });
    expect(reviewed.corrections[0].status).toBe("current");
    expect(() => reviewStudioScene3dCutCorrection(reviewed, { ...reviewed.corrections[1], status: "current" })).toThrow(/재검토/);
    const surface = reviewed.corrections[1];
    if (surface.kind !== "surface-attached") throw new Error("표면 보정 필요");
    const reattached = reviewStudioScene3dCutCorrection(reviewed, { ...surface, topologyRevision: "topology:v2", status: "current" });
    expect(approveStudioScene3dVersionedCut(reattached).status).toBe("approved");
  });

  it("공유 asset의 한 캐릭터만 갱신해서 선택하지 않은 캐릭터 버전을 바꾸지 않는다", () => {
    function shared(revision: number) {
      const initial = source(revision);
      const friend = { ...initial.characters["character:hero"], documentId: "character:friend" };
      return { scene: { ...initial.scene, entities: [...initial.scene.entities, { ...initial.scene.entities[0], id: "entity:friend", characterDocumentId: friend.documentId }] }, characters: { ...initial.characters, [friend.documentId]: friend } };
    }
    const initial = shared(1);
    const cut = createStudioScene3dVersionedCut({ ...initial, id: "cut:a", name: "컷" });
    expect(() => updateStudioScene3dCutSource(cut, shared(2), { scene: false, characterIds: ["character:hero"] })).toThrow(/공유.*asset/);
    expect(materializeStudioScene3dVersionedCut(cut).charactersByEntityId["entity:friend"].revision).toBe(1);
  });

  it("같은 배치 ID에 다른 캐릭터가 들어오면 이전 캐릭터의 연기를 전달하지 않는다", () => {
    const initial = source();
    const hero = initial.characters["character:hero"];
    const cut = editStudioScene3dCutPerformance(createStudioScene3dVersionedCut({ ...initial, id: "cut:a", name: "컷" }), {
      performances: { "entity:hero": { pose: { ...hero.pose, root: { ...hero.pose.root, position: [8, 0, 0] } }, expression: hero.expression } },
    });
    const replacement = { ...hero, documentId: "character:replacement" };
    const candidate = { scene: { ...initial.scene, revision: 2, entities: [{ ...initial.scene.entities[0], characterDocumentId: replacement.documentId }] }, characters: { [replacement.documentId]: replacement } };
    const changed = updateStudioScene3dCutSource(cut, candidate, { scene: true, characterIds: [replacement.documentId] });
    expect(materializeStudioScene3dVersionedCut(changed).charactersByEntityId["entity:hero"].pose.root.position).toEqual([0, 0, 0]);
  });
});
