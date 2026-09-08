import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { StudioAnimaticWorkspaceDocument } from "../animatic/studio-animatic-workspace";

import {
  normalizeStudioCharacterBible,
  type StudioCharacterBible,
} from "../studio-character-bible";
import {
  recordStudioHistoryJournalSidecarEdit,
  type StudioHistoryJournal,
  type StudioHistoryJournalSidecarEntry,
} from "../studio-history-journal";
import {
  createEmptyStudioWriterRoomDocument,
  type StudioWriterRoomDocument,
} from "../studio-writer-room";

export type StudioPageHistoryJournal = StudioHistoryJournal<StudioCharacterBible, StudioWriterRoomDocument>;
export type StudioPageHistorySidecarEntry = StudioHistoryJournalSidecarEntry<StudioCharacterBible, StudioWriterRoomDocument>;

export interface UseStudioSidecarDocumentsOptions {
  readonly markStudioDocumentChanged: () => boolean;
  readonly onBeforeRecordSidecar?: () => void;
  readonly historyJournalRef: MutableRefObject<StudioPageHistoryJournal>;
  readonly commitStudioHistoryJournal: (journal: StudioPageHistoryJournal) => void;
}

export function useStudioSidecarDocuments({
  markStudioDocumentChanged,
  onBeforeRecordSidecar,
  historyJournalRef,
  commitStudioHistoryJournal,
}: UseStudioSidecarDocumentsOptions) {
  const [characterBible, setCharacterBibleState] = useState<StudioCharacterBible>(() =>
    normalizeStudioCharacterBible(undefined),
  );
  const characterBibleRef = useRef(characterBible);
  characterBibleRef.current = characterBible;

  const [writerRoom, setWriterRoomState] = useState<StudioWriterRoomDocument>(() =>
    createEmptyStudioWriterRoomDocument(),
  );
  const writerRoomRef = useRef(writerRoom);
  writerRoomRef.current = writerRoom;

  const [animaticWorkspace, setAnimaticWorkspaceState] = useState<StudioAnimaticWorkspaceDocument | null>(null);
  const animaticWorkspaceRef = useRef(animaticWorkspace);
  animaticWorkspaceRef.current = animaticWorkspace;
  const [animaticPersistenceError, setAnimaticPersistenceError] = useState<string | null>(null);
  const [animaticPersistenceBusy, setAnimaticPersistenceBusy] = useState(false);
  const animaticWritesRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!animaticWorkspace) return;
    let active = true;
    setAnimaticPersistenceBusy(true);
    const retained = historyJournalRef.current.entries.flatMap((entry) =>
      entry.kind === "sidecar" && entry.target === "animatic" ? [entry.before, entry.after] : []);
    const write = animaticWritesRef.current.then(async () => {
      const { createStudioAnimaticWorkspaceRepository } = await import("../animatic/studio-animatic-workspace-persistence");
      await createStudioAnimaticWorkspaceRepository().save(animaticWorkspace, retained);
    });
    animaticWritesRef.current = write.catch(() => undefined);
    void write.then(() => {
      if (active) { setAnimaticPersistenceError(null); setAnimaticPersistenceBusy(false); }
    }, (error: unknown) => {
      if (active) {
        setAnimaticPersistenceError(error instanceof Error ? error.message : String(error));
        setAnimaticPersistenceBusy(false);
      }
    });
    return () => { active = false; };
  }, [animaticWorkspace, historyJournalRef]);

  function hydrateAnimaticWorkspace(value: StudioAnimaticWorkspaceDocument): void {
    animaticWorkspaceRef.current = value;
    setAnimaticWorkspaceState(value);
  }

  function commitAnimaticWorkspace(before: StudioAnimaticWorkspaceDocument, after: StudioAnimaticWorkspaceDocument): boolean {
    if (before.workScope !== after.workScope) return false;
    if (animaticWorkspaceRef.current !== before) return false;
    if (before === after) return true;
    if (!markStudioDocumentChanged()) return false;
    onBeforeRecordSidecar?.();
    commitStudioHistoryJournal(recordStudioHistoryJournalSidecarEdit(historyJournalRef.current, {
      kind: "sidecar", target: "animatic", before, after, at: Date.now(),
    }, { coalesceWindowMs: 0 }));
    hydrateAnimaticWorkspace(after);
    return true;
  }

  function recordStudioSidecarHistoryEntry(entry: StudioPageHistorySidecarEntry): void {
    onBeforeRecordSidecar?.();
    commitStudioHistoryJournal(
      recordStudioHistoryJournalSidecarEdit(historyJournalRef.current, entry),
    );
  }

  const setCharacterBible = (next: Parameters<typeof setCharacterBibleState>[0]) => {
    if (!markStudioDocumentChanged()) return;
    const before = characterBibleRef.current;
    const after = typeof next === "function" ? next(before) : next;
    if (after === before) return;
    characterBibleRef.current = after;
    recordStudioSidecarHistoryEntry({
      kind: "sidecar",
      target: "characterBible",
      before,
      after,
      at: Date.now(),
    });
    setCharacterBibleState(after);
  };

  const setWriterRoom = (next: Parameters<typeof setWriterRoomState>[0]) => {
    if (!markStudioDocumentChanged()) return;
    const before = writerRoomRef.current;
    const after = typeof next === "function" ? next(before) : next;
    if (after === before) return;
    writerRoomRef.current = after;
    recordStudioSidecarHistoryEntry({
      kind: "sidecar",
      target: "writerRoom",
      before,
      after,
      at: Date.now(),
    });
    setWriterRoomState(after);
  };

  function restoreStudioSidecarDocument(
    entry: StudioPageHistorySidecarEntry,
    direction: "undo" | "redo",
  ): boolean {
    if (entry.target === "animatic" && animaticWorkspaceRef.current?.workScope !== entry.before.workScope) return false;
    if (!markStudioDocumentChanged()) return false;
    if (entry.target === "characterBible") {
      const value = direction === "undo" ? entry.before : entry.after;
      characterBibleRef.current = value;
      setCharacterBibleState(value);
    } else if (entry.target === "writerRoom") {
      const value = direction === "undo" ? entry.before : entry.after;
      writerRoomRef.current = value;
      setWriterRoomState(value);
    } else {
      hydrateAnimaticWorkspace(direction === "undo" ? entry.before : entry.after);
    }
    return true;
  }

  // A source snapshot is already authorized by the document loader. It must hydrate even while
  // editing is locked, and must not mark the freshly loaded document as a local mutation.
  function hydrateStudioSidecarSource(input: {
    readonly characterBible: StudioCharacterBible;
    readonly writerRoom: StudioWriterRoomDocument;
  }): void {
    characterBibleRef.current = input.characterBible;
    writerRoomRef.current = input.writerRoom;
    setCharacterBibleState(input.characterBible);
    setWriterRoomState(input.writerRoom);
    animaticWorkspaceRef.current = null;
    setAnimaticWorkspaceState(null);
    setAnimaticPersistenceBusy(false);
    setAnimaticPersistenceError(null);
  }

  function hydrateStudioSidecarDocuments(input: Parameters<typeof hydrateStudioSidecarSource>[0]): void {
    if (!markStudioDocumentChanged()) return;
    hydrateStudioSidecarSource(input);
  }

  return {
    animaticWorkspace,
    animaticPersistenceBusy,
    animaticPersistenceError,
    hydrateAnimaticWorkspace,
    commitAnimaticWorkspace,
    characterBible,
    characterBibleRef,
    writerRoom,
    writerRoomRef,
    setCharacterBible,
    setWriterRoom,
    setCharacterBibleState,
    setWriterRoomState,
    recordStudioSidecarHistoryEntry,
    restoreStudioSidecarDocument,
    hydrateStudioSidecarDocuments,
    hydrateStudioSidecarSource,
  };
}
