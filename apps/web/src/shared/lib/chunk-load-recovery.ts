const CHUNK_RELOAD_GUARD_PREFIX = "chunk-reload:";
export const CHUNK_RELOAD_FLAG = "toonspectrum:chunk-reload-attempted";
const CHUNK_RELOAD_OWNER = `${CHUNK_RELOAD_FLAG}:owner`;

function chunkReloadGuardKey(chunkId: string): string {
  return `${CHUNK_RELOAD_GUARD_PREFIX}${chunkId}`;
}

function hasReloadGuard(key: string): boolean {
  try {
    return globalThis.sessionStorage.getItem(key) !== null;
  } catch {
    // Storage-blocked and non-browser environments must never enter a reload loop.
    return true;
  }
}

function armReloadGuard(key: string, value = "1"): boolean {
  try {
    globalThis.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function clearReloadGuard(key: string): boolean {
  try {
    globalThis.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function hasAttemptedChunkReload(): boolean {
  try {
    return globalThis.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1";
  } catch {
    // Without durable storage an automatic reload cannot be bounded, so fail closed.
    return true;
  }
}

/** Automatic reloads are safe only when this records a durable, unowned session guard. */
export function markChunkReloadAttempted(): boolean {
  // ErrorBoundary cannot identify the failed chunk. Keep its explicit session-wide guard sticky,
  // even if this call replaces an earlier chunk-owned attempt whose import later succeeds.
  if (!armReloadGuard(CHUNK_RELOAD_OWNER, "explicit") && !clearReloadGuard(CHUNK_RELOAD_OWNER)) return false;
  return armReloadGuard(CHUNK_RELOAD_FLAG);
}

function clearRecoveredChunkGuard(guardKey: string): void {
  clearReloadGuard(guardKey);
  try {
    if (globalThis.sessionStorage.getItem(CHUNK_RELOAD_OWNER) !== guardKey) return;
    // Clear ownership first. If either storage operation fails, the remaining global guard must
    // continue blocking reloads rather than letting an unrelated import claim this recovery.
    globalThis.sessionStorage.removeItem(CHUNK_RELOAD_OWNER);
    globalThis.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // Loading successfully still returns the module when storage has become unavailable.
  }
}

/**
 * Recovers a stale deployment chunk once, including chunks loaded from event handlers/effects
 * rather than React.lazy. The guard remains armed until that exact chunk loads successfully,
 * so unrelated imports cannot enable reload loops. Storage-blocked or non-browser environments
 * fail closed and preserve the original import error.
 */
export async function loadChunkWithReloadRecovery<T>(
  load: () => Promise<T>,
  chunkId: string
): Promise<T> {
  const guardKey = chunkReloadGuardKey(chunkId);
  try {
    const module = await load();
    clearRecoveredChunkGuard(guardKey);
    return module;
  } catch (error) {
    if (
      hasReloadGuard(guardKey)
      || hasAttemptedChunkReload()
      || !armReloadGuard(guardKey)
    ) {
      throw error;
    }
    if (!armReloadGuard(CHUNK_RELOAD_OWNER, guardKey)) {
      clearReloadGuard(guardKey);
      throw error;
    }
    if (!armReloadGuard(CHUNK_RELOAD_FLAG)) {
      clearReloadGuard(guardKey);
      clearReloadGuard(CHUNK_RELOAD_OWNER);
      throw error;
    }
    const reload = globalThis.location?.reload;
    if (typeof reload !== "function") {
      clearReloadGuard(guardKey);
      throw error;
    }
    reload.call(globalThis.location);
    return await new Promise<never>(() => {
      // Keep the current Suspense or in-panel loading state mounted until navigation replaces it.
      // In Studio, a cancelled unsaved-work prompt intentionally leaves this request pending: the
      // in-memory document is more valuable than replacing the editor with a route error screen.
    });
  }
}
