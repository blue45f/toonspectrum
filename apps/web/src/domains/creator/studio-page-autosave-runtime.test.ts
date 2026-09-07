import { describe, expect, it, vi } from "vitest";

import {
  hydrateStudioAiImageReferenceDocument,
  type StudioAiImageReferenceDocument,
} from "./ai/studio-ai-image-reference-roles";
import { createStudioDrawingPointerTransportController } from "./brush/studio-drawing-pointer-transport";
import { parseStudioAutosave, serializeStudioAutosave, studioAutosaveKey } from "./studio-autosave";
import { addStudioCommentThread, createEmptyStudioCommentsDocument } from "./studio-comments";
import {
  restoreStudioAutosaveRecovery,
  type StudioAutosaveRestoreContext,
} from "./studio-page-autosave-runtime";

import type { StudioAutosaveRecoveryCandidate } from "./studio-autosave-opfs-session";
import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

const SAVED_AT = "2026-09-07T12:00:00.000Z";
const REFERENCES = hydrateStudioAiImageReferenceDocument({
  version: 1,
  references: [{
    id: "style-reference",
    role: "style",
    asset: { assetId: "asset-1" },
    label: "스타일 참조",
    guidance: "선 질감만 참고",
  }],
});
const STROKE: DrawEl = {
  id: "kept-pen", type: "draw", brush: "pen", kind: "freehand", mode: "pen",
  stroke: "#7c5cfc", strokeWidth: 6, opacity: 1, points: [10, 20, 30, 40],
};

function recoveryFixture(options: {
  references?: StudioAiImageReferenceDocument | null;
  elements?: DrawEl[];
  authority?: StudioAutosaveRecoveryCandidate["authority"];
  otherContent?: boolean;
} = {}) {
  const page: PageState = {
    id: "saved-page", elements: options.elements ?? [], bg: "#ffffff", bgGrad: null, canvasH: 1080,
  };
  const comments = options.otherContent ? addStudioCommentThread(createEmptyStudioCommentsDocument(), {
    id: "comment-1", anchor: { type: "page", pageId: page.id },
    author: { displayName: "Artist" }, body: "복구할 댓글", createdAt: SAVED_AT,
  }) : createEmptyStudioCommentsDocument();
  const payload = parseStudioAutosave(serializeStudioAutosave({
    version: 2, savedAt: SAVED_AT, pagesList: [page], currentPageId: page.id,
    comments, master: { elements: options.otherContent ? [STROKE] : [] },
    ...(options.references === null ? {} : { aiImageReferences: options.references ?? REFERENCES }),
  }));
  if (!payload) throw new Error("Recovery fixture must pass the real autosave parser");
  const candidate: StudioAutosaveRecoveryCandidate = {
    key: studioAutosaveKey({}), authority: options.authority ?? "opfs-journal",
    savedAt: SAVED_AT, sequence: 2, revision: 2, payload,
  };
  let imageReferences = hydrateStudioAiImageReferenceDocument({
    version: 1,
    references: [{ id: "old-document-reference", role: "style", asset: { assetId: "old-asset" } }],
  });
  const context = {
    autosaveRecoveryCandidateRef: { current: candidate },
    canApplyStudioMutation: vi.fn(() => true),
    captureStudioMutationTicket: () => ({ authScopeKey: null, workId: null, accessGeneration: 0, documentGeneration: 0 }),
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "Locked",
    drawingPointerTransportRef: { current: createStudioDrawingPointerTransportController() },
    drawingRef: { current: null as DrawEl | null },
    hydrateStudioSidecarDocuments: vi.fn(),
    pages: [] as PageState[],
    pagesHiRef: { current: 0 },
    pagesHistoryCommandJournalRef: { current: null },
    pagesHistoryRef: { current: [[]] as PageState[][] },
    pendingStrokeCommitsRef: { current: null },
    prepareStudioDocumentReplacement: () => true,
    resetAdvancedFillForDocumentReplacement: vi.fn(),
    resetStudioHistoryJournal: vi.fn(),
    resetStudioHistoryRetention: vi.fn(),
    setAiProvenance: vi.fn(),
    setAutosaveRestoreBlockedReason: vi.fn(),
    setCurrentPageId: vi.fn(),
    setDescription: vi.fn(),
    setError: vi.fn(),
    setHasAutosave: vi.fn(),
    setMaster: vi.fn(),
    setPagesHi: vi.fn(),
    setPagesHistory: vi.fn(),
    setPanelGutter: vi.fn(),
    setPublicationAnalytics: vi.fn(),
    setPublishAiDisclosure: vi.fn(),
    setPublishAiUsage: vi.fn(),
    setPublishCompliance: vi.fn(),
    setPublishPackageCredits: vi.fn(),
    setPublishPackageSettings: vi.fn(),
    setPublishProfile: vi.fn(),
    setReferenceBoard: vi.fn(),
    setReleaseSchedule: vi.fn(),
    setScenarioImageReferenceDocumentState: vi.fn((next: StudioAiImageReferenceDocument) => {
      imageReferences = next;
    }),
    setStudioComments: vi.fn(),
    setTagsText: vi.fn(),
    setTitle: vi.fn(),
    setWebtoonTheme: vi.fn(),
    sharedDocument: null,
    workId: null,
  } satisfies StudioAutosaveRestoreContext;
  return { context, candidate, page, comments, readImageReferences: () => imageReferences };
}

describe("autosave recovery hydrates AI references with the selected durable document", () => {
  it.each(["opfs-journal", "sqlite-fallback"] as const)("restores a document containing only AI references from %s", async (authority) => {
    const fixture = recoveryFixture({ authority });

    await restoreStudioAutosaveRecovery(fixture.context);

    expect(fixture.context.setError).not.toHaveBeenCalled();
    expect(fixture.readImageReferences()).toEqual(REFERENCES);
    expect(fixture.context.pagesHistoryRef.current[0]?.[0]?.elements).toEqual([]);
    expect(fixture.context.setMaster).toHaveBeenCalledExactlyOnceWith({ elements: [] });
    expect(fixture.context.setStudioComments).toHaveBeenCalledExactlyOnceWith({ version: 1, threads: [] });
    expect(fixture.context.autosaveRecoveryCandidateRef.current).toBeNull();
    expect(fixture.context.setHasAutosave).toHaveBeenLastCalledWith(false);
  });

  it("restores references, existing ink, master and comments from the same selected snapshot", async () => {
    const fixture = recoveryFixture({ elements: [STROKE], otherContent: true });

    await restoreStudioAutosaveRecovery(fixture.context);

    expect(fixture.readImageReferences()).toEqual(REFERENCES);
    expect(fixture.context.pagesHistoryRef.current[0]?.[0]?.elements).toEqual([STROKE]);
    expect(fixture.context.setStudioComments).toHaveBeenCalledExactlyOnceWith(fixture.comments);
    expect(fixture.context.setMaster).toHaveBeenCalledExactlyOnceWith({ elements: [STROKE] });
    expect(fixture.context.setCurrentPageId).toHaveBeenCalledExactlyOnceWith(fixture.page.id);
  });

  it("clears a previous document's references when the selected legacy snapshot has none", async () => {
    const fixture = recoveryFixture({ references: null });
    expect(fixture.readImageReferences().references).toHaveLength(1);

    await restoreStudioAutosaveRecovery(fixture.context);

    expect(fixture.readImageReferences()).toEqual({ version: 1, references: [] });
    expect(fixture.context.setHasAutosave).toHaveBeenLastCalledWith(false);
  });

  it.each(["document-changed", "drawing-started"] as const)("preserves references and the recovery candidate when %s during preparation", async (reason) => {
    const fixture = recoveryFixture();
    const before = fixture.readImageReferences();
    const recovery = restoreStudioAutosaveRecovery(fixture.context);
    if (reason === "document-changed") fixture.context.canApplyStudioMutation.mockReturnValue(false);
    else fixture.context.drawingRef.current = STROKE;

    await recovery;

    expect(fixture.context.setError).toHaveBeenCalledOnce();
    expect(fixture.readImageReferences()).toBe(before);
    expect(fixture.context.setScenarioImageReferenceDocumentState).not.toHaveBeenCalled();
    expect(fixture.context.setPagesHistory).not.toHaveBeenCalled();
    expect(fixture.context.autosaveRecoveryCandidateRef.current).toBe(fixture.candidate);
    expect(fixture.context.setHasAutosave).not.toHaveBeenCalled();
  });

  it("does not hydrate references from an untrusted browser compatibility snapshot", async () => {
    const fixture = recoveryFixture({ authority: "browser-storage-compatibility" });
    const before = fixture.readImageReferences();

    await restoreStudioAutosaveRecovery(fixture.context);

    expect(fixture.readImageReferences()).toBe(before);
    expect(fixture.context.setScenarioImageReferenceDocumentState).not.toHaveBeenCalled();
    expect(fixture.context.setAutosaveRestoreBlockedReason).toHaveBeenCalledExactlyOnceWith("legacy-unversioned");
    expect(fixture.context.autosaveRecoveryCandidateRef.current).toBe(fixture.candidate);
  });
});
