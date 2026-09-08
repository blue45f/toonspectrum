import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  createEmptyStudioAiProvenanceDocument,
  type StudioAiProvenanceDocument,
} from "../../ai/studio-ai-provenance";
import { useStudioSidecarDocuments } from "../../history/studio-page-sidecars-controller";
import {
  composeMasterRenderElements,
  createEmptyDocumentMaster,
  type DocumentMaster,
} from "../../studio-master-page";
import {
  createEmptyStudioPublicationAnalyticsSnapshot,
} from "../../studio-publication-analytics-loader";
import {
  areStudioReferenceBoardDocumentsEqual,
  createDefaultStudioReferenceBoardDocument,
  normalizeStudioReferenceBoardDocument,
  type StudioReferenceBoardDocument,
} from "../../studio-reference-board";
import {
  createEmptyStudioReleaseScheduleSnapshot,
} from "../../studio-release-schedule-loader";

import { useStudioDocumentMutationSetter } from "./useStudioDocumentMutationSetter";

import type { El } from "../../studio-element-model";
import type { StudioPageHistoryJournal } from "../../studio-page-editor-types";
import type {
  StudioPublicationAnalyticsDocument,
} from "../../studio-publication-analytics";
import type { StudioReleaseSchedule } from "../../studio-release-schedule";

interface UseStudioDocumentSidecarsRuntimeOptions {
  readonly advanceStudioRevisionProjectGeneration: () => void;
  readonly beforeRecordSidecar: () => void;
  readonly onAcceptedMutation: () => void;
  readonly commitStudioHistoryJournal: (journal: StudioPageHistoryJournal) => void;
  readonly historyJournalRef: RefObject<StudioPageHistoryJournal>;
  readonly markStudioDocumentChanged: () => boolean;
}

/**
 * Owns persisted document-level state that is not part of the page snapshot array.
 * Page history remains independent, while each public setter still participates in the document
 * mutation gate so autosave and collaboration see one consistent revision stream.
 */
export function useStudioDocumentSidecarsRuntime({
  advanceStudioRevisionProjectGeneration,
  beforeRecordSidecar,
  onAcceptedMutation,
  commitStudioHistoryJournal,
  historyJournalRef,
  markStudioDocumentChanged,
}: UseStudioDocumentSidecarsRuntimeOptions) {
  const [master, setMasterState] = useState<DocumentMaster<El>>(
    () => createEmptyDocumentMaster<El>(),
  );
  const setMaster = useStudioDocumentMutationSetter(master, setMasterState, {
    markStudioDocumentChanged, onAcceptedMutation,
  });

  const {
    animaticWorkspace,
    animaticPersistenceBusy,
    animaticPersistenceError,
    hydrateAnimaticWorkspace,
    commitAnimaticWorkspace,
    characterBible,
    hydrateStudioSidecarDocuments,
    hydrateStudioSidecarSource,
    restoreStudioSidecarDocument,
    setCharacterBible,
    setWriterRoom,
    writerRoom,
  } = useStudioSidecarDocuments({
    markStudioDocumentChanged,
    onBeforeRecordSidecar: () => { beforeRecordSidecar(); onAcceptedMutation(); },
    historyJournalRef,
    commitStudioHistoryJournal,
  });

  const [aiProvenance, setAiProvenanceState] = useState<StudioAiProvenanceDocument>(
    createEmptyStudioAiProvenanceDocument,
  );
  const setAiProvenance = useStudioDocumentMutationSetter(aiProvenance, setAiProvenanceState, {
    markStudioDocumentChanged, onAcceptedMutation,
  });
  function setAiProvenanceOperationState(
    next: Parameters<typeof setAiProvenanceState>[0],
  ): void {
    advanceStudioRevisionProjectGeneration();
    setAiProvenanceState(next);
  }

  const [releaseSchedule, setReleaseScheduleState] = useState<StudioReleaseSchedule>(
    createEmptyStudioReleaseScheduleSnapshot,
  );
  const setReleaseSchedule = useStudioDocumentMutationSetter(releaseSchedule, setReleaseScheduleState, {
    markStudioDocumentChanged, onAcceptedMutation,
  });

  const [publicationAnalytics, setPublicationAnalyticsState] =
    useState<StudioPublicationAnalyticsDocument>(createEmptyStudioPublicationAnalyticsSnapshot);
  const setPublicationAnalytics = useStudioDocumentMutationSetter(publicationAnalytics, setPublicationAnalyticsState, {
    markStudioDocumentChanged, onAcceptedMutation,
  });

  const [referenceBoard, setReferenceBoardState] = useState<StudioReferenceBoardDocument>(
    createDefaultStudioReferenceBoardDocument,
  );
  const referenceBoardCommittedSnapshotRef = useRef<Readonly<{
    document: StudioReferenceBoardDocument;
    revision: number;
  }>>(Object.freeze({ document: referenceBoard, revision: 1 }));
  const referenceBoardLatestRequestedRef = useRef(referenceBoard);
  useLayoutEffect(() => {
    referenceBoardLatestRequestedRef.current = referenceBoard;
    const previous = referenceBoardCommittedSnapshotRef.current;
    if (previous.document === referenceBoard) return;
    referenceBoardCommittedSnapshotRef.current = Object.freeze({
      document: referenceBoard,
      revision: previous.revision >= Number.MAX_SAFE_INTEGER ? 1 : previous.revision + 1,
    });
  }, [referenceBoard]);

  const commitReferenceBoard = useStudioDocumentMutationSetter(referenceBoard, setReferenceBoardState, {
    markStudioDocumentChanged, onAcceptedMutation,
  });
  function setReferenceBoard(next: StudioReferenceBoardDocument): boolean {
    const normalized = normalizeStudioReferenceBoardDocument(next);
    if (
      areStudioReferenceBoardDocumentsEqual(
        referenceBoardLatestRequestedRef.current,
        normalized,
      )
    ) return true;
    if (!commitReferenceBoard(normalized)) return false;
    referenceBoardLatestRequestedRef.current = normalized;
    return true;
  }

  const [masterEditMode, setMasterEditMode] = useState(false);
  const masterEditModeRef = useRef(masterEditMode);
  masterEditModeRef.current = masterEditMode;
  const [masterPanelOpen, setMasterPanelOpen] = useState(false);
  const masterRenderEls = useMemo(() => composeMasterRenderElements(master), [master]);
  const masterRenderElsRef = useRef(masterRenderEls);
  masterRenderElsRef.current = masterRenderEls;

  return {
    animaticWorkspace,
    animaticPersistenceBusy,
    animaticPersistenceError,
    hydrateAnimaticWorkspace,
    commitAnimaticWorkspace,
    aiProvenance,
    characterBible,
    hydrateStudioSidecarDocuments,
    hydrateStudioSidecarSource,
    master,
    masterEditMode,
    masterEditModeRef,
    masterPanelOpen,
    masterRenderEls,
    masterRenderElsRef,
    publicationAnalytics,
    referenceBoard,
    referenceBoardCommittedSnapshotRef,
    referenceBoardLatestRequestedRef,
    releaseSchedule,
    restoreStudioSidecarDocument,
    setAiProvenance,
    setAiProvenanceOperationState,
    setAiProvenanceState,
    setCharacterBible,
    setMaster,
    setMasterEditMode,
    setMasterPanelOpen,
    setMasterState,
    setPublicationAnalytics,
    setPublicationAnalyticsState,
    setReferenceBoard,
    setReferenceBoardState,
    setReleaseSchedule,
    setReleaseScheduleState,
    setWriterRoom,
    writerRoom,
  } as const;
}
