import { useCallback, useEffect, useRef, useState } from "react";

import {
  createResearchNotebook,
  mergeResearchNotebooks,
  parseResearchNotebook,
  RESEARCH_NOTEBOOK_KEY,
  sanitizeResearchNotebook,
  serializeResearchNotebook,
} from "./research-notebook";

import type { ResearchNotebook } from "./research-notebook";

export type ResearchNotebookRestoreMode = "merge" | "replace";

export function useResearchNotebook() {
  const [notebook, setNotebook] = useState<ResearchNotebook>(createResearchNotebook);
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(true);
  const [error, setError] = useState("");
  const notebookRef = useRef(notebook);

  const apply = useCallback((next: ResearchNotebook) => {
    notebookRef.current = next;
    setNotebook(next);
  }, []);

  const persist = useCallback((next: ResearchNotebook): boolean => {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(RESEARCH_NOTEBOOK_KEY, serializeResearchNotebook(next));
      setWritable(true);
      setError("");
      return true;
    } catch (cause) {
      setWritable(false);
      setError(cause instanceof Error ? cause.message : "판단 노트를 저장하지 못했습니다.");
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      setWritable(false);
      return;
    }

    try {
      apply(parseResearchNotebook(window.localStorage.getItem(RESEARCH_NOTEBOOK_KEY)));
    } catch (cause) {
      apply(createResearchNotebook());
      setError(cause instanceof Error ? cause.message : "판단 노트를 읽지 못했습니다.");
    } finally {
      setReady(true);
    }

    const receiveStorage = (event: StorageEvent) => {
      if (event.key !== RESEARCH_NOTEBOOK_KEY) return;
      try {
        apply(parseResearchNotebook(event.newValue));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "다른 탭의 판단 노트를 읽지 못했습니다.");
      }
    };
    window.addEventListener("storage", receiveStorage);
    return () => window.removeEventListener("storage", receiveStorage);
  }, [apply]);

  const update = useCallback((updater: (current: ResearchNotebook) => ResearchNotebook) => {
    const next = sanitizeResearchNotebook(updater(notebookRef.current));
    apply(next);
    persist(next);
  }, [apply, persist]);

  const restore = useCallback((raw: string, mode: ResearchNotebookRestoreMode): boolean => {
    try {
      const incoming = parseResearchNotebook(raw);
      const next = mode === "replace"
        ? incoming
        : mergeResearchNotebooks(notebookRef.current, incoming);
      apply(next);
      persist(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "판단 노트 백업을 읽지 못했습니다.");
      return false;
    }
  }, [apply, persist]);

  const reset = useCallback(() => {
    const next = createResearchNotebook();
    apply(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(RESEARCH_NOTEBOOK_KEY);
      setWritable(true);
      setError("");
    } catch (cause) {
      setWritable(false);
      setError(cause instanceof Error ? cause.message : "판단 노트를 초기화하지 못했습니다.");
    }
  }, [apply]);

  return { notebook, update, restore, reset, ready, writable, error };
}
