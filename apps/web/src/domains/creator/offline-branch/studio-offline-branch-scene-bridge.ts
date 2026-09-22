import {
  studioCrdtElementToSceneElement,
  studioCrdtGroupToLayerGroup,
  studioCrdtStrokeToDrawElement,
  studioElementToCrdtSceneElement,
  studioLayerGroupToCrdtGroup,
} from "../live/studio-crdt-page-bridge";
import { studioDrawElementToCrdtStroke } from "../live/studio-crdt-draw-bridge";
import {
  decodeStudioOfflineBranchPayload,
  encodeStudioOfflineBranchPayload,
  fingerprintStudioOfflineBranchValue,
  stableStudioOfflineBranchJson,
  type StudioOfflineBranchCanonicalInput,
} from "./studio-offline-branch-payload";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type {
  StudioCrdtLayerGroupInput,
  StudioCrdtLayerGroupRecord,
  StudioCrdtSceneElementInput,
  StudioCrdtSceneElementRecord,
  StudioCrdtStrokeInput,
  StudioCrdtStrokeRecord,
} from "../live/studio-crdt-document-types";
import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { PageState } from "../studio-page-state";
import type {
  StudioOfflineBranchOperation,
  StudioOfflineBranchTargetType,
} from "./studio-offline-branch-contract";

export interface StudioOfflinePreparedMutation {
  readonly targetType: StudioOfflineBranchTargetType;
  readonly action: "upsert" | "delete";
  readonly targetId: string;
  readonly pageId: string;
  readonly layerId: string | null;
  readonly beforeId: string | null;
  readonly previousBeforeId: string | null;
  readonly expectedFingerprint: string | null;
  readonly resultFingerprint: string | null;
  readonly dedupeKey: string;
  readonly payload: Uint8Array | null;
  readonly previousPayload: Uint8Array | null;
}

export interface StudioOfflineSceneTransitionPlan {
  readonly mutations: readonly StudioOfflinePreparedMutation[];
  readonly unsupported: readonly string[];
}

function canonicalElementInput(pageId: string, element: El): {
  targetType: "stroke" | "scene-element";
  value: StudioCrdtStrokeInput | StudioCrdtSceneElementInput;
} {
  if (element.type === "draw") {
    return { targetType: "stroke", value: studioDrawElementToCrdtStroke(pageId, element) };
  }
  const value = studioElementToCrdtSceneElement(pageId, element);
  if (value.payload.type === "reference") {
    throw new Error("에셋 참조 요소는 서버 정본 연결 후 수정해 주세요.");
  }
  return { targetType: "scene-element", value };
}

function nextElementId(
  elements: readonly El[],
  index: number,
  targetType: "stroke" | "scene-element",
): string | null {
  for (let next = index + 1; next < elements.length; next += 1) {
    const candidate = elements[next]!;
    if ((candidate.type === "draw") === (targetType === "stroke")) return candidate.id;
  }
  return null;
}

function stateFingerprint(
  value: StudioOfflineBranchCanonicalInput,
  beforeId: string | null,
): string {
  return fingerprintStudioOfflineBranchValue({ value, beforeId });
}

function dedupeKey(value: unknown): string {
  return `opkey-${fingerprintStudioOfflineBranchValue(value).slice("fp1:".length)}`;
}

function preparedUpsert(
  targetType: StudioOfflineBranchTargetType,
  value: StudioOfflineBranchCanonicalInput,
  previous: StudioOfflineBranchCanonicalInput | null,
  beforeId: string | null,
  previousBeforeId: string | null,
): StudioOfflinePreparedMutation | null {
  const expectedFingerprint = previous
    ? stateFingerprint(previous, previousBeforeId)
    : null;
  const resultFingerprint = stateFingerprint(value, beforeId);
  if (expectedFingerprint === resultFingerprint) return null;
  const payload = encodeStudioOfflineBranchPayload(targetType, value);
  const previousPayload = previous
    ? encodeStudioOfflineBranchPayload(targetType, previous)
    : null;
  const layerId = "layerId" in value ? value.layerId : null;
  const identity = {
    targetType,
    action: "upsert" as const,
    targetId: value.id,
    pageId: value.pageId,
    layerId,
    beforeId,
    previousBeforeId,
    expectedFingerprint,
    resultFingerprint,
  };
  return {
    ...identity,
    dedupeKey: dedupeKey(identity),
    payload,
    previousPayload,
  };
}

function preparedDelete(
  targetType: StudioOfflineBranchTargetType,
  value: StudioOfflineBranchCanonicalInput,
  previousBeforeId: string | null,
): StudioOfflinePreparedMutation {
  const layerId = "layerId" in value ? value.layerId : null;
  const expectedFingerprint = stateFingerprint(value, previousBeforeId);
  const identity = {
    targetType,
    action: "delete" as const,
    targetId: value.id,
    pageId: value.pageId,
    layerId,
    beforeId: null,
    previousBeforeId,
    expectedFingerprint,
    resultFingerprint: null,
  };
  return {
    ...identity,
    dedupeKey: dedupeKey(identity),
    payload: null,
    previousPayload: encodeStudioOfflineBranchPayload(targetType, value),
  };
}

function planElementMutations(
  previous: PageState,
  next: PageState,
  blockedIds: ReadonlySet<string>,
  unsupported: string[],
): StudioOfflinePreparedMutation[] {
  const mutations: StudioOfflinePreparedMutation[] = [];
  const previousById = new Map(previous.elements.map((element) => [element.id, element]));
  const nextById = new Map(next.elements.map((element) => [element.id, element]));
  const previousIndexById = new Map(previous.elements.map((element, index) => [element.id, index]));

  for (let index = 0; index < next.elements.length; index += 1) {
    const element = next.elements[index]!;
    if (blockedIds.has(element.id)) continue;
    try {
      const encoded = canonicalElementInput(next.id, element);
      const beforeId = nextElementId(next.elements, index, encoded.targetType);
      const previousElement = previousById.get(element.id);
      const previousEncoded = previousElement
        ? canonicalElementInput(previous.id, previousElement)
        : null;
      if (previousEncoded && previousEncoded.targetType !== encoded.targetType) {
        unsupported.push(`${element.id}: 요소 종류 변경은 온라인 정본 연결이 필요합니다.`);
        continue;
      }
      const previousIndex = previousIndexById.get(element.id);
      const previousBeforeId = previousIndex === undefined || !previousEncoded
        ? null
        : nextElementId(previous.elements, previousIndex, previousEncoded.targetType);
      const mutation = preparedUpsert(
        encoded.targetType,
        encoded.value,
        previousEncoded?.value ?? null,
        beforeId,
        previousBeforeId,
      );
      if (mutation) mutations.push(mutation);
    } catch (cause) {
      unsupported.push(
        `${element.id}: ${cause instanceof Error ? cause.message : "오프라인 제안으로 변환하지 못했습니다."}`,
      );
    }
  }

  for (let index = 0; index < previous.elements.length; index += 1) {
    const element = previous.elements[index]!;
    if (nextById.has(element.id) || blockedIds.has(element.id)) continue;
    try {
      const encoded = canonicalElementInput(previous.id, element);
      mutations.push(preparedDelete(
        encoded.targetType,
        encoded.value,
        nextElementId(previous.elements, index, encoded.targetType),
      ));
    } catch (cause) {
      unsupported.push(
        `${element.id}: ${cause instanceof Error ? cause.message : "오프라인 삭제 제안을 만들지 못했습니다."}`,
      );
    }
  }
  return mutations;
}

function planGroupMutations(
  previous: PageState,
  next: PageState,
  unsupported: string[],
): StudioOfflinePreparedMutation[] {
  const mutations: StudioOfflinePreparedMutation[] = [];
  const previousGroups = previous.groups ?? [];
  const nextGroups = next.groups ?? [];
  const previousById = new Map(previousGroups.map((group) => [group.id, group]));
  const nextById = new Map(nextGroups.map((group) => [group.id, group]));
  const previousCommonOrder = previousGroups
    .map((group) => group.id)
    .filter((id) => nextById.has(id));
  const nextCommonOrder = nextGroups
    .map((group) => group.id)
    .filter((id) => previousById.has(id));
  if (stableStudioOfflineBranchJson(previousCommonOrder)
    !== stableStudioOfflineBranchJson(nextCommonOrder)) {
    unsupported.push(`${next.id}: 레이어 그룹 순서 변경은 온라인 정본 연결이 필요합니다.`);
  }

  for (const group of nextGroups) {
    const value = studioLayerGroupToCrdtGroup(next.id, group);
    const previousGroup = previousById.get(group.id);
    const previousValue = previousGroup
      ? studioLayerGroupToCrdtGroup(previous.id, previousGroup)
      : null;
    const mutation = preparedUpsert("layer-group", value, previousValue, null, null);
    if (mutation) mutations.push(mutation);
  }
  for (const group of previousGroups) {
    if (nextById.has(group.id)) continue;
    mutations.push(preparedDelete(
      "layer-group",
      studioLayerGroupToCrdtGroup(previous.id, group),
      null,
    ));
  }
  return mutations;
}

function crossPageElementIds(
  previousPages: readonly PageState[],
  nextPages: readonly PageState[],
): Set<string> {
  const previousPageByElementId = new Map<string, string>();
  for (const page of previousPages) {
    for (const element of page.elements) previousPageByElementId.set(element.id, page.id);
  }
  const moved = new Set<string>();
  for (const page of nextPages) {
    for (const element of page.elements) {
      const previousPageId = previousPageByElementId.get(element.id);
      if (previousPageId && previousPageId !== page.id) moved.add(element.id);
    }
  }
  return moved;
}

export function planStudioOfflineSceneTransition(
  previousPages: readonly PageState[],
  nextPages: readonly PageState[],
): StudioOfflineSceneTransitionPlan {
  const previousById = new Map(previousPages.map((page) => [page.id, page]));
  const unsupported: string[] = [];
  const mutations: StudioOfflinePreparedMutation[] = [];
  const movedIds = crossPageElementIds(previousPages, nextPages);
  const previousPageOrder = previousPages.map((page) => page.id);
  const nextPageOrder = nextPages.map((page) => page.id);
  if (
    previousPageOrder.length === nextPageOrder.length
    && previousPageOrder.every((id) => nextPageOrder.includes(id))
    && stableStudioOfflineBranchJson(previousPageOrder)
      !== stableStudioOfflineBranchJson(nextPageOrder)
  ) {
    unsupported.push("페이지 순서 변경은 온라인 정본 연결이 필요합니다.");
  }
  for (const id of movedIds) {
    unsupported.push(`${id}: 페이지 간 요소 이동은 온라인 정본 연결이 필요합니다.`);
  }

  for (const page of nextPages) {
    const previous = previousById.get(page.id);
    if (!previous) {
      unsupported.push(`${page.id}: 새 페이지는 온라인 정본 연결 후 추가해 주세요.`);
      continue;
    }
    if (
      stableStudioOfflineBranchJson({
        bg: previous.bg,
        bgGrad: previous.bgGrad,
        canvasH: previous.canvasH,
      }) !== stableStudioOfflineBranchJson({
        bg: page.bg,
        bgGrad: page.bgGrad,
        canvasH: page.canvasH,
      })
    ) {
      unsupported.push(`${page.id}: 페이지 배경·크기 변경은 온라인 정본 연결이 필요합니다.`);
    }
    mutations.push(...planElementMutations(previous, page, movedIds, unsupported));
    mutations.push(...planGroupMutations(previous, page, unsupported));
  }
  for (const page of previousPages) {
    if (!nextPages.some((candidate) => candidate.id === page.id)) {
      unsupported.push(`${page.id}: 페이지 삭제는 온라인 정본 연결이 필요합니다.`);
    }
  }
  return { mutations, unsupported };
}

function clonePages(pages: readonly PageState[]): PageState[] {
  return pages.map((page) => ({
    ...page,
    elements: [...page.elements],
    ...(page.groups ? { groups: [...page.groups] } : {}),
  }));
}

function replaceOrInsert<T extends { id: string }>(
  values: readonly T[],
  value: T,
  beforeId: string | null,
): T[] {
  const next = [...values];
  const existingIndex = next.findIndex((candidate) => candidate.id === value.id);
  if (existingIndex >= 0) next.splice(existingIndex, 1);
  const beforeIndex = beforeId
    ? next.findIndex((candidate) => candidate.id === beforeId)
    : -1;
  next.splice(beforeIndex >= 0 ? beforeIndex : next.length, 0, value);
  return next;
}

function recordForPayload(
  operation: StudioOfflineBranchOperation,
  payload: StudioOfflineBranchCanonicalInput,
): StudioCrdtStrokeRecord | StudioCrdtSceneElementRecord | StudioCrdtLayerGroupRecord {
  if (operation.targetType === "stroke") {
    return {
      ...(payload as StudioCrdtStrokeInput),
      status: "finalized",
      deleted: false,
      orderIndex: 0,
    };
  }
  if (operation.targetType === "scene-element") {
    return {
      ...(payload as StudioCrdtSceneElementInput),
      deleted: false,
      orderIndex: 0,
    };
  }
  return { ...(payload as StudioCrdtLayerGroupInput), deleted: false };
}

function materializePayload(
  page: PageState,
  operation: StudioOfflineBranchOperation,
  payloadBytes: Uint8Array,
  beforeId: string | null,
): void {
  const envelope = decodeStudioOfflineBranchPayload(payloadBytes, operation.targetType);
  const record = recordForPayload(operation, envelope.value);
  if (operation.targetType === "stroke") {
    const element = studioCrdtStrokeToDrawElement(record as StudioCrdtStrokeRecord) as El;
    page.elements = replaceOrInsert(page.elements, element, beforeId);
    return;
  }
  if (operation.targetType === "scene-element") {
    const source = page.elements.find((element) => element.id === operation.targetId);
    const element = studioCrdtElementToSceneElement(
      record as StudioCrdtSceneElementRecord,
      source,
    ) as El;
    page.elements = replaceOrInsert(page.elements, element, beforeId);
    return;
  }
  const previous = (page.groups ?? []).find((group) => group.id === operation.targetId);
  const group = studioCrdtGroupToLayerGroup(
    record as StudioCrdtLayerGroupRecord,
    previous?.collapsed,
  ) as LayerGroup;
  page.groups = replaceOrInsert(page.groups ?? [], group, beforeId);
}

export function projectStudioOfflineBranchOperation(
  pages: readonly PageState[],
  operation: StudioOfflineBranchOperation,
  payloadBytes: Uint8Array | null,
): PageState[] {
  const next = clonePages(pages);
  const pageIndex = next.findIndex((page) => page.id === operation.pageId);
  if (pageIndex < 0) throw new Error("offline branch target page is missing");
  const page = next[pageIndex]!;
  if (operation.action === "delete") {
    if (operation.targetType === "layer-group") {
      page.groups = (page.groups ?? []).filter((group) => group.id !== operation.targetId);
    } else {
      page.elements = page.elements.filter((element) => element.id !== operation.targetId);
    }
    return next;
  }
  if (!payloadBytes) throw new Error("offline branch upsert payload is missing");
  materializePayload(page, operation, payloadBytes, operation.beforeId);
  return next;
}

export function revertStudioOfflineBranchOperation(
  pages: readonly PageState[],
  operation: StudioOfflineBranchOperation,
  previousPayloadBytes: Uint8Array | null,
): PageState[] {
  const next = clonePages(pages);
  const pageIndex = next.findIndex((page) => page.id === operation.pageId);
  if (pageIndex < 0) throw new Error("offline branch target page is missing");
  const page = next[pageIndex]!;
  if (operation.expectedFingerprint === null) {
    if (operation.targetType === "layer-group") {
      page.groups = (page.groups ?? []).filter((group) => group.id !== operation.targetId);
    } else {
      page.elements = page.elements.filter((element) => element.id !== operation.targetId);
    }
    return next;
  }
  if (!previousPayloadBytes) {
    throw new Error("offline branch previous payload is missing");
  }
  materializePayload(page, operation, previousPayloadBytes, operation.previousBeforeId);
  return next;
}

export function currentStudioOfflineBranchFingerprint(
  pages: readonly PageState[],
  operation: StudioOfflineBranchOperation,
): string | null {
  const page = pages.find((candidate) => candidate.id === operation.pageId);
  if (!page) return null;
  if (operation.targetType === "layer-group") {
    const group = (page.groups ?? []).find((candidate) => candidate.id === operation.targetId);
    return group
      ? stateFingerprint(studioLayerGroupToCrdtGroup(page.id, group), null)
      : null;
  }
  const index = page.elements.findIndex((candidate) => candidate.id === operation.targetId);
  if (index < 0) return null;
  const element = page.elements[index]!;
  try {
    const encoded = canonicalElementInput(page.id, element);
    if (encoded.targetType !== operation.targetType) return null;
    return stateFingerprint(
      encoded.value,
      nextElementId(page.elements, index, encoded.targetType),
    );
  } catch {
    return null;
  }
}

export function applyStudioOfflineBranchOperationToYjs(
  document: StudioCrdtDocument,
  operation: StudioOfflineBranchOperation,
  payloadBytes: Uint8Array | null,
): void {
  if (operation.action === "delete") {
    if (operation.targetType === "stroke") document.deleteStroke(operation.targetId);
    else if (operation.targetType === "scene-element") {
      document.deleteSceneElement(operation.targetId);
    } else document.deleteLayerGroup(operation.pageId, operation.targetId);
    return;
  }
  if (!payloadBytes) throw new Error("offline branch upsert payload is missing");
  const { value } = decodeStudioOfflineBranchPayload(payloadBytes, operation.targetType);
  if (operation.targetType === "stroke") {
    document.upsertStroke(value as StudioCrdtStrokeInput, {
      beforeStrokeId: operation.beforeId,
      resurrect: true,
      status: "finalized",
    });
    return;
  }
  if (operation.targetType === "scene-element") {
    document.upsertSceneElement(value as StudioCrdtSceneElementInput, {
      beforeElementId: operation.beforeId,
      resurrect: true,
    });
    return;
  }
  document.upsertLayerGroup(value as StudioCrdtLayerGroupInput, { resurrect: true });
}

export function describeStudioOfflinePreparedMutation(
  mutation: StudioOfflinePreparedMutation,
): string {
  return stableStudioOfflineBranchJson({
    targetType: mutation.targetType,
    action: mutation.action,
    targetId: mutation.targetId,
    pageId: mutation.pageId,
    expectedFingerprint: mutation.expectedFingerprint,
    resultFingerprint: mutation.resultFingerprint,
  });
}
