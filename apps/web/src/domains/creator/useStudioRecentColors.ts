import { useEffect, useRef, useState } from "react";

import { pushRecentColor } from "./studio-color-utils";

import type { StudioUiPreferencesRepository } from "./studio-ui-preferences-sqlite";

type RecentColorRepository = Pick<StudioUiPreferencesRepository, "loadRecentColors" | "saveRecentColors">;
type Change = (colors: string[]) => string[];

async function acquireRecentColorRepository(): Promise<RecentColorRepository> {
  const module = await import("./studio-ui-preferences-sqlite");
  return module.acquireProductStudioUiPreferencesRepository();
}

/** One UI owner for the existing SQLite recent-colors key, including the History palette. */
export function useStudioRecentColors({
  onPersistenceUnavailable,
  acquireRepository = acquireRecentColorRepository,
}: {
  onPersistenceUnavailable: () => void;
  acquireRepository?: () => Promise<RecentColorRepository>;
}) {
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const colorsRef = useRef(recentColors);
  const revisionRef = useRef(0);
  const loadedRef = useRef(false);
  const loadRef = useRef<Promise<void> | null>(null);
  const pendingChangesRef = useRef<Change[]>([]);
  const writeTailRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function publish(colors: string[]) {
    colorsRef.current = colors;
    if (mountedRef.current) setRecentColors(colors);
  }

  function load(): Promise<void> {
    if (loadedRef.current) return Promise.resolve();
    loadRef.current ??= acquireRepository()
      .then((repository) => repository.loadRecentColors())
      .then((stored) => {
        // Replay intent, not an old optimistic snapshot: clear wins over a late load,
        // while a first color selection retains previously stored recent colors.
        const next = pendingChangesRef.current.reduce((colors, change) => change(colors), stored);
        pendingChangesRef.current = [];
        loadedRef.current = true;
        publish(next);
      })
      .catch((error: unknown) => {
        loadRef.current = null;
        throw error;
      });
    return loadRef.current;
  }

  function reportUnavailable() {
    if (mountedRef.current) onPersistenceUnavailable();
  }

  function update(change: Change) {
    const next = change(colorsRef.current);
    if (next === colorsRef.current) return;
    const revision = ++revisionRef.current;
    if (!loadedRef.current) pendingChangesRef.current.push(change);
    publish(next);
    const write = writeTailRef.current.then(async () => {
      await load();
      // A newer user intent supersedes queued work; an already started write is
      // awaited before the next one, so it can never resurrect colors after clear.
      if (revision !== revisionRef.current) return;
      const repository = await acquireRepository();
      if (revision !== revisionRef.current) return;
      await repository.saveRecentColors(colorsRef.current);
    });
    writeTailRef.current = write.catch(reportUnavailable);
  }

  return {
    recentColors,
    ensureRecentColorsLoaded: () => { void load().catch(reportUnavailable); },
    rememberColor: (color: string) => update((colors) => pushRecentColor(colors, color)),
    clearRecentColors: () => update(() => []),
  };
}
