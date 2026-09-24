import { projectDefinitionForRead, type StudioProjectDefinition } from "./studio-project-definition";

/** Read-only project metadata for source routing; CRUD stays in the library store. */
export const STUDIO_PROJECT_LIBRARY_STORAGE_KEY =
  "toonspectrum:studio-project-library:v1";
export const STUDIO_PROJECT_LIBRARY_UPDATED_EVENT =
  "toonspectrum:studio-project-library-updated";

export const STUDIO_PROJECT_KINDS = [
  "webtoon",
  "illustration",
  "image",
  "design",
  "slides",
  "storyboard",
  "three-d",
  "animation",
] as const;

export const STUDIO_PROJECT_STATUSES = [
  "active",
  "archived",
  "trashed",
] as const;

export type StudioProjectKind = (typeof STUDIO_PROJECT_KINDS)[number];
export type StudioProjectStatus = (typeof STUDIO_PROJECT_STATUSES)[number];

export interface StudioProjectLibraryEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: StudioProjectKind;
  readonly status: StudioProjectStatus;
  readonly statusBeforeTrash: Exclude<StudioProjectStatus, "trashed"> | null;
  readonly templateId: string | null;
  readonly description: string;
  readonly primaryLocale: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly lastOpenedDocumentId: string | null;
  readonly thumbnailUrl: string | null;
  readonly definition?: StudioProjectDefinition | null;
}

export interface StudioProjectLibraryState {
  readonly schemaVersion: 1;
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly updatedAt: string;
}

export interface StudioProjectLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioProjectLibraryEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface CreateStudioProjectInput {
  readonly id?: string;
  readonly title: string;
  readonly kind: StudioProjectKind;
  readonly templateId?: string | null;
  readonly description?: string;
  readonly primaryLocale?: string;
  readonly createdAt?: string;
  readonly definition?: StudioProjectDefinition | null;
}

export const PROJECT_KIND_SET = new Set<string>(STUDIO_PROJECT_KINDS);
const PROJECT_STATUS_SET = new Set<string>(STUDIO_PROJECT_STATUSES);
export const MAX_PROJECTS = 5_000;

export function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validProjectId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > 160
    || normalized === "."
    || normalized === ".."
    || normalized.includes("\\")
  ) {
    return false;
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return normalized === value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseEntry(value: unknown): StudioProjectLibraryEntry | null {
  const item = record(value);
  if (!item || !validProjectId(item.id)) return null;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.kind !== "string" || !PROJECT_KIND_SET.has(item.kind)) return null;
  if (typeof item.status !== "string" || !PROJECT_STATUS_SET.has(item.status)) return null;
  if (!validTimestamp(item.createdAt) || !validTimestamp(item.updatedAt) || !validTimestamp(item.lastOpenedAt)) {
    return null;
  }
  const status = item.status as StudioProjectStatus;
  const templateId = typeof item.templateId === "string" && item.templateId.trim()
    ? item.templateId.trim().slice(0, 160)
    : null;
  const statusBeforeTrash = item.statusBeforeTrash === "active" || item.statusBeforeTrash === "archived"
    ? item.statusBeforeTrash
    : null;
  return Object.freeze({
    id: item.id,
    title: item.title.trim().slice(0, 120),
    kind: item.kind as StudioProjectKind,
    status,
    statusBeforeTrash: status === "trashed" ? statusBeforeTrash ?? "active" : null,
    templateId,
    description: typeof item.description === "string" ? item.description.trim().slice(0, 1_000) : "",
    primaryLocale: typeof item.primaryLocale === "string" && item.primaryLocale.trim()
      ? item.primaryLocale.trim()
      : "ko-KR",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastOpenedAt: item.lastOpenedAt,
    lastOpenedDocumentId: typeof item.lastOpenedDocumentId === "string" && item.lastOpenedDocumentId.trim()
      ? item.lastOpenedDocumentId.trim().slice(0, 160)
      : null,
    thumbnailUrl: typeof item.thumbnailUrl === "string" && item.thumbnailUrl.trim()
      ? item.thumbnailUrl.trim().slice(0, 2_048)
      : null,
    definition: projectDefinitionForRead(item.definition, item.kind as StudioProjectKind, templateId),
  });
}

function emptyState(at = new Date().toISOString()): StudioProjectLibraryState {
  if (!validTimestamp(at)) throw new Error("A valid project-library timestamp is required.");
  return Object.freeze({ schemaVersion: 1, projects: Object.freeze([]), updatedAt: at });
}

export function canonicalProjects(
  projects: readonly StudioProjectLibraryEntry[],
): readonly StudioProjectLibraryEntry[] {
  const byId = new Map<string, StudioProjectLibraryEntry>();
  for (const project of projects) byId.set(project.id, Object.freeze({ ...project }));
  return Object.freeze([...byId.values()].sort((left, right) => {
    const statusOrder = { active: 0, archived: 1, trashed: 2 } as const;
    return statusOrder[left.status] - statusOrder[right.status]
      || Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt)
      || left.title.localeCompare(right.title);
  }));
}

export function readStudioProjectLibrary(
  storage: StudioProjectLibraryStorage,
): StudioProjectLibraryState {
  const raw = storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.projects)) return emptyState();
    const projects = parsed.projects
      .slice(0, MAX_PROJECTS)
      .map(parseEntry)
      .filter((project): project is StudioProjectLibraryEntry => project !== null);
    return Object.freeze({
      schemaVersion: 1,
      projects: canonicalProjects(projects),
      updatedAt: validTimestamp(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString(),
    });
  } catch {
    return emptyState();
  }
}
