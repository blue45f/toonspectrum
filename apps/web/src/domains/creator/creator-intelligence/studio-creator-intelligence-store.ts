import type {
  AniListReference,
  CreatorIntelligenceReference,
  SceneReferenceResponse,
  SoundEffectReference,
} from "./studio-creator-intelligence-client";

export interface StudioCreatorIntelligenceReferenceTarget {
  readonly kind: "project" | "episode" | "scene";
  readonly id: string;
}

export interface StudioProjectReference extends CreatorIntelligenceReference {
  readonly target: StudioCreatorIntelligenceReferenceTarget;
  readonly savedAt: string;
}

export interface SavedSceneReference {
  readonly id: string;
  readonly savedAt: string;
  readonly payload: SceneReferenceResponse;
}

export interface SavedMeshJob {
  readonly jobId: string;
  readonly imageUrl: string;
  readonly jobStatus: string;
  readonly progress: number | null;
  readonly glbUrl: string;
  readonly thumbnailUrl: string;
  readonly savedAt: string;
}

export interface StudioCreatorIntelligenceStore {
  readonly schema: "toonspectrum.creator-intelligence.project.v1";
  readonly projectId: string;
  readonly updatedAt: string;
  readonly references: readonly StudioProjectReference[];
  readonly scenes: readonly SavedSceneReference[];
  readonly catalog: readonly AniListReference[];  readonly sounds: readonly SoundEffectReference[];
  readonly meshJobs: readonly SavedMeshJob[];
}

export interface StudioCreatorIntelligenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "toonspectrum:creator-intelligence:project:v1:";
const LIMITS = Object.freeze({
  references: 120,
  scenes: 60,
  catalog: 80,
  sounds: 80,
  meshJobs: 40,
});

function storageKey(projectId: string): string {
  return `${PREFIX}${encodeURIComponent(projectId)}`;
}

function empty(projectId: string): StudioCreatorIntelligenceStore {
  return {
    schema: "toonspectrum.creator-intelligence.project.v1",
    projectId,
    updatedAt: new Date(0).toISOString(),
    references: [],
    scenes: [],
    catalog: [],
    sounds: [],
    meshJobs: [],
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedArray(value: unknown, maximum: number): readonly unknown[] {
  return Array.isArray(value) ? value.slice(0, maximum) : [];
}

function validReference(value: unknown): StudioProjectReference | null {
  const item = object(value);
  const target = object(item.target);
  if (
    typeof item.id !== "string"
    || typeof item.provider !== "string"
    || !["openverse", "pexels", "pixabay"].includes(item.provider)
    || typeof item.title !== "string"
    || (item.mediaType !== undefined && !["image", "video"].includes(String(item.mediaType)))
    || typeof item.sourceUrl !== "string"
    || typeof item.license !== "string"
    || typeof item.savedAt !== "string"
    || !Number.isFinite(Date.parse(item.savedAt))
    || !["project", "episode", "scene"].includes(String(target.kind))
    || typeof target.id !== "string"
    || target.id.length > 160
  ) return null;
  return value as StudioProjectReference;
}

function validCatalog(value: unknown): AniListReference | null {
  const item = object(value);
  if (
    typeof item.id !== "string"
    || !item.id.startsWith("anilist:")
    || typeof item.title !== "string"
    || typeof item.sourceUrl !== "string"
    || item.rightsStatus !== "metadata-only"
  ) return null;
  return value as AniListReference;
}

function validSound(value: unknown): SoundEffectReference | null {
  const item = object(value);
  if (
    typeof item.id !== "string"
    || !item.id.startsWith("freesound:")
    || typeof item.title !== "string"
    || typeof item.sourceUrl !== "string"
    || item.rightsStatus !== "verify-item-license"
  ) return null;
  return value as SoundEffectReference;
}

function validScene(value: unknown): SavedSceneReference | null {
  const item = object(value);
  if (
    typeof item.id !== "string"
    || typeof item.savedAt !== "string"
    || !Number.isFinite(Date.parse(item.savedAt))
  ) return null;
  const payload = object(item.payload);
  if (payload.status !== "ready" || typeof object(payload.location).label !== "string" || typeof payload.date !== "string") return null;
  return value as SavedSceneReference;
}

function validMeshJob(value: unknown): SavedMeshJob | null {
  const item = object(value);
  if (
    typeof item.jobId !== "string"
    || typeof item.imageUrl !== "string"
    || typeof item.savedAt !== "string"
    || !Number.isFinite(Date.parse(item.savedAt))
  ) return null;
  return value as SavedMeshJob;
}

export function loadStudioCreatorIntelligenceStore(
  storage: StudioCreatorIntelligenceStorage | null | undefined,
  projectId: string,
): StudioCreatorIntelligenceStore {
  if (!storage || !projectId) return empty(projectId);
  try {
    const raw = storage.getItem(storageKey(projectId));
    if (!raw || raw.length > 750_000) return empty(projectId);
    const parsed = object(JSON.parse(raw) as unknown);
    if (
      parsed.schema !== "toonspectrum.creator-intelligence.project.v1"
      || parsed.projectId !== projectId
    ) return empty(projectId);
    const updatedAt = typeof parsed.updatedAt === "string"
      && Number.isFinite(Date.parse(parsed.updatedAt))
      ? parsed.updatedAt
      : new Date(0).toISOString();
    return {
      schema: "toonspectrum.creator-intelligence.project.v1",
      projectId,
      updatedAt,
      references: boundedArray(parsed.references, LIMITS.references)
        .map(validReference)
        .filter((item): item is StudioProjectReference => item !== null),
      scenes: boundedArray(parsed.scenes, LIMITS.scenes)
        .map(validScene)
        .filter((item): item is SavedSceneReference => item !== null),
      catalog: boundedArray(parsed.catalog, LIMITS.catalog)
        .map(validCatalog)
        .filter((item): item is AniListReference => item !== null),
      sounds: boundedArray(parsed.sounds, LIMITS.sounds)
        .map(validSound)
        .filter((item): item is SoundEffectReference => item !== null),
      meshJobs: boundedArray(parsed.meshJobs, LIMITS.meshJobs)
        .map(validMeshJob)
        .filter((item): item is SavedMeshJob => item !== null),
    };
  } catch {
    return empty(projectId);
  }
}

export function saveStudioCreatorIntelligenceStore(
  storage: StudioCreatorIntelligenceStorage | null | undefined,
  next: StudioCreatorIntelligenceStore,
): boolean {
  if (!storage || !next.projectId) return false;
  try {
    const raw = JSON.stringify(next);
    // Never report a successful save that the bounded loader cannot read back.
    if (raw.length > 750_000) return false;
    storage.setItem(storageKey(next.projectId), raw);
    return true;
  } catch {
    return false;
  }
}

function dedupe<T>(
  items: readonly T[],
  identity: (item: T) => string,
  maximum: number,
): readonly T[] {
  const found = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const id = identity(item);
    if (found.has(id)) continue;
    found.add(id);
    output.push(item);
    if (output.length >= maximum) break;
  }
  return output;
}

export function patchStudioCreatorIntelligenceStore(
  current: StudioCreatorIntelligenceStore,
  patch: Partial<Pick<
    StudioCreatorIntelligenceStore,
    "references" | "scenes" | "catalog" | "sounds" | "meshJobs"
  >>,
  now = new Date(),
): StudioCreatorIntelligenceStore {
  return {
    ...current,
    updatedAt: now.toISOString(),
    references: dedupe(
      patch.references ?? current.references,
      (item) => `${item.id}:${item.target.kind}:${item.target.id}`,
      LIMITS.references,
    ),
    scenes: dedupe(
      patch.scenes ?? current.scenes,
      (item) => item.id,
      LIMITS.scenes,
    ),
    catalog: dedupe(
      patch.catalog ?? current.catalog,
      (item) => item.id,
      LIMITS.catalog,
    ),
    sounds: dedupe(
      patch.sounds ?? current.sounds,
      (item) => item.id,
      LIMITS.sounds,
    ),
    meshJobs: dedupe(
      patch.meshJobs ?? current.meshJobs,
      (item) => item.jobId,
      LIMITS.meshJobs,
    ),
  };
}

export function createSavedSceneReference(
  payload: SceneReferenceResponse,
  now = new Date(),
): SavedSceneReference | null {
  if (payload.status !== "ready" || !payload.location?.label || !payload.date) return null;
  return {
    id: `${payload.date}:${payload.location.latitude}:${payload.location.longitude}`,
    savedAt: now.toISOString(),
    payload,
  };
}
