import {
  CreatorRoleWorkspaceConflictError,
  getCreatorRoleWorkspace,
  saveCreatorRoleWorkspace,
} from "@/infrastructure/creator-role-workspace-client";
import {
  creatorRoleWorkspacePreferenceForProfile,
  normalizeCreatorRoleWorkspacePreference,
  type CreatorRoleWorkspacePreference,
  type CreatorRoleWorkspaceSnapshot,
} from "@/shared/lib/creator-role-workspace-contract";
import type { CreatorRoleProfile } from "@/shared/lib/creator-role-contract";

const STORAGE_PREFIX = "toonspectrum:creator-role-workspace:v1:";
const CHANNEL_NAME = "toonspectrum:creator-role-workspace:v1";

export type CreatorRoleWorkspaceStoreStatus =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "offline"
  | "error";

export interface CreatorRoleWorkspaceStoreState {
  readonly projectKey: string;
  readonly status: CreatorRoleWorkspaceStoreStatus;
  readonly snapshot: CreatorRoleWorkspaceSnapshot;
  readonly error: string | null;
}

type Listener = () => void;

const states = new Map<string, CreatorRoleWorkspaceStoreState>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<CreatorRoleWorkspaceStoreState>>();
let channel: BroadcastChannel | null = null;
let browserListenersInstalled = false;

function defaultSnapshot(
  projectKey: string,
  profile?: CreatorRoleProfile | null,
): CreatorRoleWorkspaceSnapshot {
  return {
    projectKey,
    revision: 0,
    document: creatorRoleWorkspacePreferenceForProfile(profile),
    updatedAt: null,
    source: "default",
  };
}

function stateFor(
  projectKey: string,
  profile?: CreatorRoleProfile | null,
): CreatorRoleWorkspaceStoreState {
  const existing = states.get(projectKey);
  if (existing) return existing;
  const next: CreatorRoleWorkspaceStoreState = {
    projectKey,
    status: "idle",
    snapshot: defaultSnapshot(projectKey, profile),
    error: null,
  };
  states.set(projectKey, next);
  return next;
}

function notify(projectKey: string): void {
  for (const listener of listeners.get(projectKey) ?? []) listener();
}

function setState(
  projectKey: string,
  next: CreatorRoleWorkspaceStoreState,
  broadcast = false,
): CreatorRoleWorkspaceStoreState {
  states.set(projectKey, next);
  notify(projectKey);
  if (broadcast) broadcastSnapshot(next.snapshot);
  return next;
}

function storageKey(projectKey: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(projectKey)}`;
}

function parseStoredSnapshot(
  value: unknown,
  projectKey: string,
): CreatorRoleWorkspaceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.projectKey !== projectKey) return null;
  const revision = typeof record.revision === "number"
    && Number.isSafeInteger(record.revision)
    && record.revision >= 0
    ? record.revision
    : 0;
  const updatedAt = typeof record.updatedAt === "string"
    && Number.isFinite(Date.parse(record.updatedAt))
    ? new Date(record.updatedAt).toISOString()
    : null;
  return {
    projectKey,
    revision,
    document: normalizeCreatorRoleWorkspacePreference(record.document),
    updatedAt,
    source: "local",
  };
}

function readLocalSnapshot(projectKey: string): CreatorRoleWorkspaceSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(projectKey));
    if (!raw || raw.length > 128_000) return null;
    return parseStoredSnapshot(JSON.parse(raw), projectKey);
  } catch {
    return null;
  }
}

function writeLocalSnapshot(snapshot: CreatorRoleWorkspaceSnapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(snapshot.projectKey), JSON.stringify({
      projectKey: snapshot.projectKey,
      revision: snapshot.revision,
      document: snapshot.document,
      updatedAt: snapshot.updatedAt,
    }));
  } catch {
    // Local persistence is a recovery layer only; server persistence remains authoritative.
  }
}

function receiveSnapshot(snapshot: CreatorRoleWorkspaceSnapshot): void {
  const current = stateFor(snapshot.projectKey);
  if (
    snapshot.revision < current.snapshot.revision
    || (
      snapshot.revision === current.snapshot.revision
      && snapshot.updatedAt
      && current.snapshot.updatedAt
      && snapshot.updatedAt <= current.snapshot.updatedAt
    )
  ) {
    return;
  }
  writeLocalSnapshot(snapshot);
  setState(snapshot.projectKey, {
    projectKey: snapshot.projectKey,
    status: "ready",
    snapshot,
    error: null,
  });
}

function broadcastSnapshot(snapshot: CreatorRoleWorkspaceSnapshot): void {
  writeLocalSnapshot(snapshot);
  ensureBrowserListeners();
  try {
    channel?.postMessage({
      type: "creator-role-workspace-snapshot",
      snapshot,
    });
  } catch {
    // storage events still provide a fallback when BroadcastChannel is unavailable.
  }
}

function ensureBrowserListeners(): void {
  if (browserListenersInstalled || typeof window === "undefined") return;
  browserListenersInstalled = true;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      if (record.type !== "creator-role-workspace-snapshot") return;
      const snapshotValue = record.snapshot;
      if (!snapshotValue || typeof snapshotValue !== "object" || Array.isArray(snapshotValue)) {
        return;
      }
      const snapshotRecord = snapshotValue as Record<string, unknown>;
      if (typeof snapshotRecord.projectKey !== "string") return;
      const snapshot = parseStoredSnapshot(snapshotRecord, snapshotRecord.projectKey);
      if (snapshot) receiveSnapshot({ ...snapshot, source: "local" });
    });
  }
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(STORAGE_PREFIX) || !event.newValue) return;
    const projectKey = decodeURIComponent(event.key.slice(STORAGE_PREFIX.length));
    try {
      const snapshot = parseStoredSnapshot(JSON.parse(event.newValue), projectKey);
      if (snapshot) receiveSnapshot(snapshot);
    } catch {
      // Ignore malformed values from older or manually edited browser storage.
    }
  });
}

export function getCreatorRoleWorkspaceStoreState(
  projectKey: string,
): CreatorRoleWorkspaceStoreState {
  ensureBrowserListeners();
  return stateFor(projectKey);
}

export function subscribeCreatorRoleWorkspace(
  projectKey: string,
  listener: Listener,
): () => void {
  ensureBrowserListeners();
  const projectListeners = listeners.get(projectKey) ?? new Set<Listener>();
  projectListeners.add(listener);
  listeners.set(projectKey, projectListeners);
  return () => {
    projectListeners.delete(listener);
    if (projectListeners.size === 0) listeners.delete(projectKey);
  };
}

export async function loadCreatorRoleWorkspace(
  projectKey: string,
  fallbackProfile?: CreatorRoleProfile | null,
  force = false,
): Promise<CreatorRoleWorkspaceStoreState> {
  ensureBrowserListeners();
  const current = stateFor(projectKey, fallbackProfile);
  if (!force && ["ready", "offline"].includes(current.status)) return current;
  const pending = inflight.get(projectKey);
  if (pending && !force) return pending;

  const local = readLocalSnapshot(projectKey);
  const loadingState = setState(projectKey, {
    projectKey,
    status: "loading",
    snapshot: local ?? current.snapshot ?? defaultSnapshot(projectKey, fallbackProfile),
    error: null,
  });

  const request = getCreatorRoleWorkspace(projectKey)
    .then((snapshot) => {
      writeLocalSnapshot(snapshot);
      return setState(projectKey, {
        projectKey,
        status: "ready",
        snapshot,
        error: null,
      }, true);
    })
    .catch((cause: unknown) => {
      const message = cause instanceof Error
        ? cause.message
        : "직무별 작업 설정을 불러오지 못했어요.";
      const fallback = local ?? loadingState.snapshot;
      return setState(projectKey, {
        projectKey,
        status: local ? "offline" : "error",
        snapshot: fallback,
        error: message,
      });
    })
    .finally(() => {
      inflight.delete(projectKey);
    });
  inflight.set(projectKey, request);
  return request;
}

export async function persistCreatorRoleWorkspace(
  projectKey: string,
  document: CreatorRoleWorkspacePreference,
): Promise<CreatorRoleWorkspaceStoreState> {
  ensureBrowserListeners();
  const current = stateFor(projectKey);
  const normalized = normalizeCreatorRoleWorkspacePreference(document);
  const optimistic: CreatorRoleWorkspaceSnapshot = {
    projectKey,
    revision: current.snapshot.revision,
    document: normalized,
    updatedAt: new Date().toISOString(),
    source: "local",
  };
  writeLocalSnapshot(optimistic);
  setState(projectKey, {
    projectKey,
    status: "saving",
    snapshot: optimistic,
    error: null,
  }, true);

  try {
    const saved = await saveCreatorRoleWorkspace(
      projectKey,
      current.snapshot.revision,
      normalized,
    );
    writeLocalSnapshot(saved);
    return setState(projectKey, {
      projectKey,
      status: "ready",
      snapshot: saved,
      error: null,
    }, true);
  } catch (cause) {
    if (cause instanceof CreatorRoleWorkspaceConflictError) {
      writeLocalSnapshot(cause.latest);
      setState(projectKey, {
        projectKey,
        status: "ready",
        snapshot: cause.latest,
        error: cause.message,
      }, true);
      throw cause;
    }
    const message = cause instanceof Error
      ? cause.message
      : "직무별 작업 설정을 저장하지 못했어요.";
    return setState(projectKey, {
      projectKey,
      status: "offline",
      snapshot: optimistic,
      error: message,
    }, true);
  }
}

export function resetCreatorRoleWorkspaceStore(projectKey?: string): void {
  if (projectKey) {
    states.delete(projectKey);
    inflight.delete(projectKey);
    notify(projectKey);
    return;
  }
  const keys = [...states.keys()];
  states.clear();
  inflight.clear();
  for (const key of keys) notify(key);
}
