// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioAnimaticWorkspace } from "../animatic/studio-animatic-workspace";
import { normalizeStudioCharacterBible } from "../studio-character-bible";
import { createStudioHistoryJournal, readStudioHistoryJournalRedoEntry, readStudioHistoryJournalUndoEntry, stepStudioHistoryJournal } from "../studio-history-journal";
import { createEmptyStudioWriterRoomDocument } from "../studio-writer-room";
import { useStudioSidecarDocuments, type StudioPageHistoryJournal } from "./studio-page-sidecars-controller";

const { save } = vi.hoisted(() => ({ save: vi.fn(async () => undefined) }));
vi.mock("../animatic/studio-animatic-workspace-persistence", () => ({ createStudioAnimaticWorkspaceRepository: () => ({ save }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { save.mockReset(); save.mockResolvedValue(undefined); });

function setup() {
  const historyJournalRef: { current: StudioPageHistoryJournal } = { current: createStudioHistoryJournal() };
  const markStudioDocumentChanged = vi.fn(() => true);
  const commitStudioHistoryJournal = vi.fn((journal: StudioPageHistoryJournal) => { historyJournalRef.current = journal; });
  const hook = renderHook(() => useStudioSidecarDocuments({ historyJournalRef, markStudioDocumentChanged, commitStudioHistoryJournal }));
  return { ...hook, historyJournalRef, markStudioDocumentChanged };
}

describe("storyboard document Undo and durable sidecar boundary", () => {
  it("keeps same-clock edits separate, restores exact states and persists undoable media references", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const h = setup();
    const before = createStudioAnimaticWorkspace([{ id: "p1" }], "episode-1");
    const marker = { ...before, markers: [{ id: "m1", timeMs: 100, label: "대사" }] };
    const review = { ...marker, reviews: [{ id: "r1", variantId: null, timeMs: 100, text: "확인", resolved: false }] };
    act(() => h.result.current.hydrateAnimaticWorkspace(before));
    await waitFor(() => expect(h.result.current.animaticPersistenceBusy).toBe(false));
    act(() => {
      expect(h.result.current.commitAnimaticWorkspace(before, marker)).toBe(true);
      expect(h.result.current.commitAnimaticWorkspace(marker, review)).toBe(true);
    });
    expect(h.historyJournalRef.current.entries).toHaveLength(2);
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(review, [before, marker, marker, review]));
    const undo = readStudioHistoryJournalUndoEntry(h.historyJournalRef.current)!;
    if (undo.kind !== "sidecar") throw new Error("Expected sidecar history");
    act(() => {
      expect(h.result.current.restoreStudioSidecarDocument(undo, "undo")).toBe(true);
      h.historyJournalRef.current = stepStudioHistoryJournal(h.historyJournalRef.current, "undo");
    });
    expect(h.result.current.animaticWorkspace).toBe(marker);
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(marker, [before, marker, marker, review]));
    const redo = readStudioHistoryJournalRedoEntry(h.historyJournalRef.current)!;
    if (redo.kind !== "sidecar") throw new Error("Expected sidecar history");
    act(() => {
      expect(h.result.current.restoreStudioSidecarDocument(redo, "redo")).toBe(true);
      h.historyJournalRef.current = stepStudioHistoryJournal(h.historyJournalRef.current, "redo");
    });
    expect(h.result.current.animaticWorkspace).toBe(review);
    await waitFor(() => expect(h.result.current.animaticPersistenceBusy).toBe(false));
  });

  it("rejects stale asynchronous edits after document replacement before marking the new document dirty", async () => {
    const h = setup();
    const before = createStudioAnimaticWorkspace([{ id: "p1" }], "episode-1");
    const after = { ...before, markers: [{ id: "m1", timeMs: 100, label: "늦은 캡처" }] };
    act(() => h.result.current.hydrateAnimaticWorkspace(before));
    await waitFor(() => expect(h.result.current.animaticPersistenceBusy).toBe(false));
    act(() => h.result.current.hydrateStudioSidecarSource({ characterBible: normalizeStudioCharacterBible(undefined), writerRoom: createEmptyStudioWriterRoomDocument() }));
    act(() => expect(h.result.current.commitAnimaticWorkspace(before, after)).toBe(false));
    expect(h.markStudioDocumentChanged).not.toHaveBeenCalled();
    expect(h.historyJournalRef.current.entries).toHaveLength(0);
    expect(h.result.current.animaticWorkspace).toBeNull();
    const another = createStudioAnimaticWorkspace([{ id: "p2" }], "episode-2");
    act(() => h.result.current.hydrateAnimaticWorkspace(another));
    act(() => expect(h.result.current.restoreStudioSidecarDocument({ kind: "sidecar", target: "animatic", before, after, at: 1 }, "undo")).toBe(false));
    expect(h.result.current.animaticWorkspace).toBe(another);
    expect(h.markStudioDocumentChanged).not.toHaveBeenCalled();
    await waitFor(() => expect(h.result.current.animaticPersistenceBusy).toBe(false));
  });

  it("keeps the edited state and exposes a persistence error, then allows a later save to recover", async () => {
    const h = setup();
    const before = createStudioAnimaticWorkspace([{ id: "p1" }], "episode-1");
    act(() => h.result.current.hydrateAnimaticWorkspace(before));
    await waitFor(() => expect(h.result.current.animaticPersistenceBusy).toBe(false));
    save.mockRejectedValueOnce(new Error("disk full"));
    const after = { ...before, markers: [{ id: "m1", timeMs: 100, label: "확인" }] };
    act(() => h.result.current.commitAnimaticWorkspace(before, after));
    await waitFor(() => expect(h.result.current.animaticPersistenceError).toBe("disk full"));
    expect(h.result.current.animaticWorkspace).toBe(after);
    expect(h.result.current.animaticPersistenceBusy).toBe(false);
    const retry = { ...after, reviews: [{ id: "r1", variantId: null, timeMs: 100, text: "재시도", resolved: false }] };
    act(() => h.result.current.commitAnimaticWorkspace(after, retry));
    await waitFor(() => expect(h.result.current.animaticPersistenceError).toBeNull());
    expect(save).toHaveBeenLastCalledWith(retry, [before, after, after, retry]);
  });
});
