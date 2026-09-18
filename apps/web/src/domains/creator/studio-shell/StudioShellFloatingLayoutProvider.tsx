import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  setStudioShellFloatingAutoHideWhileDrawing,
  setStudioShellFloatingSurfaceVisible,
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
import {
  studioWorkspaceArrangingSnapshot,
  subscribeStudioWorkspaceArranging,
} from "../studio-workspace-arrangement";

import type {
  StudioShellFloatingVisibilityRepository,
} from "./studio-shell-floating-visibility-sqlite";
import {
  STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS,
  isStudioShellDrawingSurfaceTarget,
} from "./studio-shell-drawing-auto-hide";

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
  const [drawingAutoHideActive, setDrawingAutoHideActive] = useState(false);
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [mountedSurfaceIds, setMountedSurfaceIds] =
    useState<readonly StudioShellFloatingSurfaceId[]>([]);
  const arranging = useSyncExternalStore(
    subscribeStudioWorkspaceArranging,
    studioWorkspaceArrangingSnapshot,
    () => false,
  );
  const drawingPointerId = useRef<number | null>(null);
  const drawingReleaseTimer = useRef<number | null>(null);
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
    const clearReleaseTimer = (): void => {
      if (drawingReleaseTimer.current === null) return;
      window.clearTimeout(drawingReleaseTimer.current);
      drawingReleaseTimer.current = null;
    };
    const stopImmediately = (): void => {
      clearReleaseTimer();
      drawingPointerId.current = null;
      setDrawingAutoHideActive(false);
    };
    if (!visibility.autoHideWhileDrawing || arranging) {
      stopImmediately();
      return undefined;
    }
    const start = (event: PointerEvent): void => {
      if (
        event.pointerType !== "pen"
        || event.isPrimary === false
        || event.button !== 0
        || !isStudioShellDrawingSurfaceTarget(event.target)
      ) return;
      clearReleaseTimer();
      drawingPointerId.current = event.pointerId;
      setDrawingAutoHideActive(true);
    };
    const finish = (event: PointerEvent): void => {
      if (drawingPointerId.current !== event.pointerId) return;
      drawingPointerId.current = null;
      clearReleaseTimer();
      drawingReleaseTimer.current = window.setTimeout(() => {
        drawingReleaseTimer.current = null;
        setDrawingAutoHideActive(false);
      }, STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS);
    };
    const visibilityChange = (): void => {
      if (document.visibilityState !== "visible") stopImmediately();
    };
    window.addEventListener("pointerdown", start, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", stopImmediately);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      window.removeEventListener("pointerdown", start, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", stopImmediately);
      document.removeEventListener("visibilitychange", visibilityChange);
      clearReleaseTimer();
      drawingPointerId.current = null;
    };
  }, [arranging, visibility.autoHideWhileDrawing]);

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

  const setSurfaceMounted = useCallback((
    id: StudioShellFloatingSurfaceId,
    mounted: boolean,
  ) => {
    setMountedSurfaceIds((current) => {
      const next = new Set(current);
      if (mounted) next.add(id);
      else next.delete(id);
      const ordered = STUDIO_SHELL_FLOATING_SURFACE_IDS.filter((candidate) =>
        next.has(candidate)
      );
      if (
        ordered.length === current.length
        && ordered.every((candidate, index) => candidate === current[index])
      ) return current;
      return ordered;
    });
  }, []);

  const setVisible = useCallback((
    id: StudioShellFloatingVisibilityId,
    visible: boolean,
  ) => {
    setFocusModeActive(false);
    commit(setStudioShellFloatingSurfaceVisible(liveVisibility.current, id, visible));
  }, [commit]);

  const toggleVisible = useCallback((id: StudioShellFloatingVisibilityId) => {
    setVisible(id, !isStudioShellFloatingSurfaceVisible(liveVisibility.current, id));
  }, [setVisible]);

  const setAutoHideWhileDrawing = useCallback((enabled: boolean) => {
    commit(setStudioShellFloatingAutoHideWhileDrawing(liveVisibility.current, enabled));
  }, [commit]);

  const enterFocusMode = useCallback(() => {
    setFocusModeActive(true);
  }, []);

  const exitFocusMode = useCallback(() => {
    setFocusModeActive(false);
  }, []);

  const applyPreset = useCallback((preset: StudioShellFloatingPresetId) => {
    setFocusModeActive(false);
    commit(applyStudioShellFloatingPreset(preset, liveVisibility.current));
  }, [commit]);

  const showAll = useCallback(() => {
    setFocusModeActive(false);
    commit(applyStudioShellFloatingPreset("all", liveVisibility.current));
  }, [commit]);

  const hideAll = useCallback(() => {
    setFocusModeActive(false);
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
    autoHideWhileDrawing: visibility.autoHideWhileDrawing,
    drawingAutoHideActive,
    focusModeActive,
    mountedSurfaceIds,
    authority,
    failure,
    resetRevisions,
    isVisible: (id) => focusModeActive
      ? id === "workspace-switcher"
      : isStudioShellFloatingSurfaceVisible(visibility, id),
    isConfiguredVisible: (id) => isStudioShellFloatingSurfaceVisible(visibility, id),
    isSurfaceMounted: (id) => mountedSurfaceIds.includes(id),
    setSurfaceMounted,
    setVisible,
    toggleVisible,
    setAutoHideWhileDrawing,
    enterFocusMode,
    exitFocusMode,
    applyPreset,
    showAll,
    hideAll,
    resetSurface,
    resetAllSurfaces,
  }), [
    applyPreset,
    authority,
    drawingAutoHideActive,
    enterFocusMode,
    exitFocusMode,
    failure,
    focusModeActive,
    hideAll,
    mountedSurfaceIds,
    resetAllSurfaces,
    resetRevisions,
    resetSurface,
    setAutoHideWhileDrawing,
    setSurfaceMounted,
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
