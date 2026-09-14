import { useEffect, useRef, useState } from "react";

import { pushRecentColor } from "./studio-color-utils";
import {
  createStudioRecentColorsOwnerToken,
  enqueueStudioRecentColorsWrite,
  isStudioRecentColorsOwnerActive,
  publishStudioRecentColorsSnapshot,
  registerStudioRecentColorsOwner,
  waitForStudioRecentColorsPersistenceIdle,
  type StudioRecentColorsOwner,
} from "./studio-recent-colors-bridge";

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
  const [ownerToken] = useState(createStudioRecentColorsOwnerToken);
  const colorsRef = useRef(recentColors);
  const revisionRef = useRef(0);
  const loadedRef = useRef(false);
  const loadRef = useRef<Promise<void> | null>(null);
  const pendingChangesRef = useRef<Change[]>([]);
  const writeTailRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const ownerActionsRef = useRef<StudioRecentColorsOwner | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /** Updates local state and publishes only when this hook still owns the bridge. */
  function publish(colors: string[]): void {
    colorsRef.current = colors;
    publishStudioRecentColorsSnapshot(ownerToken, colors);
    if (mountedRef.current) setRecentColors(colors);
  }

  /** Hydrates once and ignores completion from an owner generation that has been replaced. */
  function load(): Promise<void> {
    if (loadedRef.current) return Promise.resolve();
    loadRef.current ??= (async () => {
      await waitForStudioRecentColorsPersistenceIdle();
      if (!isStudioRecentColorsOwnerActive(ownerToken)) return;
      const repository = await acquireRepository();
      const stored = await repository.loadRecentColors();
      if (!isStudioRecentColorsOwnerActive(ownerToken)) return;
      // Replay intent, not an old optimistic snapshot: clear wins over a late load,
      // while a first color selection retains previously stored recent colors.
      const next = pendingChangesRef.current.reduce((colors, change) => change(colors), stored);
      pendingChangesRef.current = [];
      loadedRef.current = true;
      publish(next);
    })().catch((error: unknown) => {
      if (isStudioRecentColorsOwnerActive(ownerToken)) loadRef.current = null;
      throw error;
    });
    return loadRef.current;
  }

  /** Reports a persistence problem only for the currently mounted owner. */
  function reportUnavailable(): void {
    if (mountedRef.current && isStudioRecentColorsOwnerActive(ownerToken)) {
      onPersistenceUnavailable();
    }
  }

  /** Applies one intent optimistically, then persists it in owner and revision order. */
  function update(change: Change): void {
    const next = change(colorsRef.current);
    if (next === colorsRef.current) return;
    const revision = ++revisionRef.current;
    if (!loadedRef.current) pendingChangesRef.current.push(change);
    publish(next);
    const write = writeTailRef.current.then(async () => {
      await load();
      if (
        !isStudioRecentColorsOwnerActive(ownerToken) ||
        revision !== revisionRef.current
      ) return;
      await enqueueStudioRecentColorsWrite(ownerToken, async () => {
        if (
          !isStudioRecentColorsOwnerActive(ownerToken) ||
          revision !== revisionRef.current
        ) return;
        const repository = await acquireRepository();
        if (
          !isStudioRecentColorsOwnerActive(ownerToken) ||
          revision !== revisionRef.current
        ) return;
        await repository.saveRecentColors(colorsRef.current);
      });
    });
    writeTailRef.current = write.catch(reportUnavailable);
  }

  const ensureRecentColorsLoaded = () => { void load().catch(reportUnavailable); };
  const rememberColor = (color: string) =>
    update((colors) => pushRecentColor(colors, color));
  const clearRecentColors = () => update(() => []);

  // Keep render pure: the registered owner observes callbacks only after their render commits.
  useEffect(() => {
    ownerActionsRef.current = {
      ensureRecentColorsLoaded,
      rememberColor,
      clearRecentColors,
    };
  });

  useEffect(() => registerStudioRecentColorsOwner(ownerToken, {
    ensureRecentColorsLoaded: () => ownerActionsRef.current?.ensureRecentColorsLoaded(),
    rememberColor: (color) => ownerActionsRef.current?.rememberColor(color),
    clearRecentColors: () => ownerActionsRef.current?.clearRecentColors(),
  }), [ownerToken]);

  return {
    recentColors,
    ensureRecentColorsLoaded,
    rememberColor,
    clearRecentColors,
  };
}
