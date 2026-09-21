import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { beginStudioColorSession, editStudioColorSession, resolveStudioColorCommit } from "./studio-color-session";

export interface StudioColorSessionOptions {
  readonly targetKey: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onCommit: (color: string) => void;
  readonly onCancel?: (original: string) => void;
  readonly onInvalidated?: () => void;
}

/** A local draft transaction shared by popover, dock and mobile. Preview never writes a document. */
export function useStudioColorSession(options: StudioColorSessionOptions) {
  const [session, setSession] = useState(() => beginStudioColorSession(options.targetKey, options.value));
  const sessionRef = useRef(session);
  const currentRef = useRef(options);
  const callbacksRef = useRef(options);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const [message, setMessage] = useState("");

  const replace = useCallback((next: typeof session) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  useLayoutEffect(() => {
    currentRef.current = options;
    const existing = sessionRef.current;
    if (!activeRef.current) {
      const next = beginStudioColorSession(options.targetKey, options.value);
      if (existing.targetKey !== next.targetKey || existing.color !== next.color || existing.raw !== next.raw) replace(next);
      return;
    }
    if (options.disabled || resolveStudioColorCommit(existing, options.targetKey, options.value).status === "stale") {
      activeRef.current = false;
      replace(beginStudioColorSession(options.targetKey, options.value));
      setMessage("편집 대상이 바뀌어 이전 색상 선택을 취소했습니다.");
      options.onInvalidated?.();
    }
  }, [options, replace]);

  useLayoutEffect(() => { mountedRef.current = true; return () => { activeRef.current = false; mountedRef.current = false; }; }, []);

  const begin = useCallback(() => {
    const current = currentRef.current;
    if (!mountedRef.current || current.disabled) return false;
    callbacksRef.current = current;
    activeRef.current = true;
    replace(beginStudioColorSession(current.targetKey, current.value));
    setMessage("");
    return true;
  }, [replace]);

  const change = useCallback((raw: string) => {
    if (!activeRef.current && !begin()) return;
    if (sessionRef.current.targetKey !== currentRef.current.targetKey || currentRef.current.disabled) return;
    replace(editStudioColorSession(sessionRef.current, raw));
    setMessage("");
  }, [begin, replace]);

  const commit = useCallback((): boolean => {
    if (!mountedRef.current) return false;
    if (!activeRef.current) return true;
    const current = currentRef.current;
    const result = resolveStudioColorCommit(sessionRef.current, current.targetKey, current.value);
    if (result.status === "invalid") {
      setMessage("#RGB 또는 #RRGGBB 형식의 색상 코드를 입력해 주세요.");
      return false;
    }
    activeRef.current = false;
    if (current.disabled || result.status === "stale") {
      replace(beginStudioColorSession(current.targetKey, current.value));
      setMessage("편집 대상이 바뀌어 색상을 적용하지 않았습니다.");
      current.onInvalidated?.();
      return false;
    }
    if (result.status === "commit") callbacksRef.current.onCommit(result.color);
    setMessage("");
    return true;
  }, [replace]);

  const cancel = useCallback(() => {
    const current = currentRef.current;
    const old = sessionRef.current;
    const notify = mountedRef.current && activeRef.current && old.targetKey === current.targetKey;
    activeRef.current = false;
    replace(beginStudioColorSession(current.targetKey, current.value));
    setMessage("");
    if (notify) callbacksRef.current.onCancel?.(old.initialColor);
  }, [replace]);

  return { session, message, begin, change, commit, cancel };
}
