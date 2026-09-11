import {
  STUDIO_PROJECT_READINESS_SECTIONS,
  type StudioProjectReadinessAction,
  type StudioProjectReadinessReport,
  type StudioProjectReadinessSection,
} from "./studio-project-readiness";

export const STUDIO_PROJECT_READINESS_UPDATED_EVENT =
  "toonspectrum:studio:project-readiness-updated";
export const STUDIO_PROJECT_READINESS_REQUEST_EVENT =
  "toonspectrum:studio:project-readiness-request";

export interface StudioProjectReadinessSnapshot {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly updatedAt: string;
  readonly report: StudioProjectReadinessReport;
}

export interface StudioProjectReadinessStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageKey(projectId: string): string {
  return `toonstudio:project-readiness:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCompletion(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isStatus(value: unknown): value is StudioProjectReadinessReport["status"] {
  return value === "ready" || value === "warning" || value === "blocked";
}

function parseSection(value: unknown): StudioProjectReadinessSection | null {
  if (!isRecord(value)) return null;
  const { id, status, completion, blockingCount, warningCount } = value;
  if (
    typeof id !== "string"
    || !(STUDIO_PROJECT_READINESS_SECTIONS as readonly string[]).includes(id)
    || !isStatus(status)
    || !isCompletion(completion)
    || !isNonNegativeInteger(blockingCount)
    || !isNonNegativeInteger(warningCount)
  ) {
    return null;
  }
  return Object.freeze({
    id: id as StudioProjectReadinessSection["id"],
    status,
    completion,
    blockingCount,
    warningCount,
  });
}

function parseAction(value: unknown): StudioProjectReadinessAction | null {
  if (!isRecord(value)) return null;
  const { id, section, priority, messageKo, messageEn } = value;
  if (
    typeof id !== "string"
    || !id.trim()
    || typeof section !== "string"
    || !(STUDIO_PROJECT_READINESS_SECTIONS as readonly string[]).includes(section)
    || (priority !== "high" && priority !== "medium" && priority !== "low")
    || typeof messageKo !== "string"
    || !messageKo.trim()
    || typeof messageEn !== "string"
    || !messageEn.trim()
  ) {
    return null;
  }
  return Object.freeze({
    id,
    section: section as StudioProjectReadinessAction["section"],
    priority,
    messageKo,
    messageEn,
  });
}

function parseReport(value: unknown): StudioProjectReadinessReport | null {
  if (!isRecord(value)) return null;
  const { status, completion, blockingCount, warningCount, sections, actions } = value;
  if (
    !isStatus(status)
    || !isCompletion(completion)
    || !isNonNegativeInteger(blockingCount)
    || !isNonNegativeInteger(warningCount)
    || !Array.isArray(sections)
    || !Array.isArray(actions)
  ) {
    return null;
  }
  const parsedSections = sections.map(parseSection);
  const parsedActions = actions.map(parseAction);
  if (parsedSections.some((item) => item === null) || parsedActions.some((item) => item === null)) {
    return null;
  }
  const concreteSections = parsedSections as StudioProjectReadinessSection[];
  const concreteActions = parsedActions as StudioProjectReadinessAction[];
  const sectionIds = concreteSections.map((section) => section.id);
  if (
    sectionIds.length !== STUDIO_PROJECT_READINESS_SECTIONS.length
    || new Set(sectionIds).size !== sectionIds.length
    || STUDIO_PROJECT_READINESS_SECTIONS.some((id) => !sectionIds.includes(id))
  ) {
    return null;
  }
  const calculatedBlocking = concreteSections.reduce(
    (sum, section) => sum + section.blockingCount,
    0,
  );
  const calculatedWarnings = concreteSections.reduce(
    (sum, section) => sum + section.warningCount,
    0,
  );
  const calculatedStatus = calculatedBlocking > 0
    ? "blocked"
    : calculatedWarnings > 0 ? "warning" : "ready";
  if (
    blockingCount !== calculatedBlocking
    || warningCount !== calculatedWarnings
    || status !== calculatedStatus
  ) {
    return null;
  }
  return Object.freeze({
    status,
    completion,
    blockingCount,
    warningCount,
    sections: Object.freeze(concreteSections),
    actions: Object.freeze(concreteActions),
  });
}

export function parseStudioProjectReadinessSnapshot(
  value: unknown,
  expectedProjectId?: string,
): StudioProjectReadinessSnapshot | null {
  if (!isRecord(value)) return null;
  const { schemaVersion, projectId, updatedAt, report } = value;
  if (
    schemaVersion !== 1
    || typeof projectId !== "string"
    || !projectId.trim()
    || (expectedProjectId !== undefined && projectId !== expectedProjectId)
    || typeof updatedAt !== "string"
    || !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }
  const parsedReport = parseReport(report);
  if (!parsedReport) return null;
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    updatedAt,
    report: parsedReport,
  });
}

export function readStudioProjectReadinessSnapshot(
  storage: StudioProjectReadinessStorage,
  projectId: string,
): StudioProjectReadinessSnapshot | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioProjectReadinessSnapshot(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioProjectReadinessSnapshot(
  storage: StudioProjectReadinessStorage,
  snapshot: StudioProjectReadinessSnapshot,
): void {
  const parsed = parseStudioProjectReadinessSnapshot(snapshot, snapshot.projectId);
  if (!parsed) throw new Error("A valid project readiness snapshot is required.");
  storage.setItem(storageKey(snapshot.projectId), JSON.stringify(parsed));
}

export function removeStudioProjectReadinessSnapshot(
  storage: StudioProjectReadinessStorage,
  projectId: string,
): void {
  if (!projectId.trim()) return;
  storage.removeItem(storageKey(projectId));
}

export function studioProjectReadinessStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}
