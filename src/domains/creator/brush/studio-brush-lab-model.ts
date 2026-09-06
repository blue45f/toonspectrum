import { BRUSH_PRESETS, resolveStudioBrushRenderFamily } from "../studio-brush";

import { createStudioBuiltInBrushDefaultRestoreProfile } from "./studio-brush-default-restore";
import { mergeStudioBrushMixTraitSection } from "./studio-brush-engine-mix";
import { composeBrushLabRecipe, type BrushLabRecipe } from "./studio-brush-lab-transaction";
import {
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  sanitizeBrushSnapshot,
  type StudioBrushSnapshot,
} from "./studio-brush-library";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";
import {
  materializeStudioBrushCatalogSelection,
  studioCoreBrushCatalogSelection,
  type StudioBrushCatalogSelection,
} from "./studio-brush-selection";

/** Conservative product capability boundary, not a claim that every carrier consumes every trait. */
export function brushLabCanCompose(snapshot: StudioBrushSnapshot): boolean {
  const family = resolveStudioBrushRenderFamily(snapshot.brushId);
  return family === "ink-particle" || family === "airbrush" || family === "dry-media";
}

export interface BrushLabSource {
  readonly id: string;
  readonly name: string;
  readonly mediaGroup: string;
  readonly selection: StudioBrushCatalogSelection;
}

export type BrushLabSnapshotComposition =
  | { readonly ok: true; readonly snapshot: StudioBrushSnapshot }
  | {
      readonly ok: false;
      readonly reason: "incompatible-carrier" | "invalid-recipe" | "missing-source" | "load-failed" | "cancelled";
      readonly sourceIds?: readonly string[];
    };

export async function loadBrushLabSources(): Promise<{
  readonly sources: readonly BrushLabSource[];
  readonly unavailable: number;
}> {
  const catalog = await import("./studio-brush-catalog");
  const listed = catalog.STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.filter(
    (item) => !isStudioBrushQuarantinedPresetId(item.id),
  );
  const results = await Promise.all(listed.map(async (item): Promise<BrushLabSource | null> => {
    try {
      const selection = await materializeStudioBrushCatalogSelection(item.id);
      return selection?.operation === "paint"
        ? { id: item.id, name: item.name, mediaGroup: item.mediaGroup, selection }
        : null;
    } catch {
      return null;
    }
  }));
  const unique = new Map<string, BrushLabSource>();
  for (const result of results) if (result) unique.set(result.id, result);
  return { sources: [...unique.values()], unavailable: results.filter((result) => !result).length };
}

export function brushLabSnapshotFromSource(
  current: StudioBrushSnapshot,
  selection: StudioBrushCatalogSelection,
): StudioBrushSnapshot {
  if (selection.operation !== "paint" || isStudioBrushQuarantinedPresetId(selection.catalogId)) {
    throw new Error("선택할 수 없는 브러시입니다.");
  }
  return sanitizeBrushSnapshot({
    ...current,
    ...createStudioBuiltInBrushDefaultRestoreProfile(selection).values,
    brushId: selection.runtimeBrushId,
    sourcePresetId: selection.catalogId,
    sourcePresetName: selection.catalogName,
  }).snapshot;
}

export async function composeBrushLabSnapshot(
  snapshot: StudioBrushSnapshot,
  recipe: BrushLabRecipe,
  sources: readonly BrushLabSource[],
  isCurrent: () => boolean,
): Promise<BrushLabSnapshotComposition> {
  if (!brushLabCanCompose(snapshot)) {
    return { ok: false, reason: "incompatible-carrier" };
  }
  const byId = new Map(sources.map((source) => [source.id, source]));
  const result = await composeBrushLabRecipe(snapshot.brushDynamics, recipe, {
    load: async (id) => byId.get(id)?.selection.brushDynamics ?? null,
    merge: mergeStudioBrushMixTraitSection,
  }, isCurrent);
  return result.ok
    ? { ok: true, snapshot: sanitizeBrushSnapshot({ ...snapshot, brushDynamics: result.value }).snapshot }
    : result;
}

function emptyBrushLabDraft(): StudioBrushSnapshot {
  const preset = BRUSH_PRESETS.find((candidate) => candidate.id === "ink-particle");
  return preset
    ? brushLabSnapshotFromSource(DEFAULT_STUDIO_BRUSH_SNAPSHOT, studioCoreBrushCatalogSelection(preset))
    : DEFAULT_STUDIO_BRUSH_SNAPSHOT;
}

const DRAFT_KIND = "toonstudio-brush-lab-draft";
const DRAFT_MAX_CHARS = 1024 * 1024;

/** Only an editing draft, never a second saved-brush library. */
export function readBrushLabDraft(raw: string | null): StudioBrushSnapshot {
  if (!raw || raw.length > DRAFT_MAX_CHARS) return emptyBrushLabDraft();
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!envelope || typeof envelope !== "object") return emptyBrushLabDraft();
    const value = envelope as Record<string, unknown>;
    if (value.kind !== DRAFT_KIND || value.version !== 1) return emptyBrushLabDraft();
    const { snapshot, adjustedFields } = sanitizeBrushSnapshot(value.snapshot);
    if (adjustedFields.includes("brushId") || isStudioBrushQuarantinedPresetId(snapshot.sourcePresetId ?? snapshot.brushId)) {
      return emptyBrushLabDraft();
    }
    return snapshot;
  } catch {
    return emptyBrushLabDraft();
  }
}

export function writeBrushLabDraft(snapshot: StudioBrushSnapshot): string | null {
  const result = JSON.stringify({ kind: DRAFT_KIND, version: 1, snapshot });
  return result.length <= DRAFT_MAX_CHARS ? result : null;
}
