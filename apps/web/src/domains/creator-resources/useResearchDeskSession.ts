import { useCallback, useEffect, useRef, useState } from "react";

import {
  createResearchDeskSession,
  parseResearchDeskSession,
  RESEARCH_DESK_SESSION_KEY,
  sanitizeResearchDeskSession,
  serializeResearchDeskSession,
} from "./research-desk-session";

import type { ResearchDeskSession } from "./research-desk-session";

export function useResearchDeskSession() {
  const [session, setSession] = useState<ResearchDeskSession>(createResearchDeskSession);
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(true);
  const [error, setError] = useState("");
  const sessionRef = useRef(session);

  const apply = useCallback((next: ResearchDeskSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      setWritable(false);
      return;
    }

    try {
      apply(parseResearchDeskSession(window.localStorage.getItem(RESEARCH_DESK_SESSION_KEY)));
    } catch (cause) {
      apply(createResearchDeskSession());
      setError(cause instanceof Error ? cause.message : "리서치 세션을 읽지 못했습니다.");
    } finally {
      setReady(true);
    }

    const receiveStorage = (event: StorageEvent) => {
      if (event.key !== RESEARCH_DESK_SESSION_KEY) return;
      try {
        apply(parseResearchDeskSession(event.newValue));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "다른 탭의 리서치 세션을 읽지 못했습니다.");
      }
    };
    window.addEventListener("storage", receiveStorage);
    return () => window.removeEventListener("storage", receiveStorage);
  }, [apply]);

  const update = useCallback((updater: (current: ResearchDeskSession) => ResearchDeskSession) => {
    // The in-memory snapshot stays authoritative while this tab is editing. Reading an
    // older persisted value here would roll back unsaved fields after quota/security failures.
    const next = sanitizeResearchDeskSession(updater(sessionRef.current));
    apply(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RESEARCH_DESK_SESSION_KEY, serializeResearchDeskSession(next));
      setWritable(true);
      setError("");
    } catch (cause) {
      setWritable(false);
      setError(cause instanceof Error ? cause.message : "리서치 세션을 저장하지 못했습니다.");
    }
  }, [apply]);

  const reset = useCallback(() => {
    const next = createResearchDeskSession();
    apply(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(RESEARCH_DESK_SESSION_KEY);
      setWritable(true);
      setError("");
    } catch (cause) {
      setWritable(false);
      setError(cause instanceof Error ? cause.message : "리서치 세션을 초기화하지 못했습니다.");
    }
  }, [apply]);

  return { session, update, reset, ready, writable, error };
}
