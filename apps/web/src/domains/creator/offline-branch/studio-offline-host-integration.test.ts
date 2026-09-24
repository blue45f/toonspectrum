import { describe, expect, it, vi } from "vitest";

import {
  canMirrorStudioOfflinePendingStrokeTransition,
  promoteStudioOfflineBranchPending,
  reconcileStudioOfflineCrdtFrontier,
  stageStudioOfflineSceneTransition,
  studioCrdtFrontierHasWork,
} from "./studio-offline-host-integration";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type {
  StudioCrdtSceneGraphChangedIds,
  StudioCrdtSceneGraphFrontier,
} from "../live/studio-crdt-history";
import type { StudioCrdtSceneGraphRuntime } from "../live/StudioLiveCollaborationProvider";
import type { DrawEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

const EMPTY_FRONTIER: StudioCrdtSceneGraphFrontier = {
  strokes: [],
  sceneElements: [],
  pages: [],
  layerGroups: [],
};
const EMPTY_CHANGED_IDS: StudioCrdtSceneGraphChangedIds = {
  strokeIds: new Set(),
  sceneElementIds: new Set(),
  pageIds: new Set(),
  layerGroupIds: new Set(),
};

function page(groupName: string): PageState {
  return {
    id: "page-1",
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1_200,
    groups: [{ id: "group-1", name: groupName, hidden: false, locked: false }],
  };
}

function stroke(id: string, y = 10): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [10, y, 40, y + 2],
    stroke: "#111111",
    strokeWidth: 4,
    opacity: 1,
  };
}

function drawingPage(elements: DrawEl[]): PageState {
  return {
    id: "page-1",
    elements,
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1_200,
  };
}

describe("studio offline host integration", () => {
  it("mirrors only an owned pending-stroke delete plus induced order changes", () => {
    const before = [drawingPage([stroke("remote-a"), stroke("local-pending"), stroke("remote-b")])];
    const after = [drawingPage([stroke("remote-a"), stroke("remote-b")])];

    expect(canMirrorStudioOfflinePendingStrokeTransition(
      before, after, ["local-pending"],
    )).toBe(true);
  });

  it("mirrors redo of the exact pending stroke but rejects an unrelated payload edit", () => {
    const without = [drawingPage([stroke("remote-a"), stroke("remote-b")])];
    const restored = [drawingPage([
      stroke("remote-a"),
      stroke("local-pending"),
      stroke("remote-b"),
    ])];
    expect(canMirrorStudioOfflinePendingStrokeTransition(
      without, restored, ["local-pending"],
    )).toBe(true);

    const editedRemote = [drawingPage([
      { ...stroke("remote-a"), strokeWidth: 12 },
      stroke("local-pending"),
      stroke("remote-b"),
    ])];
    expect(canMirrorStudioOfflinePendingStrokeTransition(
      restored, editedRemote, ["local-pending"],
    )).toBe(false);
  });

  it("keeps an offline projection actionable even when the CRDT frontier is empty", () => {
    expect(studioCrdtFrontierHasWork(EMPTY_FRONTIER, EMPTY_CHANGED_IDS, false)).toBe(false);
    expect(studioCrdtFrontierHasWork(EMPTY_FRONTIER, EMPTY_CHANGED_IDS, true)).toBe(true);
    expect(studioCrdtFrontierHasWork(
      { ...EMPTY_FRONTIER, pages: [{} as StudioCrdtSceneGraphFrontier["pages"][number]] },
      null,
      false,
    )).toBe(true);
  });

  it("reconciles the clean canonical baseline before projecting pending offline changes", () => {
    const current = [page("오프라인")];
    const canonical = [page("서버")];
    const projected = [page("오프라인")];
    const observeCanonicalPages = vi.fn();
    const promotePending = vi.fn(async () => undefined);
    const reportError = vi.fn();
    const document = {} as StudioCrdtDocument;
    const reconcileHistory = vi.fn()
      .mockReturnValueOnce({ history: [current], changed: false })
      .mockReturnValueOnce({ history: [canonical], changed: false });
    const offlineBranch = {
      status: { pendingOperations: 1, canonicalAuthority: true },
      canonicalPagesSnapshot: () => canonical,
      reconstructCanonicalPages: vi.fn(),
      observeCanonicalPages,
      projectPages: () => projected,
      promotePending,
    } as unknown as StudioOfflineBranchRuntime;
    const runtime = {
      offlineBranch,
      reconcileHistory,
      flushAndWaitForDraftProtection: vi.fn(),
    } as unknown as StudioCrdtSceneGraphRuntime;

    const result = reconcileStudioOfflineCrdtFrontier({
      runtime,
      document,
      reportError,
      currentHistory: [current],
      currentIndex: 0,
      frontier: EMPTY_FRONTIER,
      changedIds: EMPTY_CHANGED_IDS,
      referenceSources: new Map(),
    });

    expect(result).toEqual({
      history: [projected],
      currentPages: projected,
    });
    expect(observeCanonicalPages).toHaveBeenCalledWith(canonical);
    expect(reconcileHistory).toHaveBeenCalledTimes(2);
    expect(promotePending).toHaveBeenCalledWith(
      document,
      runtime.flushAndWaitForDraftProtection,
    );
  });

  it("stages transitions only while the offline branch owns the proposal", () => {
    const previousPages = [page("이전")];
    const nextPages = [page("다음")];
    const reportNotice = vi.fn();
    const stageSceneTransition = vi.fn(() => true);
    const runtime = {
      offlineBranch: {
        shouldStageSceneTransition: () => true,
        stageSceneTransition,
      },
    } as unknown as StudioCrdtSceneGraphRuntime;

    expect(stageStudioOfflineSceneTransition(
      runtime, previousPages, nextPages, reportNotice,
    )).toBe(true);
    expect(stageSceneTransition).toHaveBeenCalledWith(previousPages, nextPages);
    expect(reportNotice).toHaveBeenCalledOnce();
    expect(stageStudioOfflineSceneTransition(
      null, previousPages, nextPages, reportNotice,
    )).toBeNull();
  });

  it("accepts an idempotent no-op when the CRDT frontier already contains the local commit", () => {
    const previousPages = [page("이미 확정")];
    const reportNotice = vi.fn();
    const stageSceneTransition = vi.fn(() => false);
    const runtime = {
      offlineBranch: {
        shouldStageSceneTransition: () => true,
        stageSceneTransition,
      },
    } as unknown as StudioCrdtSceneGraphRuntime;

    expect(stageStudioOfflineSceneTransition(
      runtime, previousPages, previousPages, reportNotice,
    )).toBe(true);
    expect(stageSceneTransition).toHaveBeenCalledOnce();
    expect(reportNotice).not.toHaveBeenCalled();
  });

  it("keeps a rejected non-empty offline transition as a commit failure", () => {
    const previousPages = [page("이전")];
    const nextPages = [page("다음")];
    const runtime = {
      offlineBranch: {
        shouldStageSceneTransition: () => true,
        stageSceneTransition: () => false,
      },
    } as unknown as StudioCrdtSceneGraphRuntime;

    expect(stageStudioOfflineSceneTransition(
      runtime, previousPages, nextPages, vi.fn(),
    )).toBe(false);
  });

  it("reports failed canonical promotion without dropping the pending branch", async () => {
    const reportError = vi.fn();
    const promotePending = vi.fn(async () => {
      throw new Error("promotion failed");
    });
    const runtime = {
      offlineBranch: {
        status: { canonicalAuthority: true },
        promotePending,
      },
      flushAndWaitForDraftProtection: vi.fn(),
    } as unknown as StudioCrdtSceneGraphRuntime;

    promoteStudioOfflineBranchPending({
      runtime,
      document: {} as StudioCrdtDocument,
      reportError,
    });
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith("promotion failed"));
    expect(promotePending).toHaveBeenCalledOnce();
  });
});
