import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  appendStudioProductionAudit,
  createStudioProductionWorkspace,
  StudioProductionWorkspaceSchema,
  type StudioProductionScope,
  type StudioProductionWorkspace,
} from "./studio-production-model";
import {
  createStudioProductionSqlitePersistence,
  type StudioProductionPersistenceRepository,
  type StudioProductionPersistenceResult,
} from "./studio-production-sqlite-persistence";

type WorkspaceListener = () => void;
type WorkspaceUpdater = (workspace: StudioProductionWorkspace) => StudioProductionWorkspace;

export interface StudioProductionPersistenceState {
  readonly phase: "idle" | "loading" | "saved" | "memory" | "unavailable";
  readonly persisted: boolean;
  readonly warning: string | null;
  readonly savedAt: string | null;
}

const IDLE_PERSISTENCE_STATE: StudioProductionPersistenceState = Object.freeze({
  phase: "idle",
  persisted: false,
  warning: null,
  savedAt: null,
});

const workspaceByScope = new Map<string, StudioProductionWorkspace>();
const scopeByKey = new Map<string, StudioProductionScope>();
const listenersByScope = new Map<string, Set<WorkspaceListener>>();
const awaitingRemoteScopes = new Set<string>();
const mutationRevisionByScope = new Map<string, number>();
const hydrationByScope = new Map<string, Promise<void>>();
const persistByScope = new Map<string, Promise<void>>();
const persistenceByScope = new Map<string, StudioProductionPersistenceState>();

let persistenceRepository: StudioProductionPersistenceRepository =
  createStudioProductionSqlitePersistence();

type ProductionChannelMessage =
  | { readonly kind: "request"; readonly scopeKey: string }
  | { readonly kind: "workspace"; readonly scopeKey: string; readonly workspace: unknown };

let productionChannel: BroadcastChannel | null | undefined;

function emit(scopeKey: string): void {
  for (const listener of listenersByScope.get(scopeKey) ?? []) listener();
}

function revision(scopeKey: string): number {
  return mutationRevisionByScope.get(scopeKey) ?? 0;
}

function advanceRevision(scopeKey: string): number {
  const next = revision(scopeKey) + 1;
  mutationRevisionByScope.set(scopeKey, next);
  return next;
}

function setPersistenceState(
  scopeKey: string,
  state: StudioProductionPersistenceState,
): void {
  const current = persistenceByScope.get(scopeKey) ?? IDLE_PERSISTENCE_STATE;
  if (
    current.phase === state.phase
    && current.persisted === state.persisted
    && current.warning === state.warning
    && current.savedAt === state.savedAt
  ) {
    return;
  }
  persistenceByScope.set(scopeKey, Object.freeze(state));
  emit(scopeKey);
}

function stateFromPersistenceResult(
  result: StudioProductionPersistenceResult,
  savedAt: string | null,
): StudioProductionPersistenceState {
  if (result.backend === "sqlite") {
    return {
      phase: result.persisted ? "saved" : "idle",
      persisted: result.persisted,
      warning: result.warning ?? null,
      savedAt: result.persisted ? savedAt : null,
    };
  }
  return {
    phase: result.backend,
    persisted: false,
    warning: result.warning ?? "SQLite/OPFS에 저장하지 못했습니다.",
    savedAt: null,
  };
}

function broadcastWorkspace(workspace: StudioProductionWorkspace): void {
  try {
    ensureProductionChannel()?.postMessage({
      kind: "workspace",
      scopeKey: workspace.scopeKey,
      workspace,
    } satisfies ProductionChannelMessage);
  } catch {
    // SQLite/OPFS and the same-tab copy remain usable when BroadcastChannel is unavailable.
  }
}

function ensureProductionChannel(): BroadcastChannel | null {
  if (productionChannel !== undefined) return productionChannel;
  if (typeof globalThis.BroadcastChannel !== "function") {
    productionChannel = null;
    return null;
  }
  const channel = new BroadcastChannel("toonstudio-production-command-center-v1");
  channel.addEventListener("message", (event: MessageEvent<ProductionChannelMessage>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || typeof message.scopeKey !== "string") return;
    if (message.kind === "request") {
      const workspace = workspaceByScope.get(message.scopeKey);
      if (workspace) channel.postMessage({ kind: "workspace", scopeKey: message.scopeKey, workspace });
      return;
    }
    if (message.kind !== "workspace") return;
    const parsed = StudioProductionWorkspaceSchema.safeParse(message.workspace);
    if (!parsed.success || parsed.data.scopeKey !== message.scopeKey) return;
    const current = workspaceByScope.get(message.scopeKey);
    if (
      !awaitingRemoteScopes.has(message.scopeKey)
      && current
      && current.updatedAt >= parsed.data.updatedAt
    ) {
      return;
    }
    awaitingRemoteScopes.delete(message.scopeKey);
    workspaceByScope.set(message.scopeKey, parsed.data);
    advanceRevision(message.scopeKey);
    emit(message.scopeKey);
    const scope = scopeByKey.get(message.scopeKey);
    if (scope) schedulePersistence(scope);
  });
  productionChannel = channel;
  return channel;
}

function ensureSeed(scope: StudioProductionScope): StudioProductionWorkspace {
  scopeByKey.set(scope.key, scope);
  ensureProductionChannel();
  const existing = workspaceByScope.get(scope.key);
  if (existing) return existing;
  const created = createStudioProductionWorkspace(scope);
  workspaceByScope.set(scope.key, created);
  awaitingRemoteScopes.add(scope.key);
  try {
    productionChannel?.postMessage({ kind: "request", scopeKey: scope.key } satisfies ProductionChannelMessage);
  } catch {
    // Another open tab is optional; SQLite hydration runs independently.
  }
  return created;
}

function ensureHydration(scope: StudioProductionScope): Promise<void> {
  const existing = hydrationByScope.get(scope.key);
  if (existing) return existing;
  ensureSeed(scope);
  const startRevision = revision(scope.key);
  setPersistenceState(scope.key, {
    phase: "loading",
    persisted: false,
    warning: null,
    savedAt: null,
  });

  const hydration = persistenceRepository.load(scope.key).then(async (result) => {
    const unchangedSinceStart = revision(scope.key) === startRevision;
    if (result.workspace && unchangedSinceStart) {
      workspaceByScope.set(scope.key, result.workspace);
      awaitingRemoteScopes.delete(scope.key);
      emit(scope.key);
      broadcastWorkspace(result.workspace);
      setPersistenceState(
        scope.key,
        stateFromPersistenceResult(result, result.workspace.updatedAt),
      );
      return;
    }

    const current = workspaceByScope.get(scope.key);
    if (!current) {
      setPersistenceState(scope.key, stateFromPersistenceResult(result, null));
      return;
    }

    // No durable row yet, or the user edited before hydration completed. Persist the latest complete
    // workspace rather than letting an older load clobber visible work.
    const saved = await persistenceRepository.save(current);
    setPersistenceState(
      scope.key,
      stateFromPersistenceResult(saved, current.updatedAt),
    );
  }).catch((error: unknown) => {
    setPersistenceState(scope.key, {
      phase: "unavailable",
      persisted: false,
      warning: error instanceof Error ? error.message : String(error),
      savedAt: null,
    });
  });
  hydrationByScope.set(scope.key, hydration);
  return hydration;
}

function schedulePersistence(scope: StudioProductionScope): void {
  scopeByKey.set(scope.key, scope);
  if (persistByScope.has(scope.key)) return;
  const operation = (async () => {
    await ensureHydration(scope);
    while (true) {
      const beforeSaveRevision = revision(scope.key);
      const workspace = workspaceByScope.get(scope.key);
      if (!workspace) return;
      setPersistenceState(scope.key, {
        phase: "loading",
        persisted: false,
        warning: null,
        savedAt: persistenceByScope.get(scope.key)?.savedAt ?? null,
      });
      const result = await persistenceRepository.save(workspace);
      setPersistenceState(
        scope.key,
        stateFromPersistenceResult(result, workspace.updatedAt),
      );
      if (revision(scope.key) === beforeSaveRevision) return;
    }
  })();
  persistByScope.set(scope.key, operation);
  const retire = () => {
    if (persistByScope.get(scope.key) === operation) persistByScope.delete(scope.key);
  };
  void operation.then(retire, retire);
}

export function readStudioProductionWorkspace(
  scope: StudioProductionScope,
): StudioProductionWorkspace {
  return ensureSeed(scope);
}

export function readStudioProductionPersistenceState(
  scopeKey: string,
): StudioProductionPersistenceState {
  return persistenceByScope.get(scopeKey) ?? IDLE_PERSISTENCE_STATE;
}

export function replaceStudioProductionWorkspace(
  scope: StudioProductionScope,
  workspace: StudioProductionWorkspace,
): StudioProductionWorkspace {
  const rebound = workspace.scopeKey === scope.key
    ? workspace
    : { ...workspace, scopeKey: scope.key };
  scopeByKey.set(scope.key, scope);
  awaitingRemoteScopes.delete(scope.key);
  workspaceByScope.set(scope.key, rebound);
  advanceRevision(scope.key);
  emit(scope.key);
  broadcastWorkspace(rebound);
  schedulePersistence(scope);
  return rebound;
}

export function updateStudioProductionWorkspace(
  scope: StudioProductionScope,
  updater: WorkspaceUpdater,
): StudioProductionWorkspace {
  const current = readStudioProductionWorkspace(scope);
  const next = updater(current);
  awaitingRemoteScopes.delete(scope.key);
  workspaceByScope.set(scope.key, next);
  advanceRevision(scope.key);
  emit(scope.key);
  broadcastWorkspace(next);
  schedulePersistence(scope);
  return next;
}

export function commitStudioProductionWorkspace(
  scope: StudioProductionScope,
  audit: {
    readonly action: string;
    readonly detail?: string;
    readonly actor?: string;
  },
  updater: WorkspaceUpdater,
): StudioProductionWorkspace {
  return updateStudioProductionWorkspace(scope, (workspace) => (
    appendStudioProductionAudit(updater(workspace), audit)
  ));
}

export function subscribeStudioProductionWorkspace(
  scopeKey: string,
  listener: WorkspaceListener,
): () => void {
  const listeners = listenersByScope.get(scopeKey) ?? new Set<WorkspaceListener>();
  listeners.add(listener);
  listenersByScope.set(scopeKey, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByScope.delete(scopeKey);
  };
}

export function useStudioProductionWorkspace(scope: StudioProductionScope) {
  const subscribe = useCallback(
    (listener: WorkspaceListener) => subscribeStudioProductionWorkspace(scope.key, listener),
    [scope.key],
  );
  const getSnapshot = useCallback(
    () => readStudioProductionWorkspace(scope),
    [scope],
  );
  const getPersistenceSnapshot = useCallback(
    () => readStudioProductionPersistenceState(scope.key),
    [scope.key],
  );
  const workspace = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const persistence = useSyncExternalStore(
    subscribe,
    getPersistenceSnapshot,
    getPersistenceSnapshot,
  );

  useEffect(() => {
    void ensureHydration(scope);
  }, [scope]);

  const commit = useCallback((
    audit: { readonly action: string; readonly detail?: string; readonly actor?: string },
    updater: WorkspaceUpdater,
  ) => commitStudioProductionWorkspace(scope, audit, updater), [scope]);

  const replace = useCallback(
    (next: StudioProductionWorkspace) => replaceStudioProductionWorkspace(scope, next),
    [scope],
  );

  const retryPersistence = useCallback(() => {
    schedulePersistence(scope);
  }, [scope]);

  return { workspace, persistence, commit, replace, retryPersistence } as const;
}

/** Test-only reset. Product code never relies on a browser KV fallback. */
export function resetStudioProductionWorkspaceStoreForTests(): void {
  workspaceByScope.clear();
  scopeByKey.clear();
  listenersByScope.clear();
  awaitingRemoteScopes.clear();
  mutationRevisionByScope.clear();
  hydrationByScope.clear();
  persistByScope.clear();
  persistenceByScope.clear();
  productionChannel?.close();
  productionChannel = undefined;
  persistenceRepository = createStudioProductionSqlitePersistence();
}

export function setStudioProductionPersistenceForTests(
  repository: StudioProductionPersistenceRepository,
): void {
  persistenceRepository = repository;
  hydrationByScope.clear();
  persistByScope.clear();
  persistenceByScope.clear();
}
