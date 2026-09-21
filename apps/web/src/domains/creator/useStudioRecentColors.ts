import { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  applyStudioRecentColorChange, emptyStudioRecentColorIntents,
  reduceStudioRecentColorIntents, replayStudioRecentColorIntents,
  type StudioRecentColorChange,
} from "./color/studio-recent-color-intents";
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
  const pendingChangesRef = useRef(emptyStudioRecentColorIntents());
  const writerRef = useRef<{ token: symbol; task: Promise<void> } | null>(null);
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
    pendingChangesRef.current = emptyStudioRecentColorIntents();
    writerRef.current = null;
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
      const hasPendingChanges = pendingChangesRef.current.cleared || pendingChangesRef.current.colors.length > 0;
      const next = replayStudioRecentColorIntents(stored, pendingChangesRef.current);
      pendingChangesRef.current = emptyStudioRecentColorIntents();
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

  /** One active write plus a latest-value follow-up; failures wait for a new user intent. */
  function scheduleWrite(): void {
    if (writerRef.current?.token === ownerToken) return;
    const writer = { token: ownerToken, task: Promise.resolve() };
    writerRef.current = writer;
    writer.task = Promise.resolve().then(async () => {
      await load();
      while (mountedRef.current && isStudioRecentColorsOwnerActive(ownerToken)) {
        const revision = revisionRef.current;
        await enqueueStudioRecentColorsWrite(ownerToken, async () => {
          if (!isStudioRecentColorsOwnerActive(ownerToken) || revision !== revisionRef.current) return;
          const repository = await acquireRepository();
          if (!isStudioRecentColorsOwnerActive(ownerToken) || revision !== revisionRef.current) return;
          const colors = colorsRef.current;
          await (ownerScope ? repository.saveRecentColors(colors, ownerScope) : repository.saveRecentColors(colors));
          if (revision === revisionRef.current) publishStudioRecentColorsStatus(ownerToken, "saved");
        });
        if (revision === revisionRef.current) return;
      }
    }).catch(reportUnavailable).finally(() => {
      if (writerRef.current === writer) writerRef.current = null;
    });
  }

  /** A bounded intent summary preserves clear/remember ordering across late hydration. */
  function update(change: StudioRecentColorChange): void {
    if (!mountedRef.current || !isStudioRecentColorsOwnerActive(ownerToken)) return;
    const next = applyStudioRecentColorChange(colorsRef.current, change);
    if (next === colorsRef.current) return;
    revisionRef.current += 1;
    if (!loadedRef.current) pendingChangesRef.current = reduceStudioRecentColorIntents(pendingChangesRef.current, change);
    publish(next);
    publishStudioRecentColorsStatus(ownerToken, "saving");
    scheduleWrite();
  }

  const ensureRecentColorsLoaded = () => { void load().catch(reportUnavailable); };
  const rememberColor = (color: string) => update({ type: "remember", color });
  const clearRecentColors = () => update({ type: "clear" });
  const retryPersistence = () => update({ type: "retry" });

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
