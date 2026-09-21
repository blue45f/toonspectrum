import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { pushRecentColor } from "./studio-color-utils";
import {
  createStudioRecentColorsOwnerToken,
  enqueueStudioRecentColorsWrite,
  isStudioRecentColorsOwnerActive,
  publishStudioRecentColorsSnapshot,
  publishStudioRecentColorsStatus,
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
  ownerScope,
  acquireRepository = acquireRecentColorRepository,
}: {
  onPersistenceUnavailable: () => void;
  ownerScope?: string;
  acquireRepository?: () => Promise<RecentColorRepository>;
}) {
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const ownerToken = useMemo(() => createStudioRecentColorsOwnerToken(ownerScope), [ownerScope]);
  const previousOwnerRef = useRef(ownerToken);
  const colorsRef = useRef(recentColors);
  const revisionRef = useRef(0);
  const loadedRef = useRef(false);
  const loadRef = useRef<Promise<void> | null>(null);
  const pendingChangesRef = useRef<Change[]>([]);
  const writeTailRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const ownerActionsRef = useRef<StudioRecentColorsOwner | null>(null);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useLayoutEffect(() => {
    if (previousOwnerRef.current === ownerToken) return;
    previousOwnerRef.current = ownerToken;
    colorsRef.current = [];
    revisionRef.current += 1;
    loadedRef.current = false;
    loadRef.current = null;
    pendingChangesRef.current = [];
    writeTailRef.current = Promise.resolve();
    setRecentColors([]);
  }, [ownerToken]);

  /** Updates local state and publishes only when this hook still owns the bridge. */
  function publish(colors: string[]): void {
    if (!mountedRef.current || !isStudioRecentColorsOwnerActive(ownerToken)) return;
    colorsRef.current = colors;
    publishStudioRecentColorsSnapshot(ownerToken, colors);
    if (mountedRef.current) setRecentColors(colors);
  }

  /** Hydrates once and ignores completion from an owner generation that has been replaced. */
  function load(): Promise<void> {
    if (loadedRef.current) return Promise.resolve();
    loadRef.current ??= (async () => {
      publishStudioRecentColorsStatus(ownerToken, "loading");
      await waitForStudioRecentColorsPersistenceIdle();
      if (!isStudioRecentColorsOwnerActive(ownerToken)) return;
      const repository = await acquireRepository();
      const stored = await (ownerScope ? repository.loadRecentColors(ownerScope) : repository.loadRecentColors());
      if (!isStudioRecentColorsOwnerActive(ownerToken)) return;
      // Replay intent, not an old optimistic snapshot: clear wins over a late load,
      // while a first color selection retains previously stored recent colors.
      const hasPendingChanges = pendingChangesRef.current.length > 0;
      const next = pendingChangesRef.current.reduce((colors, change) => change(colors), stored);
      pendingChangesRef.current = [];
      loadedRef.current = true;
      publish(next);
      publishStudioRecentColorsStatus(ownerToken, hasPendingChanges ? "saving" : "saved");
    })().catch((error: unknown) => {
      if (isStudioRecentColorsOwnerActive(ownerToken)) loadRef.current = null;
      throw error;
    });
    return loadRef.current;
  }

  /** Reports a persistence problem only for the currently mounted owner. */
  function reportUnavailable(): void {
    if (mountedRef.current && isStudioRecentColorsOwnerActive(ownerToken)) {
      publishStudioRecentColorsStatus(ownerToken, "session-only");
      onPersistenceUnavailable();
    }
  }

  /** Applies one intent optimistically, then persists it in owner and revision order. */
  function update(change: Change): void {
    if (!mountedRef.current || !isStudioRecentColorsOwnerActive(ownerToken)) return;
    const next = change(colorsRef.current);
    if (next === colorsRef.current) return;
    const revision = ++revisionRef.current;
    if (!loadedRef.current) pendingChangesRef.current.push(change);
    publish(next);
    publishStudioRecentColorsStatus(ownerToken, "saving");
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
        await (ownerScope ? repository.saveRecentColors(colorsRef.current, ownerScope) : repository.saveRecentColors(colorsRef.current));
        if (revision === revisionRef.current) publishStudioRecentColorsStatus(ownerToken, "saved");
      });
    });
    writeTailRef.current = write.catch(reportUnavailable);
  }

  const ensureRecentColorsLoaded = () => { void load().catch(reportUnavailable); };
  const rememberColor = (color: string) =>
    update((colors) => pushRecentColor(colors, color));
  const clearRecentColors = () => update(() => []);
  const retryPersistence = () => update((colors) => [...colors]);

  // Keep render pure: the registered owner observes callbacks only after their render commits.
  useLayoutEffect(() => {
    ownerActionsRef.current = {
      ensureRecentColorsLoaded,
      rememberColor,
      clearRecentColors,
      retryPersistence,
    };
  });

  useLayoutEffect(() => registerStudioRecentColorsOwner(ownerToken, {
    ensureRecentColorsLoaded: () => ownerActionsRef.current?.ensureRecentColorsLoaded(),
    rememberColor: (color) => ownerActionsRef.current?.rememberColor(color),
    clearRecentColors: () => ownerActionsRef.current?.clearRecentColors(),
    retryPersistence: () => ownerActionsRef.current?.retryPersistence?.(),
  }), [ownerToken]);

  return {
    recentColors,
    ensureRecentColorsLoaded,
    rememberColor,
    clearRecentColors,
  };
}
