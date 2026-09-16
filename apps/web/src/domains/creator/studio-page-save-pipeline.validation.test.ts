import { describe, expect, it, vi } from "vitest";

import {
  runStudioPageSavePipeline,
  type StudioPageSavePipelineDeps,
} from "./studio-page-save-pipeline";
import { STUDIO_WORK_TITLE_REQUIRED_ERROR } from "./studio-work-metadata";

function validationDeps(
  overrides: Partial<StudioPageSavePipelineDeps> = {},
): StudioPageSavePipelineDeps {
  return {
    loggedIn: true,
    collaborationDocumentLocked: false,
    documentSaveInFlightRef: { current: false },
    sharedDocument: null,
    title: "",
    description: "",
    tagsText: "",
    setError: vi.fn(),
    openWorkMetadataStep: vi.fn(),
    clearPendingSaveIntent: vi.fn(),
    ...overrides,
  } as unknown as StudioPageSavePipelineDeps;
}

describe("runStudioPageSavePipeline metadata entry", () => {
  it("explains draft and publish authentication requirements separately", async () => {
    const draftError = vi.fn();
    await runStudioPageSavePipeline("draft", validationDeps({
      loggedIn: false,
      setError: draftError,
    }));
    expect(draftError).toHaveBeenCalledWith(
      "로그인 후 서버 초안으로 저장할 수 있어요.",
    );

    const publishError = vi.fn();
    await runStudioPageSavePipeline("published", validationDeps({
      loggedIn: false,
      setError: publishError,
    }));
    expect(publishError).toHaveBeenCalledWith("로그인 후 게시할 수 있어요.");
  });

  it.each(["draft", "published"] as const)(
    "preserves the %s save intent when required metadata is missing",
    async (status) => {
      const setError = vi.fn();
      const openWorkMetadataStep = vi.fn();
      const clearPendingSaveIntent = vi.fn();

      await runStudioPageSavePipeline(status, validationDeps({
        setError,
        openWorkMetadataStep,
        clearPendingSaveIntent,
      }));

      expect(setError).toHaveBeenCalledWith(STUDIO_WORK_TITLE_REQUIRED_ERROR);
      expect(openWorkMetadataStep).toHaveBeenCalledWith(status);
      expect(clearPendingSaveIntent).not.toHaveBeenCalled();
    },
  );

  it("keeps the pending intent when capture preparation cannot start", async () => {
    const clearPendingSaveIntent = vi.fn();
    const setError = vi.fn();
    const pendingStrokeCommitsRef = { current: {} };

    await runStudioPageSavePipeline("draft", validationDeps({
      title: "1화",
      clearPendingSaveIntent,
      setError,
      pendingStrokeCommitsRef,
      flushPendingStrokeCommitsRef: { current: vi.fn(() => false) },
    }));

    expect(clearPendingSaveIntent).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(
      expect.stringContaining("마지막 획을 원고에 확정하지 못해"),
    );
  });

  it("device-protects a direct draft instead of requiring a server ACK", async () => {
    const draftProtection = vi.fn().mockResolvedValue({
      protection: "device",
      serverSequence: null,
      acknowledgedAt: null,
      protectedUpdateIds: ["update-1"],
    });
    const acknowledgeDraftProtection = vi.fn();
    const authoritativeBarrier = vi.fn();
    const setError = vi.fn();
    const openWorkMetadataStep = vi.fn();
    const page = { id: "page-1", elements: [] } as never;

    await runStudioPageSavePipeline("draft", validationDeps({
      title: "1화",
      setError,
      openWorkMetadataStep,
      clearPendingSaveIntent: vi.fn(),
      pendingStrokeCommitsRef: { current: null },
      pagesHistoryRef: { current: [[page]] },
      pagesHiRef: { current: 0 },
      pages: [page],
      master: { elements: [] } as never,
      sharedDocumentSaveAbortRef: { current: null },
      markStudioDocumentChanged: vi.fn(() => true),
      captureStudioMutationTicket: vi.fn(() => ({
        accessGeneration: 0,
        authScopeKey: null,
        documentGeneration: 0,
        workId: null,
      })),
      canApplyStudioMutation: vi.fn(() => true),
      preserveStudioViewBeforeCapture: vi.fn(),
      setSaving: vi.fn(),
      setSharedDocumentNotice: vi.fn(),
      setSelectedId: vi.fn(),
      setMasterEditMode: vi.fn(),
      hideStrokeGuide: vi.fn(),
      setIsExporting: vi.fn(),
      currentPageId: "page-1",
      masterEditMode: false,
      collaborationOperationSyncRequired: true,
      studioCrdtAuthoritativeSaveBarrierRef: { current: authoritativeBarrier },
      studioCrdtSceneRuntimeRef: {
        current: {
          flushAndWaitForDraftProtection: draftProtection,
          acknowledgeDraftProtection,
        } as never,
      },
      studioCrdtDocumentRef: { current: null },
      captureReadyStageForPage: vi.fn(async () => {
        throw new Error("capture failed after device protection");
      }),
      studioAuthUserId: null,
      workId: null,
      currentStudioDocumentScopeRef: {
        current: { authScopeKey: null, workId: null },
      },
      editorMountedRef: { current: true },
      setCurrentPageId: vi.fn(() => true),
    }));

    expect(draftProtection).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(authoritativeBarrier).not.toHaveBeenCalled();
    expect(acknowledgeDraftProtection).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith("capture failed after device protection");
    expect(openWorkMetadataStep).toHaveBeenCalledWith("draft");
  });

  it("restores the exact pending intent after an attempted save fails", async () => {
    const clearPendingSaveIntent = vi.fn();
    const openWorkMetadataStep = vi.fn();
    const setError = vi.fn();

    await runStudioPageSavePipeline("draft", validationDeps({
      title: "1화",
      clearPendingSaveIntent,
      openWorkMetadataStep,
      setError,
      pendingStrokeCommitsRef: { current: null },
      pagesHistoryRef: { current: [[]] },
      pagesHiRef: { current: 0 },
      pages: [],
      sharedDocumentSaveAbortRef: { current: null },
      markStudioDocumentChanged: vi.fn(() => true),
      captureStudioMutationTicket: vi.fn(() => ({
        accessGeneration: 0,
        authScopeKey: null,
        documentGeneration: 0,
        workId: null,
      })),
      preserveStudioViewBeforeCapture: vi.fn(),
      setSaving: vi.fn(),
      setSharedDocumentNotice: vi.fn(),
      setSelectedId: vi.fn(),
      setMasterEditMode: vi.fn(),
      hideStrokeGuide: vi.fn(),
      setIsExporting: vi.fn(),
      currentPageId: "page-1",
      masterEditMode: false,
      collaborationOperationSyncRequired: true,
      sharedDocument: { role: "owner" } as never,
      studioCrdtAuthoritativeSaveBarrierRef: { current: null },
      studioCrdtSceneRuntimeRef: { current: null },
      studioAuthUserId: null,
      workId: null,
      currentStudioDocumentScopeRef: {
        current: { authScopeKey: null, workId: null },
      },
      editorMountedRef: { current: true },
      setCurrentPageId: vi.fn(),
    }));

    expect(clearPendingSaveIntent).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(
      expect.stringContaining("서버 승인 경계가 준비되지 않아"),
    );
    expect(openWorkMetadataStep).toHaveBeenCalledWith("draft");
  });
});
