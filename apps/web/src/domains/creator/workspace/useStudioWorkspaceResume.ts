import { useMemo, useSyncExternalStore } from "react";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { createWorkspaceResumeStore } from "./studio-workspace-resume-store";

export function useStudioWorkspaceResume(project: StudioProjectLibraryEntry | null, locale: "ko" | "en") {
  const store = useMemo(() => createWorkspaceResumeStore({
    project, locale,
    readStorage: () => window.localStorage,
    host: typeof window === "undefined" ? undefined : window,
  }), [project, locale]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, refresh: store.refresh };
}
