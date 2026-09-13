import { useCallback, useEffect, useRef, useState } from "react";

import {
  boundStudioSaveIntentOperation,
  studioDurableSaveIntentRepository,
  studioSaveIntentScopeKey,
  subscribeStudioDurableSaveIntent,
  type StudioDurableSaveIntent,
  type StudioSaveIntentScope,
} from "./studio-durable-save-intent";

interface State {
  key: string | null;
  entry: StudioDurableSaveIntent | null;
  phase: "loading" | "ready" | "writing" | "error";
  error: string | null;
}
const empty: State = { key: null, entry: null, phase: "ready", error: null };
const message = (error: unknown) => error instanceof Error ? error.message : "기기 저장 대기 기록을 처리하지 못했습니다.";

/** Restored intents are reminders, never permission to automatically upload a recovered manuscript. */
export function useStudioDurableSaveIntent(scope?: StudioSaveIntentScope | null) {
  const key = scope ? studioSaveIntentScopeKey(scope) : null;
  const [state, setState] = useState<State>(empty);
  const generation = useRef({ value: 0 });
  const pending = useRef<{ key: string; promise: Promise<StudioDurableSaveIntent> } | null>(null);
  const ownerId = scope?.ownerId ?? null;
  const documentKey = scope?.documentKey ?? null;
  useEffect(() => {
    const lifetime = generation.current;
    const run = ++lifetime.value;
    if (key === null || documentKey === null) return;
    const currentScope = { ownerId, documentKey };
    setState({ key, entry: null, phase: "loading", error: null });
    const unsubscribe = subscribeStudioDurableSaveIntent((changed, entry) => {
      if (changed === key) setState({ key, entry, phase: "ready", error: null });
    });
    void boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.load(currentScope)).then((entry) => {
      if (run === generation.current.value) setState({ key, entry, phase: "ready", error: null });
    }).catch((error: unknown) => {
      if (run === generation.current.value) setState({ key, entry: null, phase: "error", error: message(error) });
    });
    return () => { lifetime.value++; unsubscribe(); };
  }, [documentKey, key, ownerId]);
  const current = state.key === key ? state : { ...empty, key, phase: "loading" as const };

  const remember = useCallback(async (serverRevision: number | null): Promise<void> => {
    if (documentKey === null || key === null) return;
    const run = ++generation.current.value;
    setState((previous) => ({ ...previous, key, phase: "writing", error: null }));
    try {
      const promise = studioDurableSaveIntentRepository.remember({ ownerId, documentKey }, serverRevision);
      pending.current = { key, promise };
      const entry = await boundStudioSaveIntentOperation(promise);
      if (pending.current?.promise === promise) pending.current = null;
      if (run === generation.current.value) setState({ key, entry, phase: "ready", error: null });
    } catch (error) {
      if (run === generation.current.value) setState((previous) => ({ ...previous, key, phase: "error", error: message(error) }));
    }
  }, [documentKey, key, ownerId]);
  const cancel = useCallback(async (): Promise<void> => {
    if (documentKey === null || key === null) return;
    const run = ++generation.current.value;
    try {
      const scope = { ownerId, documentKey };
      const entry = pending.current?.key === key
        ? await boundStudioSaveIntentOperation(pending.current.promise).catch(() => current.entry)
        : current.entry;
      if (!entry) return;
      const cleared = await boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.clear(scope, entry.id));
      if (pending.current?.key === key) pending.current = null;
      if (run !== generation.current.value) return;
      if (cleared) setState({ key, entry: null, phase: "ready", error: null });
      else {
        const entry = await boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.load(scope));
        if (run === generation.current.value) setState({ key, entry, phase: "ready", error: "새 저장 대기 기록은 보존했습니다." });
      }
    } catch (error) {
      if (run === generation.current.value) setState((previous) => ({ ...previous, phase: "error", error: message(error) }));
    }
  }, [current.entry, documentKey, key, ownerId]);
  return { ...current, enabled: key !== null, remember, cancel };
}
