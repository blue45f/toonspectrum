// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendStudioAiOperation } from "../../ai/studio-ai-provenance";
import { createStudioHistoryJournal } from "../../studio-history-journal";
import { addStudioReleaseScheduleItem } from "../../studio-release-schedule";
import { DEFAULT_STUDIO_REFERENCE_BOARD_ITEM_VIEW } from "../../studio-reference-board";
import { discardStudioRetainedStrokeRedo } from "../../studio-retained-stroke-history";
import { createStudioDeferredStrokeCommitEngine } from "../studio-deferred-stroke-commit";

import { useStudioDocumentSidecarsRuntime } from "./useStudioDocumentSidecarsRuntime";

import type { StudioPageHistoryJournal } from "../../history/studio-page-sidecars-controller";
import type { DrawEl } from "../../studio-element-model";
import type { StudioReferenceBoardItem } from "../../studio-reference-board";
import type { StudioRetainedStrokeUndoneBatch } from "../../studio-retained-stroke-history";
import type { StudioDeferredStrokeCommitEngineContext } from "../studio-deferred-stroke-commit";

afterEach(cleanup);
const stroke: DrawEl = { id: "retained", type: "draw", mode: "pen", kind: "freehand", brush: "pencil", points: [1, 1, 5, 5], stroke: "#000", strokeWidth: 3 };
type Sidecars = ReturnType<typeof useStudioDocumentSidecarsRuntime>;
const edits: Array<[string, (sidecars: Sidecars) => void]> = [
  ["master", sidecars => sidecars.setMaster({ elements: [stroke] })],
  ["release schedule", sidecars => sidecars.setReleaseSchedule(previous => addStudioReleaseScheduleItem(previous, { id: "release", title: "Episode 1" }))],
  ["publication analytics", sidecars => sidecars.setPublicationAnalytics(previous => ({ ...previous, records: [{
    id: "record", destination: "other", source: { kind: "manual", label: "manual" }, date: "2026-09-07",
    episode: "1", title: "Episode 1", views: 20, likes: 2, comments: 1, subscribersGained: 1, revenue: null, currency: null,
  }] }))],
  ["AI provenance", sidecars => sidecars.setAiProvenance(previous => appendStudioAiOperation(previous, {
    id: "operation", kind: "text", task: "scenario", provider: "deepseek", model: "deepseek-chat",
    transport: "server", promptVersion: 1, prompt: "test", createdAt: new Date("2026-09-07T00:00:00Z"), status: "succeeded",
  }))],
  ["reference board", sidecars => sidecars.setReferenceBoard({ version: 1, items: [{
    id: "reference", asset: { sha256: `sha256:${"a".repeat(64)}` }, view: { ...DEFAULT_STUDIO_REFERENCE_BOARD_ITEM_VIEW },
  }] })],
];

function fixture() {
  const undone = { current: { pageId: "page", strokes: [stroke], retryCount: 0, historyIndex: 0 } as StudioRetainedStrokeUndoneBatch | null };
  const discardPixels = vi.fn();
  const markStudioDocumentChanged = vi.fn(() => true);
  const historyJournalRef: { current: StudioPageHistoryJournal } = { current: createStudioHistoryJournal() };
  const hook = renderHook(() => useStudioDocumentSidecarsRuntime({
    advanceStudioRevisionProjectGeneration: vi.fn(), beforeRecordSidecar: vi.fn(),
    onAcceptedMutation: () => { discardStudioRetainedStrokeRedo(undone, discardPixels); },
    markStudioDocumentChanged, historyJournalRef,
    commitStudioHistoryJournal: journal => { historyJournalRef.current = journal; },
  }));
  return { ...hook, undone, discardPixels, markStudioDocumentChanged, historyJournalRef };
}

describe("retained redo across document sidecar edits", () => {
  it.each(edits)("discards the retained branch after an accepted %s edit", (_name, edit) => {
    const editor = fixture();
    act(() => edit(editor.result.current));
    expect(editor.undone.current).toBeNull();
    expect(editor.discardPixels).toHaveBeenCalledExactlyOnceWith([stroke.id]);
  });

  it.each(edits)("preserves retained redo when a %s edit is rejected", (_name, edit) => {
    const editor = fixture();
    editor.markStudioDocumentChanged.mockReturnValue(false);
    const before = editor.undone.current;
    act(() => edit(editor.result.current));
    expect(editor.undone.current).toBe(before);
    expect(editor.discardPixels).not.toHaveBeenCalled();
  });

  it("preserves retained redo for identical document values and normalized reference no-ops", () => {
    const editor = fixture();
    const before = editor.undone.current;
    act(() => {
      const sidecars = editor.result.current;
      sidecars.setMaster(value => value);
      sidecars.setReleaseSchedule(sidecars.releaseSchedule);
      sidecars.setPublicationAnalytics(sidecars.publicationAnalytics);
      sidecars.setAiProvenance(sidecars.aiProvenance);
      sidecars.setReferenceBoard({ version: 1, items: [] });
      sidecars.setCharacterBible(value => value);
      sidecars.setWriterRoom(value => value);
    });
    expect(editor.undone.current).toBe(before);
    expect(editor.discardPixels).not.toHaveBeenCalled();
  });

  it("publishes one Reference snapshot after batched edits and keeps rejected or pending state private", () => {
    const editor = fixture();
    const initial = editor.result.current.referenceBoardCommittedSnapshotRef.current;
    const item = (id: string): StudioReferenceBoardItem => ({
      id, asset: { sha256: `sha256:${"a".repeat(64)}` }, view: { ...DEFAULT_STUDIO_REFERENCE_BOARD_ITEM_VIEW },
    });
    act(() => {
      expect(editor.result.current.setReferenceBoard({ version: 1, items: [item("first")] })).toBe(true);
      expect(editor.result.current.setReferenceBoard({ version: 1, items: [item("second")] })).toBe(true);
      expect(editor.result.current.referenceBoardLatestRequestedRef.current.items[0]?.id).toBe("second");
      expect(editor.result.current.referenceBoardCommittedSnapshotRef.current).toBe(initial);
    });
    const committed = editor.result.current.referenceBoardCommittedSnapshotRef.current;
    expect(committed).toEqual({ document: editor.result.current.referenceBoard, revision: initial.revision + 1 });
    expect(committed.document.items[0]?.id).toBe("second");

    editor.markStudioDocumentChanged.mockReturnValue(false);
    act(() => {
      expect(editor.result.current.setReferenceBoard({ version: 1, items: [item("rejected")] })).toBe(false);
    });
    expect(editor.result.current.referenceBoardCommittedSnapshotRef.current).toBe(committed);
    expect(editor.result.current.referenceBoardLatestRequestedRef.current).toBe(committed.document);

    const invalidations = editor.discardPixels.mock.calls.length;
    act(() => {
      editor.result.current.setReferenceBoardState({ version: 1, items: [item("hydrated")] });
      expect(editor.result.current.referenceBoardCommittedSnapshotRef.current).toBe(committed);
    });
    expect(editor.result.current.referenceBoardCommittedSnapshotRef.current).toEqual({
      document: editor.result.current.referenceBoard, revision: committed.revision + 1,
    });
    expect(editor.result.current.referenceBoard.items[0]?.id).toBe("hydrated");
    expect(editor.discardPixels).toHaveBeenCalledTimes(invalidations);
  });

  it.each(["undo", "redo"] as const)("keeps the retained branch while restoring journaled sidecar %s", direction => {
    const editor = fixture();
    const before = editor.undone.current;
    const original = editor.result.current.characterBible;
    const changed = { ...original, characters: [] };
    act(() => expect(editor.result.current.restoreStudioSidecarDocument({ kind: "sidecar", target: "characterBible", before: original, after: changed, at: 1 }, direction)).toBe(true));
    expect(editor.undone.current).toBe(before);
    expect(editor.discardPixels).not.toHaveBeenCalled();
  });

  it.each(["commit", "coalesced"] as const)("branches through the actual master %s engine path", kind => {
    const editor = fixture();
    const page = { id: "page", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };
    const engine = createStudioDeferredStrokeCommitEngine({
      activePage: page, pages: [page], elements: [], masterEditMode: true,
      editorMountedRef: { current: true }, documentSaveInFlightRef: { current: false }, collaborationAccessRef: { current: { locked: false } },
      pagesHistoryRef: { current: [[page]] }, pagesHiRef: { current: 0 }, currentPageIdRef: { current: page.id },
      bg3dDccSourceRef: { current: null }, setSharedDocumentNotice: vi.fn(), setError: vi.fn(), setMaster: editor.result.current.setMaster,
    } as unknown as StudioDeferredStrokeCommitEngineContext);
    act(() => {
      if (kind === "commit") expect(engine.commit([stroke])).toBe(true);
      else engine.commitCoalesced([stroke], "master");
    });
    expect(editor.result.current.master.elements).toHaveLength(1);
    expect(editor.undone.current).toBeNull();
    expect(editor.discardPixels).toHaveBeenCalledExactlyOnceWith([stroke.id]);
  });
});
