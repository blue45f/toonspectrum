import type { StudioProjectDiagnosticSource } from "./studio-project-diagnostics";

export const STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT =
  "toonspectrum:studio:project-diagnostic-source-updated";
export const STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT =
  "toonspectrum:studio:project-diagnostics-failed";

export interface StudioProjectDiagnosticSourceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageKey(projectId: string): string {
  return `toonstudio:project-diagnostic-source:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function parseStudioProjectDiagnosticSource(
  value: unknown,
  expectedProjectId?: string,
): StudioProjectDiagnosticSource | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !value.projectId.trim()
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || typeof value.capturedAt !== "string"
    || !Number.isFinite(Date.parse(value.capturedAt))
    || !isRecord(value.story)
    || !isRecord(value.story.bible)
    || !Array.isArray(value.story.states)
    || !Array.isArray(value.story.transitions)
    || !Array.isArray(value.productionTasks)
    || !Array.isArray(value.assets)
    || !isRecord(value.reviewSession)
    || !Array.isArray(value.localization)
    || !Array.isArray(value.exportPreflights)
  ) {
    return null;
  }
  return Object.freeze(plainClone(value) as unknown as StudioProjectDiagnosticSource);
}

export function readStudioProjectDiagnosticSource(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioProjectDiagnosticSource | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioProjectDiagnosticSource(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioProjectDiagnosticSource(
  storage: StudioProjectDiagnosticSourceStorage,
  source: StudioProjectDiagnosticSource,
): void {
  const parsed = parseStudioProjectDiagnosticSource(source, source.projectId);
  if (!parsed) throw new Error("A structurally valid project diagnostic source is required.");
  storage.setItem(storageKey(source.projectId), JSON.stringify(parsed));
}

export function removeStudioProjectDiagnosticSource(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): void {
  if (!projectId.trim()) return;
  storage.removeItem(storageKey(projectId));
}

export function studioProjectDiagnosticSourceStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}
