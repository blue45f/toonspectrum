import { useEffect, useRef, useState } from "react";
import type { StudioWorkSession } from "@toonspectrum/studio-project-model/work-session";
import type { StudioSessionEvidenceResponse } from "@toonspectrum/studio-project-model/work-session-evidence";
import { httpStatus } from "@/platform/api";
import { getAuthSessionRevision, listeners, type Session } from "@/compat/auth-session-state";
import { getStudioSessionEvidence } from "./studio-session-evidence-client";

export function useSessionEvidence(session: StudioWorkSession, actorId: string, enabled: boolean, onRevoked: () => void) {
  const [offset, setOffset] = useState(0), [retry, setRetry] = useState(0);
  const key = JSON.stringify([actorId, session.workId, session.id, session.input.rootGraphHash, offset, enabled]);
  const [state, setState] = useState<{ key: string; value: StudioSessionEvidenceResponse | null; failed: boolean }>({ key, value: null, failed: false });
  const revoke = useRef(onRevoked); revoke.current = onRevoked;
  const workId = session.workId, sessionId = session.id, digest = session.input.rootGraphHash;
  useEffect(() => {
    let disposed = false;
    const request = new AbortController(), revision = getAuthSessionRevision();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const deadline = enabled && document.visibilityState !== "hidden" ? setTimeout(() => {
      request.abort(); if (!disposed) setState({ key, value: null, failed: true });
    }, 10_000) : undefined;
    const clear = () => { request.abort(); clearTimeout(expiry); clearTimeout(deadline); if (!disposed) setState({ key, value: null, failed: false }); };
    const visibility = () => { if (document.visibilityState === "hidden") clear(); else setRetry((n) => n + 1); };
    const publication = (value: Session) => { clear(); if (value?.user.id === actorId) setRetry((n) => n + 1); else revoke.current(); };
    setState({ key, value: null, failed: false });
    if (!enabled) return;
    document.addEventListener("visibilitychange", visibility); listeners.add(publication);
    const cleanup = () => { disposed = true; clear(); document.removeEventListener("visibilitychange", visibility); listeners.delete(publication); };
    if (document.visibilityState === "hidden") return cleanup;
    void getStudioSessionEvidence(workId, sessionId, digest, offset, request.signal).then((value) => {
      if (disposed || request.signal.aborted || document.visibilityState === "hidden" || revision !== getAuthSessionRevision()) return;
      setState({ key, value, failed: false });
      expiry = setTimeout(() => {
        if (disposed) return;
        setState({ key, value: null, failed: false });
        if (document.visibilityState !== "hidden") setRetry((n) => n + 1);
      }, Math.max(0, Date.parse(value.expiresAt) - Date.now()));
    }).catch((error: unknown) => {
      if (disposed || request.signal.aborted) return;
      setState({ key, value: null, failed: true });
      if ([401, 403].includes(httpStatus(error) ?? 0)) revoke.current();
    }).finally(() => clearTimeout(deadline));
    return cleanup;
  }, [key, actorId, enabled, workId, sessionId, digest, offset, retry]);
  return { value: enabled && state.key === key ? state.value : null, failed: state.key === key && state.failed,
    offset, setOffset, refresh: () => setRetry((n) => n + 1) };
}
