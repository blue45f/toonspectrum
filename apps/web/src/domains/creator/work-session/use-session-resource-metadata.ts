import { useEffect, useRef, useState } from "react";
import type { StudioSessionResources, StudioWorkSession } from "@toonspectrum/studio-project-model/work-session";

import { httpStatus } from "@/platform/api";
import { getStudioSessionResources } from "./studio-work-session-client";

/** Owned by the existing actor-keyed session surface; never persists private metadata. */
export function useSessionResourceMetadata(session: StudioWorkSession, onRevoked: () => void) {
  const [offset, setOffset] = useState(0), [retry, setRetry] = useState(0);
  const key = JSON.stringify([session.workId, session.id, session.input.rootGraphHash, offset]);
  const [state, setState] = useState<{ key: string; data: StudioSessionResources | null; failed: boolean }>({ key, data: null, failed: false });
  const revoke = useRef(onRevoked); revoke.current = onRevoked;
  const workId = session.workId, sessionId = session.id, digest = session.input.rootGraphHash;
  useEffect(() => {
    let disposed = false;
    const request = new AbortController();
    let expiration: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => {
      request.abort(); if (!disposed) setState({ key, data: null, failed: true });
    }, 10_000);
    setState({ key, data: null, failed: false });
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        request.abort(); clearTimeout(expiration); setState({ key, data: null, failed: false });
      } else setRetry((value) => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    if (document.visibilityState === "hidden") request.abort();
    void getStudioSessionResources(workId, sessionId, digest, offset, request.signal).then((data) => {
      if (disposed || request.signal.aborted || document.visibilityState === "hidden") return;
      setState({ key, data, failed: false });
      expiration = setTimeout(() => {
        if (disposed) return;
        setState({ key, data: null, failed: false });
        if (document.visibilityState !== "hidden") setRetry((value) => value + 1);
      }, Math.max(0, Date.parse(data.expiresAt) - Date.now()));
    }).catch((error: unknown) => {
      if (disposed) return;
      setState({ key, data: null, failed: true });
      if ([401, 403].includes(httpStatus(error) ?? 0)) revoke.current();
    }).finally(() => clearTimeout(deadline));
    return () => { disposed = true; request.abort(); clearTimeout(deadline); clearTimeout(expiration); document.removeEventListener("visibilitychange", visibility); };
  }, [key, workId, sessionId, digest, offset, retry]);
  return { data: state.key === key ? state.data : null, failed: state.key === key && state.failed,
    offset, setOffset, refresh: () => setRetry((value) => value + 1) };
}
