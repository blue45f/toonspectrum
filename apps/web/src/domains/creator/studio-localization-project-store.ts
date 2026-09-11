import {
  evaluateStudioLocalizationQa,
  isStudioLocalizationStatus,
  isStudioLocalizationUnitKind,
  summarizeStudioLocalization,
  type StudioLocalizationUnit,
} from "./studio-localization-workflow";
import type { StudioProjectDiagnosticLocalization } from "./studio-project-diagnostics";

export const STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT =
  "toonspectrum:studio:localization-project-updated";

export interface StudioLocalizationProjectDocument {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly units: readonly StudioLocalizationUnit[];
  readonly updatedAt: string;
}

export interface StudioLocalizationProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function validProjectId(value: string): boolean {
  return value.trim() === value && value.length > 0 && value !== "." && value !== ".." && !value.includes("\\");
}

function storageKey(projectId: string): string {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  return `toonstudio:localization-project:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUnit(value: unknown): StudioLocalizationUnit | null {
  if (!isRecord(value)
    || typeof value.id !== "string" || !value.id.trim()
    || typeof value.sourceLocale !== "string"
    || typeof value.targetLocale !== "string"
    || !isStudioLocalizationUnitKind(value.kind)
    || typeof value.sourceText !== "string" || !value.sourceText.trim()
    || typeof value.translatedText !== "string"
    || !isStudioLocalizationStatus(value.status)
    || !Array.isArray(value.glossary)
    || typeof value.sourceRemoved !== "boolean"
    || typeof value.backgroundRestored !== "boolean"
    || typeof value.letteringApplied !== "boolean"
    || typeof value.readingOrderAssigned !== "boolean"
    || typeof value.fontAvailable !== "boolean"
    || typeof value.updatedAt !== "string"
    || !Number.isFinite(Date.parse(value.updatedAt))) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as StudioLocalizationUnit;
}

export function parseStudioLocalizationProjectDocument(
  value: unknown,
  expectedProjectId?: string,
): StudioLocalizationProjectDocument | null {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !validProjectId(value.projectId)
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || !Array.isArray(value.units)
    || typeof value.updatedAt !== "string"
    || !Number.isFinite(Date.parse(value.updatedAt))) {
    return null;
  }
  const units = value.units.map(parseUnit);
  if (units.some((unit) => unit === null)) return null;
  const ids = units.map((unit) => unit!.id);
  if (new Set(ids).size !== ids.length) return null;
  return Object.freeze({
    schemaVersion: 1,
    projectId: value.projectId,
    units: Object.freeze(units as StudioLocalizationUnit[]),
    updatedAt: value.updatedAt,
  });
}

export function readStudioLocalizationProject(
  storage: StudioLocalizationProjectStorage,
  projectId: string,
): StudioLocalizationProjectDocument {
  const raw = storage.getItem(storageKey(projectId));
  if (raw) {
    try {
      const parsed = parseStudioLocalizationProjectDocument(JSON.parse(raw) as unknown, projectId);
      if (parsed) return parsed;
    } catch {
      // Fall through to a safe empty project; corrupt data never enters the workflow.
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    units: Object.freeze([]),
    updatedAt: new Date(0).toISOString(),
  });
}

export function writeStudioLocalizationProject(
  storage: StudioLocalizationProjectStorage,
  document: StudioLocalizationProjectDocument,
  target?: Pick<EventTarget, "dispatchEvent">,
): StudioLocalizationProjectDocument {
  const parsed = parseStudioLocalizationProjectDocument(document, document.projectId);
  if (!parsed) throw new Error("A valid localization project document is required.");
  storage.setItem(storageKey(parsed.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(new CustomEvent(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT, { detail: parsed }));
  return parsed;
}

export function projectLocalizationDiagnostics(
  units: readonly StudioLocalizationUnit[],
): readonly StudioProjectDiagnosticLocalization[] {
  const locales = new Map<string, StudioLocalizationUnit[]>();
  for (const unit of units) {
    const key = unit.targetLocale.toLowerCase();
    const group = locales.get(key) ?? [];
    group.push(unit);
    locales.set(key, group);
  }
  return Object.freeze([...locales.values()].map((group) => {
    const summary = summarizeStudioLocalization(group);
    const qa = group.flatMap((unit) => evaluateStudioLocalizationQa(unit));
    const blockingIssueCount = qa.filter((item) => item.severity === "error").length;
    const warningIssueCount = qa.filter((item) => item.severity === "warning").length;
    const status = summary.total > 0
      && summary.completed === summary.total
      && blockingIssueCount === 0
      && warningIssueCount === 0
        ? "complete"
        : blockingIssueCount > 0
          ? "blocked"
          : "review";
    return Object.freeze({
      locale: group[0]!.targetLocale,
      status,
      blockingIssueCount,
      warningIssueCount,
    });
  }).sort((a, b) => a.locale.localeCompare(b.locale)));
}

export function studioLocalizationProjectStorageKey(projectId: string): string {
  return storageKey(projectId);
}
