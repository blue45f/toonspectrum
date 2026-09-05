import { BRUSH_PRESETS, resolveStudioBrushRenderFamily } from "../studio-brush";
import { createStudioBuiltInBrushDefaultRestoreProfile } from "../brush/studio-brush-default-restore";
import { studioBrushDynamicsSettingsForBrushId } from "../brush/studio-brush-dynamics";
import { normalizeStudioBrushEngineProgramSet } from "../brush/studio-brush-engine-program-set";
import { mergeStudioBrushMixTraitSection } from "../brush/studio-brush-engine-mix";
import {
  BRUSH_EXPORT_KIND, BRUSH_EXPORT_VERSION, createBrush, DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  importBrushFromJson, sanitizeBrushSnapshot, writeBrushJson,
} from "../brush/studio-brush-library";
import { materializeStudioBrushCatalogSelection, studioCoreBrushCatalogSelection } from "../brush/studio-brush-selection";

import { resolveBrushLabTraits } from "./brush-lab-recipe";

import type { NormalizedStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics";
import type { StudioBrushSnapshot } from "../brush/studio-brush-library";
import type { StudioBrushCatalogSelection } from "../brush/studio-brush-selection";
import type { BrushLabRecipe } from "./brush-lab-recipe";

export interface BrushLabDocument {
  readonly carrierId: string;
  readonly name: string;
  readonly snapshot: StudioBrushSnapshot;
}
export const BRUSH_LAB_MAX_IMPORT_BYTES = 1024 * 1024;

export function brushLabDocumentFromSelection(selection: StudioBrushCatalogSelection, previous = DEFAULT_STUDIO_BRUSH_SNAPSHOT): BrushLabDocument {
  if (selection.operation !== "paint") throw new Error("지우개는 브러시 제작 소스로 선택할 수 없습니다.");
  const profile = createStudioBuiltInBrushDefaultRestoreProfile(selection);
  const { snapshot } = sanitizeBrushSnapshot({
    ...previous, ...profile.values, brushId: selection.runtimeBrushId,
    color: previous.color, sourcePresetId: selection.catalogId, sourcePresetName: selection.catalogName,
    // A new carrier must never inherit a different carrier's override programs.
    enginePrograms: null,
  });
  return { carrierId: selection.catalogId, name: selection.catalogName, snapshot };
}

export function createInitialBrushLabDocument(): BrushLabDocument {
  const preset = BRUSH_PRESETS.find((item) => item.id === "ink-particle" && item.operation === "paint")
    ?? BRUSH_PRESETS.find((item) => item.operation === "paint" && studioBrushDynamicsSettingsForBrushId(item.id) !== null);
  if (!preset) throw new Error("기본 잉크 입자 캐리어를 찾을 수 없습니다.");
  return brushLabDocumentFromSelection(studioCoreBrushCatalogSelection(preset));
}

export function canComposeBrushLabTraits(document: BrushLabDocument): boolean {
  return studioBrushDynamicsSettingsForBrushId(document.snapshot.brushId) !== null;
}

export async function compileBrushLabRecipe(recipe: BrushLabRecipe, document: BrushLabDocument): Promise<BrushLabDocument> {
  if (recipe.carrierId !== document.carrierId) throw new Error("캐리어가 변경되었습니다. 현재 브러시에서 레시피를 다시 구성하세요.");
  if (!canComposeBrushLabTraits(document)) throw new Error("이 캐리어는 입자 속성 조합을 지원하지 않습니다. 해당 매체의 프로그램 또는 고급 편집기를 사용하세요.");
  const brushDynamics = await resolveBrushLabTraits<NormalizedStudioBrushDynamicsSettings>(
    recipe, document.snapshot.brushDynamics,
    async (id) => {
      const source = await materializeStudioBrushCatalogSelection(id);
      return source?.operation === "paint" ? source.brushDynamics : null;
    },
    mergeStudioBrushMixTraitSection,
  );
  return { ...document, snapshot: { ...document.snapshot, brushDynamics } };
}

/** Compare normalized data, not donor names. Distinct snapshots still need visual review. */
export function brushLabSnapshotKey(document: BrushLabDocument): string {
  return JSON.stringify(sanitizeBrushSnapshot(document.snapshot).snapshot);
}

/**
 * Native v6-compatible file with the physical-program field explicitly preserved.
 * The shared v6 writer currently omits enginePrograms; do not lose it when moving a Lab brush.
 * The normal importer already consumes this additive field through sanitizeBrushSnapshot.
 */
export function writeBrushLabJson(document: BrushLabDocument): string {
  const brush = createBrush(document.name, document.snapshot);
  const payload = JSON.parse(writeBrushJson(brush)) as Record<string, unknown>;
  return JSON.stringify({ ...payload, enginePrograms: brush.enginePrograms }, null, 2);
}

export function readBrushLabJson(text: string): { document: BrushLabDocument; adjustedFields: string[] } {
  if (text.length > BRUSH_LAB_MAX_IMPORT_BYTES || new TextEncoder().encode(text).byteLength > BRUSH_LAB_MAX_IMPORT_BYTES) {
    throw new Error("브러시 파일은 1MB 이하만 가져올 수 있습니다.");
  }
  const payload: unknown = JSON.parse(text);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("브러시 파일이 올바르지 않습니다.");
  const record = payload as Record<string, unknown>;
  if (record.kind !== BRUSH_EXPORT_KIND) throw new Error("ToonStudio 브러시 JSON 파일을 선택하세요.");
  if (record.version !== undefined && (typeof record.version !== "number" || !Number.isInteger(record.version) || record.version < 1 || record.version > BRUSH_EXPORT_VERSION)) {
    throw new Error("지원하지 않는 브러시 파일 버전입니다. 원본 파일은 변경되지 않았습니다.");
  }
  if (record.enginePrograms != null && normalizeStudioBrushEngineProgramSet(record.enginePrograms) === null) {
    throw new Error("지원하지 않는 엔진 프로그램 형식입니다. 기본 조합으로 자동 대체하지 않습니다.");
  }
  const imported = importBrushFromJson(text);
  if (imported.adjustedFields.includes("brushId")) throw new Error("알 수 없는 캐리어를 다른 브러시로 자동 대체하지 않습니다.");
  const preset = BRUSH_PRESETS.find((item) => item.id === imported.brush.brushId);
  if (!preset || preset.operation !== "paint") throw new Error("지원하는 페인트 캐리어가 아닙니다.");
  const snapshot = sanitizeBrushSnapshot(imported.brush).snapshot;
  const family = resolveStudioBrushRenderFamily(snapshot.brushId);
  const programs = snapshot.enginePrograms;
  if ((programs?.oil && family !== "oil") || (programs?.watercolor && family !== "watercolor")) {
    throw new Error("브러시 캐리어와 엔진 프로그램 계열이 다릅니다.");
  }
  if (programs?.watercolor?.wetEdgeBloomProgramId && programs.watercolor.livingInkBakeProgramId) {
    throw new Error("수채 블룸과 정착 베이크는 동시에 적용할 수 없습니다.");
  }
  if (record.enginePrograms != null && JSON.stringify(record.enginePrograms) !== JSON.stringify(programs)) {
    imported.adjustedFields.push("enginePrograms");
  }
  // Import a flattened snapshot, not a stale source catalogue reference.
  return { document: { carrierId: snapshot.brushId, name: imported.brush.name.slice(0, 120), snapshot }, adjustedFields: imported.adjustedFields };
}
