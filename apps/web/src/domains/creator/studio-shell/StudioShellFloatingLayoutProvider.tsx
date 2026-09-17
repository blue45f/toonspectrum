import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
  STUDIO_SHELL_FLOATING_SURFACE_IDS,
  applyStudioShellFloatingPreset,
  encodeStudioShellFloatingVisibility,
  hideAllStudioShellFloatingSurfaces,
  isStudioShellFloatingSurfaceVisible,
  normalizeStudioShellFloatingVisibility,
  setStudioShellFloatingAutoHideDuringStroke,
  setStudioShellFloatingSurfaceVisible,
  showAllStudioShellFloatingSurfaces,
  studioShellFloatingVisibilityEqual,
  type StudioShellFloatingPresetId,
  type StudioShellFloatingSurfaceId,
  type StudioShellFloatingVisibilityId,
  type StudioShellFloatingVisibilityState,
} from "./studio-shell-floating-layout";

import {
  StudioShellFloatingLayoutContext,
  createStudioShellFloatingResetRevisions,
  type StudioShellFloatingLayoutRuntime,
  type StudioShellFloatingVisibilityAuthority,
} from "./studio-shell-floating-layout-context";

import type {
  StudioShellFloatingVisibilityRepository,
} from "./studio-shell-floating-visibility-sqlite";

const SESSION_KEY = "toonspectrum:studio:shell-floating-visibility:v1";

function browserSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function loadSessionVisibility(): StudioShellFloatingVisibilityState {
  const storage = browserSessionStorage();
  if (!storage) return DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY;
    return normalizeStudioShellFloatingVisibility(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY;
  }
}

function saveSessionVisibility(state: StudioShellFloatingVisibilityState): boolean {
  const storage = browserSessionStorage();
  if (!storage) return false;
  try {
    storage.setItem(SESSION_KEY, encodeStudioShellFloatingVisibility(state));
    return true;
  } catch {
    return false;
  }
}

async function acquireRepositoryDeferred(): Promise<StudioShellFloatingVisibilityRepository> {
  const { acquireProductStudioShellFloatingVisibilityRepository } = await import(
    "./studio-shell-floating-visibility-sqlite"
  );
  return acquireProductStudioShellFloatingVisibilityRepository();
}

export function StudioShellFloatingLayoutProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [visibility, setVisibilityState] = useState(loadSessionVisibility);
  const [authority, setAuthority] =
    useState<StudioShellFloatingVisibilityAuthority>("checking");
  const [failure, setFailure] =
    useState<StudioShellFloatingLayoutRuntime["failure"]>(null);
  const [resetRevisions, setResetRevisions] = useState(createStudioShellFloatingResetRevisions);
  const liveVisibility = useRef(visibility);
  const localGeneration = useRef(0);
  const repositoryRef =
    useRef<Promise<StudioShellFloatingVisibilityRepository> | null>(null);
  liveVisibility.current = visibility;

  const repository = useCallback(() => {
    repositoryRef.current ??= acquireRepositoryDeferred().catch((cause: unknown) => {
      repositoryRef.current = null;
      throw cause;
    });
    return repositoryRef.current;
  }, []);

  useEffect(() => {
    let disposed = false;
    const generationAtStart = localGeneration.current;
    void repository()
      .then((target) => target.load())
      .then((result) => {
        if (disposed) return;
        setFailure(result.failure);
        setAuthority(result.failure ? "session-only" : "sqlite-opfs");
        if (!result.persisted || generationAtStart !== localGeneration.current) return;
        liveVisibility.current = result.state;
        setVisibilityState(result.state);
        saveSessionVisibility(result.state);
      })
      .catch(() => {
        if (disposed) return;
        setAuthority("session-only");
        setFailure("storage-unavailable");
      });
    return () => {
      disposed = true;
    };
  }, [repository]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    root.setAttribute(
      "data-studio-shell-stroke-auto-hide",
      visibility.autoHideDuringStroke ? "true" : "false",
    );
    return () => root.removeAttribute("data-studio-shell-stroke-auto-hide");
  }, [visibility.autoHideDuringStroke]);

  const commit = useCallback((next: StudioShellFloatingVisibilityState) => {
    const normalized = normalizeStudioShellFloatingVisibility(next);
    if (studioShellFloatingVisibilityEqual(liveVisibility.current, normalized)) return;
    localGeneration.current += 1;
    liveVisibility.current = normalized;
    setVisibilityState(normalized);
    if (!saveSessionVisibility(normalized)) {
      setAuthority("session-only");
      setFailure("storage-unavailable");
    }
    void repository()
      .then((target) => target.save(normalized))
      .then((result) => {
        setAuthority(result.status === "persisted" ? "sqlite-opfs" : "session-only");
        setFailure(result.failure);
      })
      .catch(() => {
        setAuthority("session-only");
        setFailure("storage-unavailable");
      });
  }, [repository]);

  const setVisible = useCallback((
    id: StudioShellFloatingVisibilityId,
    visible: boolean,
  ) => {
    commit(setStudioShellFloatingSurfaceVisible(liveVisibility.current, id, visible));
  }, [commit]);

  const toggleVisible = useCallback((id: StudioShellFloatingVisibilityId) => {
    setVisible(id, !isStudioShellFloatingSurfaceVisible(liveVisibility.current, id));
  }, [setVisible]);

  const setAutoHideDuringStroke = useCallback((enabled: boolean) => {
    commit(setStudioShellFloatingAutoHideDuringStroke(liveVisibility.current, enabled));
  }, [commit]);

  const applyPreset = useCallback((preset: StudioShellFloatingPresetId) => {
    commit(applyStudioShellFloatingPreset(preset, liveVisibility.current));
  }, [commit]);

  const showAll = useCallback(() => {
    commit(showAllStudioShellFloatingSurfaces(liveVisibility.current));
  }, [commit]);

  const hideAll = useCallback(() => {
    commit(hideAllStudioShellFloatingSurfaces(liveVisibility.current));
  }, [commit]);

  const resetSurface = useCallback((id: StudioShellFloatingSurfaceId) => {
    setResetRevisions((current) => ({
      ...current,
      [id]: current[id] + 1,
    }));
  }, []);

  const resetAllSurfaces = useCallback(() => {
    setResetRevisions((current) => Object.fromEntries(
      STUDIO_SHELL_FLOATING_SURFACE_IDS.map((id) => [id, current[id] + 1]),
    ) as Record<StudioShellFloatingSurfaceId, number>);
  }, []);

  const runtime = useMemo<StudioShellFloatingLayoutRuntime>(() => ({
    visibility,
    authority,
    failure,
    resetRevisions,
    isVisible: (id) => isStudioShellFloatingSurfaceVisible(visibility, id),
    setVisible,
    toggleVisible,
    setAutoHideDuringStroke,
    applyPreset,
    showAll,
    hideAll,
    resetSurface,
    resetAllSurfaces,
  }), [
    applyPreset,
    authority,
    failure,
    hideAll,
    resetAllSurfaces,
    resetRevisions,
    resetSurface,
    setAutoHideDuringStroke,
    setVisible,
    showAll,
    toggleVisible,
    visibility,
  ]);

  return (
    <StudioShellFloatingLayoutContext value={runtime}>
      {children}
    </StudioShellFloatingLayoutContext>
  );
}
