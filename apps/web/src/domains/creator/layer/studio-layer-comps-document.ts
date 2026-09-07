import { z } from "zod";

import { isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import type { PageState } from "../studio-page-state";
import { captureLayerComp, updateLayerCompWithCurrentLayers, type StudioLayerComp } from "./studio-layer-comps";

export const STUDIO_LAYER_COMPS_MAX_COUNT = 64;

const layerStateSchema = z.object({
  layerId: z.string().min(1).max(160),
  visible: z.boolean(),
  opacity: z.number().finite().min(0).max(1),
  blendMode: z.string().max(80).optional(),
  groupId: z.string().min(1).max(160).optional(),
});

const compsSchema = z.array(z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  notes: z.string().max(8192).optional(),
  layerStates: z.record(z.string().min(1).max(160), layerStateSchema).refine(
    (states) => Object.keys(states).length <= 10_000
      && Object.entries(states).every(([id, state]) => id === state.layerId),
  ),
  groupStates: z.record(z.string().min(1).max(160), z.object({
    groupId: z.string().min(1).max(160),
    visible: z.boolean(),
  })).refine((states) => Object.keys(states).length <= 10_000
    && Object.entries(states).every(([id, state]) => id === state.groupId)).optional(),
})).max(STUDIO_LAYER_COMPS_MAX_COUNT).refine(
  (comps) => new Set(comps.map((comp) => comp.id)).size === comps.length,
);

/** Page-owned presets travel in the project document, like grade and review metadata. */
export function parseStudioLayerComps(value: unknown): StudioLayerComp[] | null {
  const parsed = compsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

interface StudioLayerCompMetadataOptions {
  /** Flush retained strokes before taking any capture or metadata snapshot. */
  prepare: () => boolean;
  getPage: () => PageState | null;
  canMutate: () => boolean;
  commit: (elements: PageState["elements"], patch: { layerComps: StudioLayerComp[] }, pageId: string) => boolean;
  reportError: (message: string) => void;
}

function prepareLayerCompPage(options: StudioLayerCompMetadataOptions): PageState | null {
  if (!options.canMutate() || !options.prepare() || !options.canMutate()) return null;
  return options.getPage();
}

/** Capture/update from the latest committed page, including a just-finished retained stroke. */
export function captureStudioLayerCompTransaction(options: StudioLayerCompMetadataOptions & {
  name: string;
  compId?: string;
}): boolean {
  const page = prepareLayerCompPage(options);
  if (!page) return false;
  const comps = page.layerComps ?? [];
  const target = options.compId === undefined ? undefined : comps.find((comp) => comp.id === options.compId);
  if (options.compId !== undefined && !target) {
    options.reportError("이 콤프가 삭제되어 업데이트하지 않았어요. 현재 목록에서 다시 선택해 주세요.");
    return false;
  }
  if (!target && comps.length >= STUDIO_LAYER_COMPS_MAX_COUNT) {
    options.reportError("페이지마다 콤프를 64개까지 저장할 수 있어요.");
    return false;
  }
  const layers = page.elements.map((element) => ({
    id: element.id,
    visible: !element.hidden,
    opacity: element.opacity ?? 1,
    blendMode: element.blendMode ?? "source-over",
    groupId: element.groupId,
  }));
  const captured = target
    ? updateLayerCompWithCurrentLayers(target, layers, page.groups ?? [])
    : captureLayerComp(options.name, layers, undefined, Date.now(), page.groups ?? []);
  const next = target
    ? comps.map((comp) => comp.id === target.id ? captured : comp)
    : [...comps, captured];
  const valid = parseStudioLayerComps(next);
  if (!valid) {
    options.reportError("콤프 이름이나 레이어 상태가 저장 범위를 벗어났어요. 현재 상태를 확인해 주세요.");
    return false;
  }
  return options.commit(page.elements, { layerComps: valid }, page.id);
}

/** Rename/delete changes metadata while retaining elements advanced by the preparation flush. */
export function changeStudioLayerCompsTransaction(options: StudioLayerCompMetadataOptions & {
  nextComps: readonly StudioLayerComp[];
}): boolean {
  const page = prepareLayerCompPage(options);
  if (!page) return false;
  const valid = parseStudioLayerComps(options.nextComps);
  if (!valid) {
    options.reportError("레이어 콤프가 저장 범위를 벗어나 변경하지 않았어요.");
    return false;
  }
  return options.commit(page.elements, { layerComps: valid }, page.id);
}

/** Value projection only. Document changes use the lock-aware transaction below. */
export function applyStudioElementLayerComp<T extends { id: string; hidden?: boolean; opacity?: number; blendMode?: string }>(
  elements: readonly T[],
  comp: StudioLayerComp,
): T[] {
  return elements.map((element) => {
    const state = Object.hasOwn(comp.layerStates, element.id) ? comp.layerStates[element.id] : undefined;
    if (!state) return element;
    const blendMode = state.blendMode ?? element.blendMode;
    if (Boolean(element.hidden) === !state.visible
      && (element.opacity ?? 1) === state.opacity
      && (element.blendMode ?? "source-over") === (blendMode ?? "source-over")) return element;
    return {
      ...element,
      hidden: !state.visible,
      opacity: state.opacity,
      ...(state.blendMode === undefined ? {} : { blendMode: state.blendMode }),
    };
  });
}

interface LayerCompElement {
  id: string;
  hidden?: boolean;
  opacity?: number;
  blendMode?: string;
  locked?: boolean;
  groupId?: string;
}

/** Plan the whole appearance change before taking a lease or committing any part of it. */
export function planStudioLayerCompApplication<T extends LayerCompElement>(
  elements: T[],
  groups: LayerGroup[],
  comp: StudioLayerComp,
): { ok: false; reason: string } | {
  ok: true;
  elements: T[];
  groups: LayerGroup[];
  changedElementIds: string[];
  groupsChanged: boolean;
} {
  const nextElements = applyStudioElementLayerComp(elements, comp);
  const changedElementIds = elements.flatMap((element, index) =>
    nextElements[index] === element ? [] : [element.id]);
  const changedGroups = new Set<string>();
  const nextGroups = groups.map((group) => {
    const saved = comp.groupStates && Object.hasOwn(comp.groupStates, group.id)
      ? comp.groupStates[group.id] : undefined;
    if (!saved || Boolean(group.hidden) === !saved.visible) return group;
    changedGroups.add(group.id);
    return { ...group, hidden: !saved.visible };
  });
  const changedIds = new Set(changedElementIds);
  const changesLockedLayer = elements.some((element) =>
    (changedIds.has(element.id) || (element.groupId !== undefined && changedGroups.has(element.groupId)))
      && isEffectivelyLocked(element, groups));
  if (changesLockedLayer || groups.some((group) => group.locked && changedGroups.has(group.id))) {
    return { ok: false, reason: "이 콤프가 변경하는 레이어나 그룹이 잠겨 있어요. 잠금을 해제한 뒤 적용해 주세요." };
  }
  return {
    ok: true,
    elements: changedElementIds.length === 0 ? elements : nextElements,
    groups: changedGroups.size === 0 ? groups : nextGroups,
    changedElementIds,
    groupsChanged: changedGroups.size > 0,
  };
}

export interface StudioLayerCompTransactionOptions {
  comp: StudioLayerComp;
  getPage: () => PageState | null;
  canMutate: () => boolean;
  acquire: (elementIds: readonly string[] | null) => Promise<boolean>;
  release: () => void;
  commit: (elements: PageState["elements"], patch: { groups?: LayerGroup[] }, pageId: string) => boolean;
  reportError: (message: string) => void;
}

/** Revalidate the captured page after authoritative peer ownership has been acquired. */
export async function applyStudioLayerCompTransaction({
  comp, getPage, canMutate, acquire, release, commit, reportError,
}: StudioLayerCompTransactionOptions): Promise<boolean> {
  const page = getPage();
  if (!page || !canMutate()) return false;
  const plan = planStudioLayerCompApplication(page.elements, page.groups ?? [], comp);
  if (!plan.ok) {
    reportError(plan.reason);
    return false;
  }
  if (!plan.groupsChanged && plan.changedElementIds.length === 0) return true;
  let acquired = false;
  try {
    // A comp is a page appearance transaction. A page lease covers both element and layer
    // resources, which have independent IDs, as well as folders without children.
    acquired = await acquire(null);
    if (!acquired) return false;
    const current = getPage();
    if (!canMutate() || !current || current.id !== page.id
      || current.elements !== page.elements || current.groups !== page.groups) {
      reportError("페이지나 레이어 상태가 바뀌어 콤프를 적용하지 않았어요. 현재 상태에서 다시 적용해 주세요.");
      return false;
    }
    return commit(plan.elements, plan.groupsChanged ? { groups: plan.groups } : {}, page.id);
  } catch {
    reportError("레이어 콤프를 적용하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    return false;
  } finally {
    if (acquired) release();
  }
}

/** A copied page must address its new layers, never the source page's element IDs. */
export function remapStudioLayerComps(
  value: unknown,
  elementIds: ReadonlyMap<string, string>,
): StudioLayerComp[] | null {
  const comps = parseStudioLayerComps(value);
  return comps?.map((comp) => ({
    ...comp,
    layerStates: Object.fromEntries(Object.entries(comp.layerStates).flatMap(([id, state]) => {
      const nextId = elementIds.get(id);
      return nextId ? [[nextId, { ...state, layerId: nextId }]] : [];
    })),
  })) ?? null;
}
