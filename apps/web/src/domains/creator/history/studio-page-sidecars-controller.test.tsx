// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeStudioCharacterBible } from "../studio-character-bible";
import { createStudioHistoryJournal } from "../studio-history-journal";
import { createEmptyStudioWriterRoomDocument } from "../studio-writer-room";

import { useStudioSidecarDocuments } from "./studio-page-sidecars-controller";

afterEach(cleanup);

describe("source sidecar hydration while editor mutations are locked", () => {
  it("loads authorized source state and refs without creating a local mutation or undo entry", () => {
    const markStudioDocumentChanged = vi.fn(() => false);
    const commitStudioHistoryJournal = vi.fn();
    const { result } = renderHook(() => useStudioSidecarDocuments({
      markStudioDocumentChanged,
      commitStudioHistoryJournal,
      historyJournalRef: { current: createStudioHistoryJournal() },
    }));
    const source = {
      characterBible: normalizeStudioCharacterBible(undefined),
      writerRoom: createEmptyStudioWriterRoomDocument(),
    };
    act(() => result.current.hydrateStudioSidecarSource(source));
    expect(result.current.characterBible).toBe(source.characterBible);
    expect(result.current.characterBibleRef.current).toBe(source.characterBible);
    expect(result.current.writerRoom).toBe(source.writerRoom);
    expect(result.current.writerRoomRef.current).toBe(source.writerRoom);
    expect(markStudioDocumentChanged).not.toHaveBeenCalled();
    expect(commitStudioHistoryJournal).not.toHaveBeenCalled();

    act(() => result.current.hydrateStudioSidecarDocuments({
      characterBible: normalizeStudioCharacterBible(undefined),
      writerRoom: createEmptyStudioWriterRoomDocument(),
    }));
    expect(markStudioDocumentChanged).toHaveBeenCalledOnce();
    expect(result.current.characterBible).toBe(source.characterBible);
    expect(result.current.writerRoom).toBe(source.writerRoom);
  });
});
