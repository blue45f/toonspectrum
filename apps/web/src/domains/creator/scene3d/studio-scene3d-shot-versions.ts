import { parseStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { parseCharacterDocumentV3, type CharacterDocumentV3 } from "../character-platform/document/character-document-v3";
import { assertStudioScene3dDocument, type StudioScene3dCamera, type StudioScene3dDocumentV1 } from "./studio-scene3d-document";
import { hashStudioScene3dCommandState } from "./studio-scene3d-command-core";

export interface StudioScene3dCutSource {
  readonly scene: StudioScene3dDocumentV1;
  readonly characters: Readonly<Record<string, CharacterDocumentV3>>;
  readonly legacyBg3d?: StudioBg3dSceneDocument;
}
export interface StudioScene3dCutPerformance {
  readonly pose: CharacterDocumentV3["pose"];
  readonly expression: CharacterDocumentV3["expression"];
}
export type StudioScene3dCutCorrection = {
  readonly id: string;
  readonly elementId: string;
  readonly status: "current" | "needs-review";
} & (
  | { readonly kind: "screen-space" }
  | { readonly kind: "surface-attached"; readonly entityId: string; readonly topologyRevision: string; readonly surfaceId: string }
);
export interface StudioScene3dVersionedCut {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly status: "draft" | "approved" | "needs-review";
  readonly source: StudioScene3dCutSource;
  readonly sourceHash: string;
  readonly camera: StudioScene3dCamera;
  readonly performances: Readonly<Record<string, StudioScene3dCutPerformance>>;
  readonly corrections: readonly StudioScene3dCutCorrection[];
}
export interface StudioScene3dShotVersionCollection {
  readonly version: 1;
  readonly cuts: readonly StudioScene3dVersionedCut[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === "string" && ID.test(value) && !FORBIDDEN.has(value);
}
function fail(message: string): never {
  throw new Error(`3D 컷: ${message}`);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function owned<T>(value: T): T {
  return freeze(structuredClone(value));
}
function hash(value: unknown): string {
  return hashStudioScene3dCommandState({ value });
}

export function parseStudioScene3dCutSource(value: unknown): StudioScene3dCutSource {
  if (!record(value) || !record(value.characters)) fail("원본 문서가 없습니다.");
  assertStudioScene3dDocument(value.scene);
  const characters: Record<string, CharacterDocumentV3> = {};
  for (const entity of value.scene.entities) {
    if (entity.kind !== "character") continue;
    if (!id(entity.characterDocumentId)) fail("캐릭터 식별자가 올바르지 않습니다.");
    const character = parseCharacterDocumentV3(value.characters[entity.characterDocumentId]);
    if (character.documentId !== entity.characterDocumentId || character.revision !== entity.characterRevision) {
      fail("캐릭터 원본 버전이 장면 참조와 다릅니다.");
    }
    characters[character.documentId] = character;
  }
  let legacyBg3d: StudioBg3dSceneDocument | undefined;
  if (value.legacyBg3d !== undefined) {
    if (!record(value.legacyBg3d) || value.legacyBg3d.pinnedVersionedCut !== undefined) fail("컷 원본에 중첩된 컷 참조를 넣을 수 없습니다.");
    const parsed = parseStudioBg3dSceneDocument(JSON.stringify(value.legacyBg3d));
    if (!parsed) fail("BG3D 원본을 복원할 수 없습니다.");
    legacyBg3d = parsed;
  }
  return owned({ scene: value.scene, characters, ...(legacyBg3d ? { legacyBg3d } : {}) });
}

function parseCut(value: unknown): StudioScene3dVersionedCut {
  if (!record(value) || !id(value.id) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 160
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !["draft", "approved", "needs-review"].includes(String(value.status))) fail("컷 식별자·상태가 올바르지 않습니다.");
  const source = parseStudioScene3dCutSource(value.source);
  if (value.sourceHash !== hash(source)) fail("고정한 원본 해시가 저장 내용과 다릅니다.");
  // 카메라 검증은 Scene3D의 동일한 계약을 사용합니다.
  const cameraDocument = { ...source.scene, cameras: [value.camera], activeCameraId: record(value.camera) ? value.camera.id : null, shots: [] };
  assertStudioScene3dDocument(cameraDocument);
  const camera = cameraDocument.cameras[0];
  if (!camera || !record(value.performances)) fail("컷 카메라·연기 정보가 없습니다.");
  const performances: Record<string, StudioScene3dCutPerformance> = {};
  for (const [entityId, performance] of Object.entries(value.performances)) {
    const entity = source.scene.entities.find((entry) => entry.id === entityId && entry.kind === "character");
    if (!id(entityId) || !entity || entity.kind !== "character" || !record(performance)) fail("연기 대상 캐릭터가 없습니다.");
    const character = parseCharacterDocumentV3({ ...source.characters[entity.characterDocumentId], pose: performance.pose, expression: performance.expression });
    if (!record(performance.expression) || !record(performance.expression.weights)
      || !Object.values(performance.expression.weights).every((weight) => typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= 1)) fail("표정 가중치가 올바르지 않습니다.");
    performances[entityId] = { pose: character.pose, expression: character.expression };
  }
  for (const entity of source.scene.entities) {
    if (entity.kind === "character" && !Object.hasOwn(performances, entity.id)) fail("캐릭터의 컷 연기 정보가 누락되었습니다.");
  }
  if (!Array.isArray(value.corrections) || value.corrections.length > 512) fail("보정 개수가 허용 범위를 벗어났습니다.");
  const corrections: StudioScene3dCutCorrection[] = value.corrections.map((entry: unknown) => {
    if (!record(entry) || !id(entry.id) || !id(entry.elementId) || (entry.status !== "current" && entry.status !== "needs-review")) fail("보정 참조가 올바르지 않습니다.");
    const common: Pick<StudioScene3dCutCorrection, "id" | "elementId" | "status"> = { id: entry.id, elementId: entry.elementId, status: entry.status };
    if (entry.kind === "screen-space") return { ...common, kind: "screen-space" };
    if (entry.kind !== "surface-attached" || !id(entry.entityId) || !id(entry.topologyRevision) || !id(entry.surfaceId)) fail("표면 부착 참조가 올바르지 않습니다.");
    const entity = source.scene.entities.find((candidate) => candidate.id === entry.entityId);
    if ((!entity || entity.kind !== "character") && entry.status === "current") fail("표면 보정 대상이 없습니다.");
    if (entity?.kind === "character" && source.characters[entity.characterDocumentId].topology.revision !== entry.topologyRevision && entry.status === "current") fail("표면 보정의 원본 버전을 재검토해야 합니다.");
    if (entity?.kind === "character" && !source.characters[entity.characterDocumentId].topology.stableSurfaceIds.includes(entry.surfaceId) && entry.status === "current") fail("원본에 없는 표면 보정은 다시 부착해야 합니다.");
    return { ...common, kind: "surface-attached", entityId: entry.entityId, topologyRevision: entry.topologyRevision, surfaceId: entry.surfaceId };
  });
  if (new Set(corrections.map((entry) => entry.id)).size !== corrections.length) fail("보정 식별자가 중복되었습니다.");
  if (value.status === "approved" && corrections.some((entry) => entry.status === "needs-review")) fail("보정 재검토를 마친 후 승인하세요.");
  const status = value.status;
  if (status !== "draft" && status !== "approved" && status !== "needs-review") fail("컷 상태가 올바르지 않습니다.");
  return owned({ id: value.id, name: value.name, revision: Number(value.revision), status, source, sourceHash: String(value.sourceHash), camera, performances, corrections });
}

export function validateStudioScene3dShotVersionCollection(value: unknown): StudioScene3dShotVersionCollection {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.cuts) || value.cuts.length > 128) fail("컷 모음이 올바르지 않습니다.");
  const cuts = value.cuts.map(parseCut);
  if (new Set(cuts.map((cut) => cut.id)).size !== cuts.length) fail("컷 식별자가 중복되었습니다.");
  return owned({ version: 1, cuts });
}

export function createStudioScene3dVersionedCut(input: StudioScene3dCutSource & {
  readonly id: string; readonly name: string; readonly corrections?: readonly StudioScene3dCutCorrection[];
}): StudioScene3dVersionedCut {
  const source = parseStudioScene3dCutSource(input);
  const camera = source.scene.cameras.find((entry) => entry.id === source.scene.activeCameraId);
  const performances = Object.fromEntries(source.scene.entities.flatMap((entity) => {
    if (entity.kind !== "character") return [];
    const character = source.characters[entity.characterDocumentId];
    return [[entity.id, { pose: character.pose, expression: character.expression }]];
  }));
  return parseCut({ id: input.id, name: input.name, revision: 0, status: "draft", source, sourceHash: hash(source), camera, performances, corrections: input.corrections ?? [] });
}

export function materializeStudioScene3dVersionedCut(input: StudioScene3dVersionedCut): {
  readonly scene: StudioScene3dDocumentV1;
  readonly charactersByEntityId: Readonly<Record<string, CharacterDocumentV3>>;
} {
  const cut = parseCut(input);
  const charactersByEntityId = Object.fromEntries(cut.source.scene.entities.flatMap((entity) => {
    if (entity.kind !== "character") return [];
    const character = cut.source.characters[entity.characterDocumentId];
    return [[entity.id, parseCharacterDocumentV3({ ...character, ...cut.performances[entity.id] })]];
  }));
  return owned({ scene: { ...cut.source.scene, cameras: [cut.camera], activeCameraId: cut.camera.id, shots: [] }, charactersByEntityId });
}

export function compareStudioScene3dCutSource(cut: StudioScene3dVersionedCut, input: StudioScene3dCutSource) {
  const current = parseCut(cut);
  const candidate = parseStudioScene3dCutSource(input);
  if (candidate.scene.documentId !== current.source.scene.documentId) fail("다른 장면의 원본으로 컷을 바꿀 수 없습니다.");
  const characterIds = new Set([...Object.keys(current.source.characters), ...Object.keys(candidate.characters)]);
  return owned({
    sceneChanged: hash(current.source.scene) !== hash(candidate.scene) || hash(current.source.legacyBg3d) !== hash(candidate.legacyBg3d),
    changedCharacterIds: [...characterIds].filter((key) => hash(current.source.characters[key]) !== hash(candidate.characters[key])).sort(),
    sourceHash: hash(candidate),
  });
}

export function editStudioScene3dCutPerformance(cut: StudioScene3dVersionedCut, input: {
  readonly camera?: StudioScene3dCamera;
  readonly performances?: Readonly<Record<string, StudioScene3dCutPerformance>>;
}): StudioScene3dVersionedCut {
  parseCut(cut);
  const camera = input.camera ?? cut.camera;
  const performances = { ...cut.performances, ...input.performances };
  if (hash(camera) === hash(cut.camera) && hash(performances) === hash(cut.performances)) return cut;
  return parseCut({ ...cut, camera, performances, revision: cut.revision + 1, status: "needs-review", corrections: cut.corrections.map((entry) => entry.kind === "screen-space" ? { ...entry, status: "needs-review" } : entry) });
}

export function updateStudioScene3dCutSource(cut: StudioScene3dVersionedCut, input: StudioScene3dCutSource, selection: {
  readonly scene: boolean; readonly characterIds: readonly string[];
}): StudioScene3dVersionedCut {
  compareStudioScene3dCutSource(cut, input);
  const candidate = parseStudioScene3dCutSource(input);
  const selected = new Set(selection.characterIds);
  for (const key of selected) if (!candidate.characters[key]) fail("선택한 캐릭터 원본이 없습니다.");
  if (selection.scene && candidate.scene.revision < cut.source.scene.revision) fail("장면 원본 버전을 되돌릴 수 없습니다.");
  for (const key of selected) {
    const previous = cut.source.characters[key];
    const next = candidate.characters[key];
    if (previous && (next.revision < previous.revision || (next.revision === previous.revision && hash(next) !== hash(previous)))) fail("캐릭터 원본 버전이 이전이거나 같은 버전에 다른 내용이 있습니다.");
  }
  const characters = { ...cut.source.characters };
  for (const key of selected) characters[key] = candidate.characters[key];
  const baseScene = selection.scene ? candidate.scene : cut.source.scene;
  const entities = baseScene.entities.map((entity) => {
    if (entity.kind !== "character") return entity;
    const character = characters[entity.characterDocumentId];
    if (!character) fail("새 캐릭터 원본도 함께 선택해야 합니다.");
    return { ...entity, characterRevision: character.revision };
  });
  const assets = baseScene.assets.map((asset) => {
    const references = entities.filter((entry) => entry.kind !== "primitive" && entry.assetId === asset.id);
    const required = references.map((entity) => {
      if (entity.kind !== "character") return asset;
      const owner = selected.has(entity.characterDocumentId) ? candidate.scene : cut.source.scene;
      const sourceEntity = owner.entities.find((entry) => entry.id === entity.id && entry.kind === "character" && entry.characterDocumentId === entity.characterDocumentId);
      const pinnedAsset = sourceEntity?.kind === "character" ? owner.assets.find((entry) => entry.id === sourceEntity.assetId) : undefined;
      if (!pinnedAsset) fail("캐릭터의 고정된 원본 asset을 찾지 못했습니다.");
      return { ...pinnedAsset, id: asset.id };
    });
    if (new Set(required.map(hash)).size > 1) fail("공유 asset의 버전 선택이 충돌합니다. 원본 asset을 분리하거나 같은 버전을 함께 선택하세요.");
    return required[0] ?? asset;
  });
  const source = parseStudioScene3dCutSource({ scene: { ...baseScene, entities, assets }, characters, legacyBg3d: selection.scene ? candidate.legacyBg3d : cut.source.legacyBg3d });
  if (hash(source) === cut.sourceHash) return cut;
  const performances = Object.fromEntries(entities.flatMap((entity) => {
    if (entity.kind !== "character") return [];
    const character = source.characters[entity.characterDocumentId];
    const previous = cut.source.scene.entities.find((entry) => entry.id === entity.id);
    const retained = previous?.kind === "character" && previous.characterDocumentId === entity.characterDocumentId
      ? cut.performances[entity.id] : undefined;
    return [[entity.id, retained ?? { pose: character.pose, expression: character.expression }]];
  }));
  return parseCut({ ...cut, source, sourceHash: hash(source), performances, revision: cut.revision + 1, status: "needs-review", corrections: cut.corrections.map((entry) => ({ ...entry, status: "needs-review" })) });
}

export function approveStudioScene3dVersionedCut(cut: StudioScene3dVersionedCut): StudioScene3dVersionedCut {
  return parseCut({ ...cut, revision: cut.revision + 1, status: "approved" });
}

/** 표면을 다시 부착한 결과 또는 화면 보정의 명시적 검토만 기록한다. 자동 재투영하지 않는다. */
export function reviewStudioScene3dCutCorrection(cut: StudioScene3dVersionedCut, correction: StudioScene3dCutCorrection): StudioScene3dVersionedCut {
  parseCut(cut);
  const previous = cut.corrections.find((entry) => entry.id === correction.id);
  if (!previous || previous.elementId !== correction.elementId || previous.kind !== correction.kind) fail("검토할 원본 보정을 찾지 못했습니다.");
  return parseCut({ ...cut, revision: cut.revision + 1, status: "needs-review", corrections: cut.corrections.map((entry) => entry.id === correction.id ? correction : entry) });
}
