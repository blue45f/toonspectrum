import {
  isStudioCrdtSceneElementType,
  studioDrawElementToCrdtStroke,
  studioPageToCrdtPage,
  studioSceneElementToCrdtElement,
  type StudioCrdtCompatibleDrawElement,
  type StudioCrdtCompatibleElement,
  type StudioCrdtCompatibleOrderedPage,
  type StudioCrdtCompatibleSceneElement,
} from "./studio-crdt-page-bridge";

import type {
  StudioCrdtDocument,
  StudioCrdtDrawStrokePayload,
  StudioCrdtJsonObject,
  StudioCrdtSceneElementInput,
  StudioCrdtStrokePayloadKey,
} from "./studio-crdt-document";

export interface StudioCrdtOrderMove {
  id: string;
  beforeId: string | null;
}

export interface StudioCrdtScenePublishResult {
  sceneElementMutations: number;
  pageMutations: number;
  elementMoves: number;
  pageMoves: number;
}

export interface StudioCrdtDrawPublishOptions {
  /** New local strokes are registered by default. History reconciliation can disable this. */
  registerNewDraws?: boolean;
}

export type StudioCrdtScenePublishOptions = StudioCrdtDrawPublishOptions;

interface StudioCrdtPropertyDiff {
  set: StudioCrdtJsonObject;
  unset: string[];
  changed: string[];
}

const STROKE_SAMPLE_KEYS = [
  "points",
  "pressures",
  "tiltXs",
  "tiltYs",
  "twists",
  "speeds",
  "tangentialPressures",
] as const satisfies readonly StudioCrdtStrokePayloadKey[];

function jsonValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => jsonValueEqual(value, right[index]!));
  }
  if (
    left === null || right === null || typeof left !== "object" || typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] &&
      jsonValueEqual(leftRecord[key], rightRecord[key]));
}

function diffStrokePayloadKeys(
  previous: StudioCrdtDrawStrokePayload,
  next: StudioCrdtDrawStrokePayload
): StudioCrdtStrokePayloadKey[] {
  const previousRecord = previous as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
  const changed: StudioCrdtStrokePayloadKey[] = [];
  for (const key of keys) {
    if (!jsonValueEqual(previousRecord[key], nextRecord[key])) {
      changed.push(key as StudioCrdtStrokePayloadKey);
    }
  }
  if (changed.some((key) => (STROKE_SAMPLE_KEYS as readonly string[]).includes(key))) {
    for (const key of STROKE_SAMPLE_KEYS) {
      if (!changed.includes(key)) changed.push(key);
    }
  }
  return changed;
}

function diffProperties(
  previous: StudioCrdtJsonObject,
  next: StudioCrdtJsonObject
): StudioCrdtPropertyDiff {
  const set: StudioCrdtJsonObject = {};
  const unset: string[] = [];
  const changed: string[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (!(key in next)) {
      unset.push(key);
      continue;
    }
    if (!(key in previous) || !jsonValueEqual(previous[key]!, next[key]!)) {
      set[key] = next[key]!;
      changed.push(key);
    }
  }
  return { set, unset, changed };
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function isSupportedSceneElement<TElement extends StudioCrdtCompatibleElement>(
  element: TElement
): element is TElement & StudioCrdtCompatibleSceneElement {
  return isStudioCrdtSceneElementType(element.type);
}

function isCompatibleDrawElement<TElement extends StudioCrdtCompatibleElement>(
  element: TElement
): element is TElement & StudioCrdtCompatibleDrawElement {
  return element.type === "draw";
}

/**
 * Produces a minimum-cardinality move set for unique IDs by retaining one LIS/LCS. Moves are
 * emitted tail-to-head, matching the CRDT's `move(id, beforeId)` primitive.
 */
export function planStudioCrdtOrderMoves(
  currentIds: readonly string[],
  desiredIds: readonly string[]
): StudioCrdtOrderMove[] {
  const current = uniqueIds(currentIds);
  const desired = uniqueIds(desiredIds);
  const desiredPosition = new Map(desired.map((id, index) => [id, index]));
  const common = current.filter((id) => desiredPosition.has(id));
  const positions = common.map((id) => desiredPosition.get(id)!);
  const tails: number[] = [];
  const tailIndices: number[] = [];
  const previousIndices = Array<number>(positions.length).fill(-1);
  for (let index = 0; index < positions.length; index += 1) {
    const value = positions[index]!;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tails[middle]! < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
    previousIndices[index] = low > 0 ? tailIndices[low - 1]! : -1;
    tailIndices[low] = index;
  }
  const retained = new Set<string>();
  let retainedIndex = tailIndices[tails.length - 1] ?? -1;
  while (retainedIndex >= 0) {
    retained.add(common[retainedIndex]!);
    retainedIndex = previousIndices[retainedIndex]!;
  }

  const moves: StudioCrdtOrderMove[] = [];
  let beforeId: string | null = null;
  for (let index = desired.length - 1; index >= 0; index -= 1) {
    const id = desired[index]!;
    if (!retained.has(id)) moves.push({ id, beforeId });
    beforeId = id;
  }
  return moves;
}

function supportedSceneInputs<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatibleOrderedPage<TElement>,
>(pages: readonly TPage[]): Map<string, StudioCrdtSceneElementInput> {
  const result = new Map<string, StudioCrdtSceneElementInput>();
  for (const page of pages) {
    for (const element of page.elements) {
      if (!isSupportedSceneElement(element)) continue;
      if (result.has(element.id)) throw new Error("페이지 간에 중복된 장면 요소 식별자가 있습니다.");
      result.set(
        element.id,
        studioSceneElementToCrdtElement(page.id, element)
      );
    }
  }
  return result;
}

interface StudioCrdtDrawLocation {
  pageId: string;
  layerId: string;
  element: StudioCrdtCompatibleDrawElement;
}

function supportedDrawInputs<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatibleOrderedPage<TElement>,
>(pages: readonly TPage[]): Map<string, StudioCrdtDrawLocation> {
  const result = new Map<string, StudioCrdtDrawLocation>();
  for (const page of pages) {
    for (const element of page.elements) {
      if (!isCompatibleDrawElement(element)) continue;
      if (result.has(element.id)) throw new Error("페이지 간에 중복된 드로우 식별자가 있습니다.");
      result.set(element.id, {
        pageId: page.id,
        layerId: element.groupId ?? "page-root",
        element,
      });
    }
  }
  return result;
}

function drawInput(location: StudioCrdtDrawLocation) {
  return studioDrawElementToCrdtStroke(location.pageId, location.element);
}

/**
 * Publishes draw payload edits using document-global identity. The global comparison is important:
 * a stroke moved from page A to B is a reparent, not a delete on A followed by a resurrection on B.
 * When a peer has already moved the stroke, a scalar-only local edit preserves the peer page/layer.
 */
export function publishStudioCrdtDrawGraphDiff<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatibleOrderedPage<TElement>,
>(
  document: StudioCrdtDocument,
  previousPages: readonly TPage[],
  nextPages: readonly TPage[],
  options: StudioCrdtDrawPublishOptions = {}
): number {
  const previous = supportedDrawInputs(previousPages);
  const next = supportedDrawInputs(nextPages);
  const registerNewDraws = options.registerNewDraws ?? true;
  let mutations = 0;

  for (const [id, previousLocation] of previous) {
    if (next.has(id)) continue;
    let current = document.getStroke(id, true);
    if (!current) {
      document.replaceStroke(drawInput(previousLocation));
      mutations += 1;
      current = document.getStroke(id, true);
    }
    if (current && !current.deleted && document.deleteStroke(id)) mutations += 1;
  }

  for (const [id, nextLocation] of next) {
    const previousLocation = previous.get(id) ?? null;
    const current = document.getStroke(id, true);
    const nextInput = drawInput(nextLocation);
    const previousInput = previousLocation ? drawInput(previousLocation) : null;
    const changedPayloadKeys = previousInput
      ? diffStrokePayloadKeys(previousInput.payload, nextInput.payload)
      : [];
    const locallyReparented = previousLocation !== null && (
      previousLocation.pageId !== nextLocation.pageId ||
      previousLocation.layerId !== nextLocation.layerId
    );
    const topologyWriteNeeded = locallyReparented && (
      current?.pageId !== nextLocation.pageId || current.layerId !== nextLocation.layerId
    );
    const locallyEdited = changedPayloadKeys.length > 0;

    if (!current) {
      if (!previousLocation) {
        if (registerNewDraws) {
          document.replaceStroke(nextInput);
          mutations += 1;
        }
      } else if (locallyEdited || locallyReparented) {
        // The first real edit of a legacy stroke materializes it in the durable CRDT. Unchanged
        // legacy snapshots remain local until an operation actually touches them.
        document.replaceStroke(nextInput);
        mutations += 1;
      }
      continue;
    }
    if (current.deleted) {
      // Preserve a peer tombstone for stale snapshots. Only an explicit absent -> present local
      // transition (redo/re-add) owns resurrection.
      if (!previousLocation) {
        document.restoreStroke(id);
        document.replaceStroke(nextInput);
        mutations += 2;
      }
      continue;
    }
    if (!previousLocation) {
      // This is the pointer-up/final commit for a draw created after the previous React snapshot.
      // A peer-streaming draw that exists in both snapshots takes the branch below and is untouched.
      if (current.status === "drawing") {
        const completionKeys = diffStrokePayloadKeys(current.payload, nextInput.payload);
        document.patchStroke(id, {
          pageId: nextLocation.pageId,
          layerId: nextLocation.layerId,
          payload: nextInput.payload,
          changedPayloadKeys: completionKeys,
        });
        if (document.getStroke(id, true)?.status === "drawing") document.finalizeStroke(id);
        mutations += 1;
      }
      continue;
    }
    if (locallyEdited || topologyWriteNeeded) {
      document.patchStroke(id, {
        pageId: topologyWriteNeeded ? nextLocation.pageId : undefined,
        layerId: topologyWriteNeeded ? nextLocation.layerId : undefined,
        payload: nextInput.payload,
        changedPayloadKeys,
      });
      mutations += 1;
    }
  }
  return mutations;
}

function publishDrawTopologyRecords(
  document: StudioCrdtDocument,
  previous: ReadonlyMap<string, StudioCrdtDrawLocation>,
  next: ReadonlyMap<string, StudioCrdtDrawLocation>,
  registerNewDraws: boolean
): number {
  let mutations = 0;
  for (const [id, previousLocation] of previous) {
    if (next.has(id)) continue;
    let current = document.getStroke(id, true);
    if (!current) {
      document.replaceStroke(drawInput(previousLocation));
      mutations += 1;
      current = document.getStroke(id, true);
    }
    if (current && !current.deleted && document.deleteStroke(id)) mutations += 1;
  }
  for (const [id, nextLocation] of next) {
    const previousLocation = previous.get(id) ?? null;
    const current = document.getStroke(id, true);
    if (!previousLocation) {
      if (!current) {
        if (!registerNewDraws) continue;
        document.replaceStroke(drawInput(nextLocation));
        mutations += 1;
      } else if (current.deleted) {
        document.restoreStroke(id);
        document.replaceStroke(drawInput(nextLocation));
        mutations += 2;
      }
      continue;
    }
    const locallyReparented = previousLocation.pageId !== nextLocation.pageId ||
      previousLocation.layerId !== nextLocation.layerId;
    if (!locallyReparented || current?.deleted) continue;
    if (
      current &&
      current.pageId === nextLocation.pageId &&
      current.layerId === nextLocation.layerId
    ) continue;
    // Missing means a local reparent is the first operation on a legacy stroke. Existing means the
    // same durable record changes ownership; there is no page-local delete/resurrect window.
    if (current) {
      document.patchStroke(id, {
        pageId: nextLocation.pageId,
        layerId: nextLocation.layerId,
      });
    } else {
      document.replaceStroke(drawInput(nextLocation));
    }
    mutations += 1;
  }
  return mutations;
}

function publishSceneElementRecords(
  document: StudioCrdtDocument,
  previous: ReadonlyMap<string, StudioCrdtSceneElementInput>,
  next: ReadonlyMap<string, StudioCrdtSceneElementInput>
): number {
  let mutations = 0;

  for (const [id, previousInput] of previous) {
    if (next.has(id)) continue;
    let current = document.getSceneElement(id, true);
    if (!current) {
      document.upsertSceneElement(previousInput, {
        baselineProps: previousInput.payload.props,
        changedProps: [],
      });
      mutations += 1;
      current = document.getSceneElement(id, true);
    }
    if (current && !current.deleted && document.deleteSceneElement(id)) mutations += 1;
  }

  for (const [id, nextInput] of next) {
    const previousInput = previous.get(id) ?? null;
    const current = document.getSceneElement(id, true);
    if (!current) {
      if (!previousInput) {
        document.addSceneElement(nextInput);
        mutations += 1;
        continue;
      }
      const diff = diffProperties(previousInput.payload.props, nextInput.payload.props);
      const reparented = previousInput.pageId !== nextInput.pageId ||
        previousInput.layerId !== nextInput.layerId;
      if (diff.changed.length === 0 && diff.unset.length === 0 && !reparented) continue;
      document.upsertSceneElement(nextInput, {
        baselineProps: previousInput.payload.props,
        changedProps: diff.changed,
        unsetProps: diff.unset,
      });
      mutations += 1;
      continue;
    }
    if (current.deleted) {
      // A stale React snapshot must not resurrect a peer tombstone. Only a real absent -> present
      // transition (redo or explicit re-add) owns resurrection.
      if (!previousInput) {
        document.upsertSceneElement(nextInput, { resurrect: true });
        mutations += 1;
      }
      continue;
    }
    if (!previousInput) continue; // Durable remote addition already won; never overwrite it here.
    if (current.payload.type !== nextInput.payload.type) {
      throw new Error("같은 장면 요소 식별자의 타입을 변경할 수 없습니다.");
    }
    const diff = diffProperties(previousInput.payload.props, nextInput.payload.props);
    const pageChanged = previousInput.pageId !== nextInput.pageId;
    const layerChanged = previousInput.layerId !== nextInput.layerId;
    if (diff.changed.length === 0 && diff.unset.length === 0 && !pageChanged && !layerChanged) continue;
    document.patchSceneElement(id, {
      set: diff.set,
      unset: diff.unset,
      pageId: pageChanged ? nextInput.pageId : undefined,
      layerId: layerChanged ? nextInput.layerId : undefined,
    });
    mutations += 1;
  }
  return mutations;
}

function publishSceneOrderForPage<TElement extends StudioCrdtCompatibleElement>(
  document: StudioCrdtDocument,
  pageId: string,
  previousElements: readonly TElement[],
  nextElements: readonly TElement[],
  previous: ReadonlyMap<string, StudioCrdtSceneElementInput>,
  next: ReadonlyMap<string, StudioCrdtSceneElementInput>,
  forceBootstrap: boolean
): { mutations: number; moves: number } {
  let mutations = 0;
  const previousMixedOrder = previousElements
    .filter((element) => element.type === "draw" || isStudioCrdtSceneElementType(element.type))
    .map((element) => element.id);
  const nextMixedOrder = nextElements
    .filter((element) => element.type === "draw" || isStudioCrdtSceneElementType(element.type))
    .map((element) => element.id);
  if (!forceBootstrap && previousMixedOrder.join("\0") === nextMixedOrder.join("\0")) {
    return { mutations: 0, moves: 0 };
  }

  // Add/delete/reorder all need complete sibling context, including legacy draw operations.
  for (const element of nextElements) {
    if (isSupportedSceneElement(element)) {
      const id = element.id;
      if (document.getSceneElement(id, true)) continue;
      const previousInput = previous.get(id);
      const nextInput = next.get(id);
      if (!nextInput) continue;
      if (previousInput) {
        document.upsertSceneElement(nextInput, {
          baselineProps: previousInput.payload.props,
          changedProps: [],
        });
      } else {
        document.addSceneElement(nextInput);
      }
      mutations += 1;
      continue;
    }
    if (!isCompatibleDrawElement(element)) continue;
    const current = document.getStroke(element.id, true);
    if (current?.deleted) continue;
    if (!current) {
      document.replaceStroke(studioDrawElementToCrdtStroke(pageId, element));
      mutations += 1;
    }
  }

  const desiredIds = nextElements
    .filter((element) => element.type === "draw" || isStudioCrdtSceneElementType(element.type))
    .map((element) => element.id)
    .filter((id) => document.getStroke(id) !== null || document.getSceneElement(id) !== null);
  const desiredSet = new Set(desiredIds);
  const currentIds = [
    ...document.getStrokes({ pageId }),
    ...document.getSceneElements({ pageId }),
  ].sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id))
    .map((record) => record.id)
    .filter((id) => desiredSet.has(id));
  const moves = planStudioCrdtOrderMoves(currentIds, desiredIds);
  for (const move of moves) document.moveElement(move.id, move.beforeId);
  return { mutations, moves: moves.length };
}

export function publishStudioCrdtSceneGraphDiff<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatibleOrderedPage<TElement>,
>(
  document: StudioCrdtDocument,
  previousPages: readonly TPage[],
  nextPages: readonly TPage[],
  options: StudioCrdtScenePublishOptions = {}
): StudioCrdtScenePublishResult {
  const registerNewDraws = options.registerNewDraws ?? true;
  const previousById = new Map(previousPages.map((page) => [page.id, page]));
  const nextById = new Map(nextPages.map((page) => [page.id, page]));
  const previousSceneInputs = supportedSceneInputs(previousPages);
  const nextSceneInputs = supportedSceneInputs(nextPages);
  const previousDrawInputs = supportedDrawInputs(previousPages);
  const nextDrawInputs = supportedDrawInputs(nextPages);
  const managedElementIdsBefore = new Set([
    ...document.getStrokes({ includeDeleted: true }).map(({ id }) => id),
    ...document.getSceneElements({ includeDeleted: true }).map(({ id }) => id),
  ]);
  const managedPageIdsBefore = new Set(document.getPages(true).map(({ id }) => id));
  let sceneElementMutations = publishStudioCrdtDrawGraphDiff(
    document,
    previousPages,
    nextPages,
    { registerNewDraws }
  );
  sceneElementMutations += publishSceneElementRecords(
    document,
    previousSceneInputs,
    nextSceneInputs
  );
  sceneElementMutations += publishDrawTopologyRecords(
    document,
    previousDrawInputs,
    nextDrawInputs,
    registerNewDraws
  );
  const bootstrapElementOrderPages = new Set<string>();
  for (const page of nextPages) {
    if (page.elements.some((element) =>
      (element.type === "draw" || isStudioCrdtSceneElementType(element.type)) &&
      !managedElementIdsBefore.has(element.id) &&
      (document.getStroke(element.id, true) !== null ||
        document.getSceneElement(element.id, true) !== null)
    )) bootstrapElementOrderPages.add(page.id);
  }
  let elementMoves = 0;
  const pageIds = new Set([...previousById.keys(), ...nextById.keys()]);
  for (const pageId of pageIds) {
    const result = publishSceneOrderForPage(
      document,
      pageId,
      previousById.get(pageId)?.elements ?? [],
      nextById.get(pageId)?.elements ?? [],
      previousSceneInputs,
      nextSceneInputs,
      bootstrapElementOrderPages.has(pageId)
    );
    sceneElementMutations += result.mutations;
    elementMoves += result.moves;
  }

  let pageMutations = 0;
  for (const [id, previousPage] of previousById) {
    if (nextById.has(id)) continue;
    let current = document.getPage(id, true);
    if (!current) {
      const previousInput = studioPageToCrdtPage(previousPage);
      document.upsertPage(previousInput, {
        baselineProps: previousInput.payload.props,
        changedProps: [],
      });
      pageMutations += 1;
      current = document.getPage(id, true);
    }
    if (current && !current.deleted && document.deletePage(id)) pageMutations += 1;
  }
  for (const [id, nextPage] of nextById) {
    const nextInput = studioPageToCrdtPage(nextPage);
    const previousPage = previousById.get(id);
    const previousInput = previousPage ? studioPageToCrdtPage(previousPage) : null;
    const current = document.getPage(id, true);
    if (!current) {
      if (!previousInput) {
        document.addPage(nextInput);
        pageMutations += 1;
        continue;
      }
      const diff = diffProperties(previousInput.payload.props, nextInput.payload.props);
      if (diff.changed.length === 0 && diff.unset.length === 0) continue;
      document.upsertPage(nextInput, {
        baselineProps: previousInput.payload.props,
        changedProps: diff.changed,
        unsetProps: diff.unset,
      });
      pageMutations += 1;
      continue;
    }
    if (current.deleted) {
      if (!previousInput) {
        document.upsertPage(nextInput, { resurrect: true });
        pageMutations += 1;
      }
      continue;
    }
    if (!previousInput) continue;
    const diff = diffProperties(previousInput.payload.props, nextInput.payload.props);
    if (diff.changed.length === 0 && diff.unset.length === 0) continue;
    document.patchPage(id, { set: diff.set, unset: diff.unset });
    pageMutations += 1;
  }

  const previousOrder = previousPages.map((page) => page.id);
  const nextOrder = nextPages.map((page) => page.id);
  const pageTopologyChanged = previousOrder.join("\0") !== nextOrder.join("\0");
  const pageOrderNeedsBootstrap = pageTopologyChanged || nextPages.some(
    (page) => !managedPageIdsBefore.has(page.id) && document.getPage(page.id, true) !== null
  );
  if (pageOrderNeedsBootstrap) {
    for (const page of nextPages) {
      if (document.getPage(page.id, true)) continue;
      const previousPage = previousById.get(page.id);
      if (!previousPage) continue;
      const previousInput = studioPageToCrdtPage(previousPage);
      const nextInput = studioPageToCrdtPage(page);
      document.upsertPage(nextInput, {
        baselineProps: previousInput.payload.props,
        changedProps: [],
      });
      pageMutations += 1;
    }
    const desiredPageIds = nextPages.map((page) => page.id)
      .filter((id) => document.getPage(id) !== null);
    const desiredPageSet = new Set(desiredPageIds);
    const currentPageIds = document.getPages().map((record) => record.id)
      .filter((id) => desiredPageSet.has(id));
    const pageMoves = planStudioCrdtOrderMoves(currentPageIds, desiredPageIds);
    for (const move of pageMoves) document.movePage(move.id, move.beforeId);
    return {
      sceneElementMutations,
      pageMutations,
      elementMoves,
      pageMoves: pageMoves.length,
    };
  }

  return {
    sceneElementMutations,
    pageMutations,
    elementMoves,
    pageMoves: 0,
  };
}
