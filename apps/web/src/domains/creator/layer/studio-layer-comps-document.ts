import { z } from "zod";

import { isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import type { PageState } from "../studio-page-state";
import { captureLayerComp, STUDIO_LAYER_COMPS_MAX_COUNT, updateLayerCompWithCurrentLayers, type StudioLayerComp } from "./studio-layer-comps";

const wireTextSchema = z.string().refine((value) => !value.includes("\0"));
const requiredTextSchema = wireTextSchema.min(1).max(160);

const layerStateSchema = z.object({
  layerId: requiredTextSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  blendMode: wireTextSchema.max(80).optional(),
  groupId: requiredTextSchema.optional(),
});

const compsSchema = z.array(z.object({
  id: requiredTextSchema,
  name: requiredTextSchema,
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  notes: wireTextSchema.max(8192).optional(),
  layerStates: z.record(requiredTextSchema, layerStateSchema).refine(
    (states) => Object.keys(states).length <= 10_000
      && Object.entries(states).every(([id, state]) => id === state.layerId),
  ),
  groupStates: z.record(requiredTextSchema, z.object({
    groupId: requiredTextSchema,
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

interface StudioLayerCompLeaseOptions {
  acquire: (elementIds: readonly string[] | null) => Promise<boolean>;
  synchronize: () => Promise<void>;
  release: () => void;
  reportError: (message: string) => void;
}

interface StudioLayerCompMetadataOptions extends StudioLayerCompLeaseOptions {
  /** Flush retained strokes before taking any capture or metadata snapshot. */
  prepare: () => boolean;
  getPage: () => PageState | null;
  canMutate: () => boolean;
  /** Use the actual page serializer, including all metadata and its UTF-8 wire budget. */
  validatePage: (page: PageState) => void;
  commit: (elements: PageState["elements"], patch: { layerComps: StudioLayerComp[] }, pageId: string) => boolean;
}

function prepareLayerCompPage(options: StudioLayerCompMetadataOptions): PageState | null {
  if (!options.canMutate() || !options.prepare() || !options.canMutate()) return null;
  return options.getPage();
}

function commitLayerCompMetadata(
  page: PageState,
  layerComps: StudioLayerComp[],
  options: StudioLayerCompMetadataOptions,
): boolean {
  try {
    options.validatePage({ ...page, layerComps });
  } catch {
    options.reportError("페이지의 콤프 저장 용량을 넘어 변경하지 않았어요. 콤프 개수나 캡처할 레이어를 줄이거나 페이지 메모를 정리해 주세요.");
    return false;
  }
  return options.commit(page.elements, { layerComps }, page.id);
}

/** Keep ownership through the fresh read and delivery of every accepted local mutation. */
async function withLayerCompLease(
  options: StudioLayerCompLeaseOptions,
  commit: () => boolean,
): Promise<boolean> {
  let acquired = false;
  let accepted = false;
  try {
    acquired = await options.acquire(null);
    if (!acquired) return false;
    await options.synchronize();
    accepted = commit();
    if (accepted) await options.synchronize();
    return accepted;
  } catch {
    // A delivery failure must not invite another capture of an already accepted local comp.
    options.reportError(accepted
      ? "콤프 변경은 이 기기에 반영됐지만 동기화를 완료하지 못했어요. 연결 상태를 확인해 주세요."
      : "레이어 콤프를 변경하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    return accepted;
  } finally {
    if (acquired) options.release();
  }
}

/** Serialize metadata replacement with peer edits, then read the page the lease protects. */
async function mutateLayerCompMetadata(
  options: StudioLayerCompMetadataOptions,
  nextComps: (current: PageState, prepared: PageState) => StudioLayerComp[] | null,
): Promise<boolean> {
  const page = prepareLayerCompPage(options);
  if (!page) return false;
  return withLayerCompLease(options, () => {
    const current = options.getPage();
    if (!options.canMutate() || current?.id !== page.id) {
      options.reportError("페이지나 편집 권한이 바뀌어 콤프를 변경하지 않았어요. 현재 페이지에서 다시 시도해 주세요.");
      return false;
    }
    const layerComps = nextComps(current, page);
    return layerComps !== null && commitLayerCompMetadata(current, layerComps, options);
  });
}

/** Capture/update from the latest leased page, including a just-finished retained stroke. */
export function captureStudioLayerCompTransaction(options: StudioLayerCompMetadataOptions & {
  name: string;
  compId?: string;
}): Promise<boolean> {
  return mutateLayerCompMetadata(options, (page) => {
    const comps = page.layerComps ?? [];
    const target = options.compId === undefined ? undefined : comps.find((comp) => comp.id === options.compId);
    if (options.compId !== undefined && !target) {
      options.reportError("이 콤프가 삭제되어 업데이트하지 않았어요. 현재 목록에서 다시 선택해 주세요.");
      return null;
    }
    if (!target && comps.length >= STUDIO_LAYER_COMPS_MAX_COUNT) {
      options.reportError("페이지마다 콤프를 64개까지 저장할 수 있어요.");
      return null;
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
    }
    return valid;
  });
}

/** Refuse stale whole-array replacements; the panel supplies the list its action was based on. */
export function changeStudioLayerCompsTransaction(options: StudioLayerCompMetadataOptions & {
  nextComps: readonly StudioLayerComp[];
  expectedComps?: readonly StudioLayerComp[];
}): Promise<boolean> {
  return mutateLayerCompMetadata(options, (current, prepared) => {
    const expected = options.expectedComps ?? prepared.layerComps ?? [];
    if (JSON.stringify(current.layerComps ?? []) !== JSON.stringify(expected)) {
      options.reportError("콤프 목록이 바뀌어 변경하지 않았어요. 현재 목록에서 다시 시도해 주세요.");
      return null;
    }
    const valid = parseStudioLayerComps(options.nextComps);
    if (!valid) options.reportError("레이어 콤프가 저장 범위를 벗어나 변경하지 않았어요.");
    return valid;
  });
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

export interface StudioLayerCompTransactionOptions extends StudioLayerCompLeaseOptions {
  comp: StudioLayerComp;
  getPage: () => PageState | null;
  canMutate: () => boolean;
  commit: (elements: PageState["elements"], patch: { groups?: LayerGroup[] }, pageId: string) => boolean;
}

/** Revalidate the captured page after authoritative peer ownership has been acquired. */
export async function applyStudioLayerCompTransaction({
  comp, getPage, canMutate, acquire, synchronize, release, commit, reportError,
}: StudioLayerCompTransactionOptions): Promise<boolean> {
  const page = getPage();
  if (!page || !canMutate()) return false;
  const selected = page.layerComps?.find((candidate) => candidate.id === comp.id);
  const selectedSnapshot = JSON.stringify(comp);
  if (!selected || JSON.stringify(selected) !== selectedSnapshot) {
    reportError("콤프가 변경되거나 삭제되어 적용하지 않았어요. 현재 목록에서 다시 선택해 주세요.");
    return false;
  }
  const plan = planStudioLayerCompApplication(page.elements, page.groups ?? [], selected);
  if (!plan.ok) {
    reportError(plan.reason);
    return false;
  }
  if (!plan.groupsChanged && plan.changedElementIds.length === 0) return true;
  // A page lease covers element/layer resources and folders without children as one edit.
  return withLayerCompLease({ acquire, synchronize, release, reportError }, () => {
    const current = getPage();
    if (!canMutate() || current?.id !== page.id
      || current.elements !== page.elements || current.groups !== page.groups
      || JSON.stringify(current.layerComps?.find((candidate) => candidate.id === comp.id)) !== selectedSnapshot) {
      reportError("페이지나 레이어 상태가 바뀌어 콤프를 적용하지 않았어요. 현재 상태에서 다시 적용해 주세요.");
      return false;
    }
    return commit(plan.elements, plan.groupsChanged ? { groups: plan.groups } : {}, page.id);
  });
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
