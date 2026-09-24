import { planStudioOfflineSceneTransition } from "./studio-offline-branch-scene-bridge";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type {
  StudioCrdtSceneGraphChangedIds,
  StudioCrdtSceneGraphFrontier,
} from "../live/studio-crdt-history";
import type { StudioCrdtSceneGraphRuntime } from "../live/StudioLiveCollaborationProvider";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

export { createStudioOfflineCapableResourceLeaseController } from "./createStudioOfflineCapableResourceLeaseController";

export interface StudioOfflineFrontierReconciliationInput {
  readonly runtime: StudioCrdtSceneGraphRuntime;
  readonly document: StudioCrdtDocument;
  readonly reportError: (message: string) => void;
  readonly currentHistory: PageState[][];
  readonly currentIndex: number;
  readonly frontier: StudioCrdtSceneGraphFrontier;
  readonly changedIds: StudioCrdtSceneGraphChangedIds | null;
  readonly referenceSources: ReadonlyMap<string, El>;
}

export interface StudioOfflineFrontierReconciliationResult {
  readonly history: PageState[][];
  readonly currentPages: PageState[];
}

function changedIdsAreEmpty(changedIds: StudioCrdtSceneGraphChangedIds | null): boolean {
  return changedIds !== null
    && changedIds.strokeIds.size === 0
    && changedIds.sceneElementIds.size === 0
    && changedIds.pageIds.size === 0
    && changedIds.layerGroupIds.size === 0;
}
export function studioCrdtFrontierHasWork(
  frontier: StudioCrdtSceneGraphFrontier,
  changedIds: StudioCrdtSceneGraphChangedIds | null,
  hasOfflinePending: boolean,
): boolean {
  if (hasOfflinePending) return true;
  if (changedIdsAreEmpty(changedIds)) return false;
  if (changedIds !== null) return true;
  return frontier.strokes.length > 0
    || frontier.sceneElements.length > 0
    || frontier.pages.length > 0
    || frontier.layerGroups.length > 0;
}

export function reconcileStudioOfflineCrdtFrontier({
  runtime,
  document,
  reportError,
  currentHistory,
  currentIndex,
  frontier,
  changedIds,
  referenceSources,
}: StudioOfflineFrontierReconciliationInput):
StudioOfflineFrontierReconciliationResult | null {
  const offlineBranch = runtime.offlineBranch ?? null;
  const hasOfflinePending = (offlineBranch?.status.pendingOperations ?? 0) > 0;
  if (!studioCrdtFrontierHasWork(frontier, changedIds, hasOfflinePending)) return null;

  const reconciled = runtime.reconcileHistory(
    currentHistory,
    currentIndex,
    frontier,
    changedIds,
    referenceSources,
  );
  if (!reconciled.changed && !hasOfflinePending) return null;

  const nextHistory = hasOfflinePending ? [...reconciled.history] : reconciled.history;
  let canonicalPages = reconciled.history[currentIndex] ?? [];
  if (offlineBranch && hasOfflinePending) {
    const rememberedCanonical = offlineBranch.canonicalPagesSnapshot();
    const cleanBaseline = rememberedCanonical.length > 0
      ? rememberedCanonical
      : offlineBranch.reconstructCanonicalPages(canonicalPages);
    const canonicalReconciled = runtime.reconcileHistory(
      [cleanBaseline],
      0,
      frontier,
      null,
      referenceSources,
    );
    canonicalPages = canonicalReconciled.history[0] ?? cleanBaseline;
    offlineBranch.observeCanonicalPages(canonicalPages);
    nextHistory[currentIndex] = offlineBranch.projectPages(canonicalPages);
  } else {
    offlineBranch?.observeCanonicalPages(canonicalPages);
  }
  if (offlineBranch?.status.canonicalAuthority) {
    promoteStudioOfflineBranchPending({ runtime, document, reportError });
  }
  return {
    history: nextHistory,
    currentPages: nextHistory[currentIndex] ?? [],
  };
}

export function promoteStudioOfflineBranchPending(input: {
  readonly runtime: StudioCrdtSceneGraphRuntime;
  readonly document: StudioCrdtDocument;
  readonly reportError: (message: string) => void;
}): void {
  const offlineBranch = input.runtime.offlineBranch;
  if (!offlineBranch?.status.canonicalAuthority) return;
  void offlineBranch.promotePending(
    input.document,
    input.runtime.flushAndWaitForDraftProtection,
  ).catch((cause: unknown) => {
    input.reportError(
      cause instanceof Error
        ? cause.message
        : "오프라인 변경을 정본에 합치지 못했습니다.",
    );
  });
}


function equalOfflinePayloadBytes(
  left: Uint8Array | null,
  right: Uint8Array | null,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * A pending local stroke already streamed into Yjs may still need an offline-branch record while
 * server authority is unavailable. Its own undo/redo is safe to mirror to the live peer document:
 * only those exact stroke IDs may change semantically; neighbouring strokes may receive order-only
 * upserts because removing one item changes `beforeId`. Any payload edit, page/group change, or
 * unrelated stroke mutation keeps the transition offline-only.
 */
export function canMirrorStudioOfflinePendingStrokeTransition(
  previousPages: readonly PageState[],
  nextPages: readonly PageState[],
  pendingStrokeIds: readonly string[],
): boolean {
  const allowed = new Set(pendingStrokeIds.filter((id) => id.trim().length > 0));
  if (allowed.size === 0) return false;
  const plan = planStudioOfflineSceneTransition(previousPages, nextPages);
  if (plan.unsupported.length > 0 || plan.mutations.length === 0) return false;

  let changesOwnedPendingStroke = false;
  for (const mutation of plan.mutations) {
    if (mutation.targetType !== "stroke") return false;
    if (allowed.has(mutation.targetId)) {
      changesOwnedPendingStroke = true;
      continue;
    }
    const orderOnly = mutation.action === "upsert"
      && equalOfflinePayloadBytes(mutation.payload, mutation.previousPayload);
    if (!orderOnly) return false;
  }
  return changesOwnedPendingStroke;
}

export function stageStudioOfflineSceneTransition(
  runtime: StudioCrdtSceneGraphRuntime | null,
  previousPages: readonly PageState[],
  nextPages: readonly PageState[],
  reportNotice: (message: string) => void,
): boolean | null {
  const offlineBranch = runtime?.offlineBranch ?? null;
  if (!offlineBranch?.shouldStageSceneTransition()) return null;
  const staged = offlineBranch.stageSceneTransition(previousPages, nextPages);
  if (staged) {
    reportNotice(
      "변경을 Automerge 오프라인 branch에 보호했습니다. 서버 정본 연결 후 안전하게 합칩니다.",
    );
    return true;
  }

  // A pointer-contact CRDT stream can materialize the exact completed local stroke before the
  // deferred React history commit runs. In that case the publication transition is intentionally
  // empty: the canonical document is already correct, but the local tab still needs to accept the
  // commit so it can install an undo boundary and release retained surfaces. Distinguish that
  // successful idempotent no-op from unsupported/over-limit staging failures.
  const plan = planStudioOfflineSceneTransition(previousPages, nextPages);
  if (plan.unsupported.length === 0 && plan.mutations.length === 0) return true;
  return false;
}
