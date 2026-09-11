import {
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
  readStudioProjectDiagnosticSource,
  writeStudioProjectDiagnosticSource,
  type StudioProjectDiagnosticSourceStorage,
} from "./studio-project-diagnostic-source-store";
import { createInitialStudioProjectDiagnosticSource } from "./studio-project-diagnostic-source-defaults";

import type { StudioProjectDiagnosticSource } from "./studio-project-diagnostics";

export type StudioProjectWorkspaceState = StudioProjectDiagnosticSource;

export interface StudioProjectWorkspaceEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface StudioProjectWorkspaceMutationContext {
  readonly projectId: string;
  readonly updatedAt: string;
}

export type StudioProjectWorkspaceUpdater = (
  current: StudioProjectWorkspaceState,
  context: StudioProjectWorkspaceMutationContext,
) => StudioProjectWorkspaceState;

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

function requireTimestamp(updatedAt: string): string {
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("A valid Studio project timestamp is required.");
  return updatedAt;
}

function immutableClone(state: StudioProjectWorkspaceState): StudioProjectWorkspaceState {
  const parsed = parseStudioProjectDiagnosticSource(
    JSON.parse(JSON.stringify(state)) as unknown,
    state.projectId,
  );
  if (!parsed) throw new Error("Studio project workspace state is invalid.");
  return parsed;
}

/** Returns persisted project state or creates the conservative initial state on first access. */
export function ensureStudioProjectWorkspaceState(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  createdAt = new Date().toISOString(),
): StudioProjectWorkspaceState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioProjectDiagnosticSource(storage, normalizedProjectId);
  if (current) return current;
  const initial = createInitialStudioProjectDiagnosticSource(normalizedProjectId, requireTimestamp(createdAt));
  writeStudioProjectDiagnosticSource(storage, initial);
  return initial;
}

/** Persists one complete project snapshot; all feature areas share this storage authority. */
export function writeStudioProjectWorkspaceState(
  storage: StudioProjectDiagnosticSourceStorage,
  state: StudioProjectWorkspaceState,
  target?: StudioProjectWorkspaceEventTarget,
): StudioProjectWorkspaceState {
  const immutable = immutableClone(state);
  writeStudioProjectDiagnosticSource(storage, immutable);
  target?.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, {
    detail: immutable,
  }));
  return immutable;
}

/** Applies an atomic project mutation and updates the diagnostic/readiness pipeline automatically. */
export function updateStudioProjectWorkspaceState(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  updater: StudioProjectWorkspaceUpdater,
  options: {
    readonly updatedAt?: string;
    readonly target?: StudioProjectWorkspaceEventTarget;
  } = {},
): StudioProjectWorkspaceState {
  const normalizedProjectId = requireProjectId(projectId);
  const updatedAt = requireTimestamp(options.updatedAt ?? new Date().toISOString());
  const current = ensureStudioProjectWorkspaceState(storage, normalizedProjectId, updatedAt);
  const next = updater(current, Object.freeze({ projectId: normalizedProjectId, updatedAt }));
  if (next.projectId !== normalizedProjectId) {
    throw new Error("A Studio project mutation cannot change project identity.");
  }
  return writeStudioProjectWorkspaceState(storage, { ...next, capturedAt: updatedAt }, options.target);
}
