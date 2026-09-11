import { useCallback, useEffect, useState } from "react";

import {
  STUDIO_PROJECT_FEATURE_SUITE_UPDATED_EVENT,
  ensureStudioProjectFeatureSuite,
  updateStudioProjectFeatureSuite,
  type StudioProjectFeatureSuiteState,
  type StudioProjectFeatureSuiteUpdater,
} from "../studio-project-feature-suite-store";

export interface StudioProjectFeatureSuiteController {
  readonly state: StudioProjectFeatureSuiteState | null;
  readonly error: string | null;
  readonly update: (updater: StudioProjectFeatureSuiteUpdater) => StudioProjectFeatureSuiteState | null;
  readonly reload: () => void;
}

function storageError(locale: "ko" | "en"): string {
  return locale === "ko"
    ? "이 기기에서 프로젝트 기능 상태를 저장하지 못했습니다. 현재 화면의 변경 내용은 유지됩니다."
    : "Project feature state could not be stored on this device. Current edits remain on screen.";
}

function eventState(value: unknown, projectId: string): StudioProjectFeatureSuiteState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudioProjectFeatureSuiteState>;
  return candidate.schemaVersion === 1 && candidate.projectId === projectId
    ? candidate as StudioProjectFeatureSuiteState
    : null;
}

/** One UI controller for storyboard, quality, 3D, voice, template, analytics and automation state. */
export function useStudioProjectFeatureSuite(
  projectId: string,
  locale: "ko" | "en",
): StudioProjectFeatureSuiteController {
  const [state, setState] = useState<StudioProjectFeatureSuiteState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (typeof window === "undefined" || !projectId.trim()) return;
    try {
      setState(ensureStudioProjectFeatureSuite(window.localStorage, projectId));
      setError(null);
    } catch {
      setError(storageError(locale));
    }
  }, [locale, projectId]);

  useEffect(() => {
    reload();
    if (typeof window === "undefined") return undefined;

    const handleUpdate = (event: Event) => {
      const next = eventState((event as CustomEvent<unknown>).detail, projectId);
      if (!next) return;
      setState(next);
      setError(null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null || event.key.includes(encodeURIComponent(projectId))) reload();
    };

    window.addEventListener(STUDIO_PROJECT_FEATURE_SUITE_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_FEATURE_SUITE_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [projectId, reload]);

  const update = useCallback((updater: StudioProjectFeatureSuiteUpdater) => {
    if (typeof window === "undefined" || !projectId.trim()) return null;
    try {
      const next = updateStudioProjectFeatureSuite(
        window.localStorage,
        projectId,
        updater,
        window,
      );
      setState(next);
      setError(null);
      return next;
    } catch {
      setError(storageError(locale));
      return null;
    }
  }, [locale, projectId]);

  return Object.freeze({ state, error, update, reload });
}
