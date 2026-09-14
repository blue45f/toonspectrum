import { useEffect, useRef } from "react";

import type { StudioQuickAccessState } from "./studio-quick-access";
import type { StudioServerPersonalKitSnapshot } from "./studio-production/studio-production-server-client";

type PersonalKitModule = typeof import(
  "./studio-production/studio-personal-kit-quick-access"
);

interface UseStudioQuickAccessPersonalKitOptions {
  readonly userId: string | null;
  readonly ownerScope: string;
  readonly state: StudioQuickAccessState | null;
  readonly localRevision: number;
  readonly onAdoptRemote: (state: StudioQuickAccessState) => void | Promise<void>;
  readonly onStatus?: (message: string) => void;
}

const SAVE_DEBOUNCE_MS = 700;

export function useStudioQuickAccessPersonalKit({
  userId,
  ownerScope,
  state,
  localRevision,
  onAdoptRemote,
  onStatus,
}: UseStudioQuickAccessPersonalKitOptions): void {
  const moduleRef = useRef<PersonalKitModule | null>(null);
  const snapshotRef = useRef<StudioServerPersonalKitSnapshot | null>(null);
  const stateRef = useRef(state);
  const localRevisionRef = useRef(localRevision);
  const adoptRef = useRef(onAdoptRemote);
  const statusRef = useRef(onStatus);
  const generationRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTailRef = useRef<Promise<void>>(Promise.resolve());

  stateRef.current = state;
  localRevisionRef.current = localRevision;
  adoptRef.current = onAdoptRemote;
  statusRef.current = onStatus;

  const ready = userId !== null && state !== null;

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    snapshotRef.current = null;
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!ready) return () => controller.abort();
    const initialState = stateRef.current;
    if (!initialState) return () => controller.abort();
    const revisionAtStart = localRevisionRef.current;
    void (async () => {
      const module = await import(
        "./studio-production/studio-personal-kit-quick-access"
      );
      const result = await module.bootstrapStudioQuickAccessPersonalKit(
        initialState,
        controller.signal,
      );
      if (controller.signal.aborted || generationRef.current !== generation) return;
      moduleRef.current = module;
      snapshotRef.current = result.snapshot;
      const latest = stateRef.current;
      if (!latest) return;

      if (localRevisionRef.current !== revisionAtStart) {
        const saved = await module.saveStudioQuickAccessPersonalKit(
          result.snapshot,
          latest,
          controller.signal,
        );
        if (!controller.signal.aborted && generationRef.current === generation) {
          snapshotRef.current = saved;
          statusRef.current?.("빠른 액세스 변경을 Personal Kit에 동기화했습니다.");
        }
        return;
      }
      if (
        result.source === "server"
        && !module.studioQuickAccessStatesEqual(latest, result.state)
      ) {
        stateRef.current = result.state;
        await adoptRef.current(result.state);
        statusRef.current?.("다른 장치의 빠른 액세스 설정을 적용했습니다.");
      }
    })().catch((error: unknown) => {
      if (controller.signal.aborted || generationRef.current !== generation) return;
      console.warn("Studio Personal Kit Quick Access sync failed:", error);
      statusRef.current?.("Personal Kit에 연결하지 못해 이 장치의 설정을 계속 사용합니다.");
    });

    return () => controller.abort();
  }, [ownerScope, ready, userId]);

  useEffect(() => {
    if (!ready || localRevision <= 0) return undefined;
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    const generation = generationRef.current;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveTailRef.current = saveTailRef.current
        .catch(() => undefined)
        .then(async () => {
          if (generationRef.current !== generation) return;
          const module = moduleRef.current;
          const snapshot = snapshotRef.current;
          const latest = stateRef.current;
          if (!module || !snapshot || !latest) return;
          try {
            const saved = await module.saveStudioQuickAccessPersonalKit(
              snapshot,
              latest,
            );
            if (generationRef.current === generation) snapshotRef.current = saved;
          } catch (error) {
            if (generationRef.current !== generation) return;
            console.warn("Studio Personal Kit Quick Access save failed:", error);
            statusRef.current?.("Personal Kit 저장에 실패했지만 이 장치의 설정은 보존했습니다.");
          }
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [localRevision, ownerScope, ready, userId]);
}
