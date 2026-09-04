import { useEffect, useRef, useState } from "react";

import { createStudioPageHistoryCommandJournalClient } from "../../studio-page-shell-runtime";
import {
  STUDIO_PAGES_HISTORY_INITIAL_DURABILITY_STATUS,
  type StudioHistoryJournalTransitionInput,
  type StudioPagesHistoryCommandJournalDurabilityStatus,
} from "../../studio-pages-history-command-journal-client";

import type { PageState } from "../../studio-page-state";

/** Durable command-journal observer and best-effort recovery facade. */
export function useStudioHistoryDurability() {
  const [pagesHistoryDurabilityStatus, setPagesHistoryDurabilityStatus] =
    useState<StudioPagesHistoryCommandJournalDurabilityStatus>(
      STUDIO_PAGES_HISTORY_INITIAL_DURABILITY_STATUS,
    );
  const pagesHistoryCommandJournalRef = useRef<ReturnType<
    typeof createStudioPageHistoryCommandJournalClient
  > | null>(null);

  useEffect(() => {
    // Strict Mode can replay setup/cleanup without a render. Recreate a disposed client in setup.
    pagesHistoryCommandJournalRef.current ??=
      createStudioPageHistoryCommandJournalClient();
    const client = pagesHistoryCommandJournalRef.current;
    const stopObservingDurability = client?.observeDurabilityStatus(
      setPagesHistoryDurabilityStatus,
    );
    return () => {
      stopObservingDurability?.();
      client?.dispose();
      if (pagesHistoryCommandJournalRef.current === client) {
        pagesHistoryCommandJournalRef.current = null;
      }
    };
  }, []);

  function retryStudioHistoryDurability(): void {
    void pagesHistoryCommandJournalRef.current?.retryDurability().catch((cause: unknown) => {
      setPagesHistoryDurabilityStatus({
        state: "memory-only",
        durable: false,
        persistenceKind: "memory-only",
        retryable: true,
        cause,
      });
    });
  }
  function rebaseStudioHistoryJournal(
    resultingPages: StudioHistoryJournalTransitionInput["nextPages"],
    resultingHistoryIndex: number,
    reason: string,
  ): void {
    try {
      pagesHistoryCommandJournalRef.current?.rebase({
        pages: resultingPages,
        historyIndex: resultingHistoryIndex,
      });
    } catch (cause) {
      if (import.meta.env.DEV) {
        console.warn(`Studio command journal rebase failed (${reason}).`, cause);
      }
    }
  }
  function recordStudioHistoryTransition(
    input: StudioHistoryJournalTransitionInput,
  ): void {
    try {
      pagesHistoryCommandJournalRef.current?.recordTransition(input);
    } catch (cause) {
      rebaseStudioHistoryJournal(
        input.nextPages,
        input.nextHistoryIndex,
        "transition recovery",
      );
      if (import.meta.env.DEV) {
        console.warn("Studio command journal transition was reset.", cause);
      }
    }
  }
  function recordStudioHistoryUndoRedo(
    action: "undo" | "redo",
    resultingPages: PageState[],
    resultingHistoryIndex: number,
  ): void {
    const target = { pages: resultingPages, historyIndex: resultingHistoryIndex };
    try {
      if (action === "undo") {
        pagesHistoryCommandJournalRef.current?.recordUndo(target);
      } else {
        pagesHistoryCommandJournalRef.current?.recordRedo(target);
      }
    } catch (cause) {
      rebaseStudioHistoryJournal(
        resultingPages,
        resultingHistoryIndex,
        `${action} recovery`,
      );
      if (import.meta.env.DEV) {
        console.warn(`Studio command journal ${action} was reset.`, cause);
      }
    }
  }

  return {
    pagesHistoryCommandJournalRef,
    pagesHistoryDurabilityStatus,
    rebaseStudioHistoryJournal,
    recordStudioHistoryTransition,
    recordStudioHistoryUndoRedo,
    retryStudioHistoryDurability,
  } as const;
}
