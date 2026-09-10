import type { ScenarioPreviewItem } from "../studio-scenario-layout";

import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

export type StudioAiComicDirectorStage =
  | "brief"
  | "direction"
  | "production"
  | "finish";

export type StudioAiComicDirectorSessionStatus =
  | "draft"
  | "planning"
  | "ready"
  | "generating"
  | "review"
  | "applying"
  | "applied"
  | "cancelled"
  | "failed";

export type StudioAiComicDirectorEntrySource =
  | "short-story"
  | "episode-script"
  | "storyboard";

export interface StudioAiVisualBibleConstraint {
  readonly id: string;
  readonly field: string;
  readonly strength: "must_keep" | "prefer_keep" | "may_vary" | "forbidden";
  readonly description: string;
  readonly source: "user" | "project" | "ai_inferred";
}

export interface StudioAiVisualBibleEntry {
  readonly id: string;
  readonly kind: "character" | "costume" | "location" | "prop" | "style" | "lighting";
  readonly name: string;
  readonly version: string;
  readonly referenceAssetIds: readonly string[];
  readonly constraints: readonly StudioAiVisualBibleConstraint[];
  readonly rightsStatus: "allowed" | "review_required" | "blocked";
  readonly canSendToExternalProvider: boolean;
}

export interface StudioAiVisualBibleDocument {
  readonly version: 1;
  readonly revision: number;
  readonly status: "draft" | "recommended" | "approved" | "deprecated";
  readonly entries: readonly StudioAiVisualBibleEntry[];
  readonly updatedAt: string;
}

export type StudioAiComicDirectorJobKind =
  | "generation"
  | "repair"
  | "quality"
  | "decomposition"
  | "apply";

export type StudioAiComicDirectorJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";

export interface StudioAiComicDirectorJob {
  readonly id: string;
  readonly operationId: string;
  readonly kind: StudioAiComicDirectorJobKind;
  readonly status: StudioAiComicDirectorJobStatus;
  readonly progressDone: number;
  readonly progressTotal: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly leaseExpiresAt: string | null;
  readonly updatedAt: string;
}

export interface StudioAiComicDirectorApproval {
  readonly id: string;
  readonly sessionRevision: number;
  readonly candidateDigest: string;
  readonly status: "active" | "superseded";
  readonly createdAt: string;
}

export interface StudioAiComicDirectorSessionDocument {
  readonly version: 1;
  readonly id: string;
  readonly workId: string | null;
  readonly remixSourceWorkId: string | null;
  readonly title: string;
  readonly entrySource: StudioAiComicDirectorEntrySource;
  readonly stage: StudioAiComicDirectorStage;
  readonly status: StudioAiComicDirectorSessionStatus;
  readonly revision: number;
  readonly baseDocumentRevision: string | null;
  readonly storyText: string;
  readonly characterDescription: string;
  readonly scenes: readonly ScenarioPreviewItem[];
  readonly visualBible: StudioAiVisualBibleDocument;
  readonly jobs: readonly StudioAiComicDirectorJob[];
  readonly approval: StudioAiComicDirectorApproval | null;
  readonly updatedAt: string;
}

export interface StudioAiComicApplyDiff {
  readonly operationId: string;
  readonly sessionId: string;
  readonly sessionRevision: number;
  readonly target: "current-page" | "new-page";
  readonly panelCount: number;
  readonly imageCount: number;
  readonly nativeBubbleCount: number;
  readonly decomposedLayerCount: number;
  readonly existingLayerChanges: 0;
  readonly candidateDigest: string;
  readonly approved: boolean;
  readonly baseDocumentRevision: string | null;
}

export interface StudioAiComicDirectorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_AI_COMIC_DIRECTOR_LOCAL_KEY_PREFIX =
  "toonspectrum:studio-ai-comic-director:";

const STAGES: readonly StudioAiComicDirectorStage[] = [
  "brief",
  "direction",
  "production",
  "finish",
];
const STATUSES: readonly StudioAiComicDirectorSessionStatus[] = [
  "draft",
  "planning",
  "ready",
  "generating",
  "review",
  "applying",
  "applied",
  "cancelled",
  "failed",
];
const ENTRY_SOURCES: readonly StudioAiComicDirectorEntrySource[] = [
  "short-story",
  "episode-script",
  "storyboard",
];

function id(): string {
  return createSecureRandomUuid(
    "이 브라우저에서는 안전한 AI 코믹 디렉터 문서 ID를 만들 수 없습니다.",
  );
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function iso(value: unknown): string {
  const parsed = typeof value === "string" ? new Date(value) : new Date();
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

function defaultBible(): StudioAiVisualBibleDocument {
  return {
    version: 1,
    revision: 1,
    status: "draft",
    entries: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createStudioAiComicDirectorSession(input: {
  readonly id?: string;
  readonly workId?: string | null;
  readonly remixSourceWorkId?: string | null;
  readonly title?: string;
  readonly entrySource?: StudioAiComicDirectorEntrySource;
  readonly baseDocumentRevision?: string | null;
  readonly storyText?: string;
  readonly characterDescription?: string;
  readonly scenes?: readonly ScenarioPreviewItem[];
  readonly visualBible?: StudioAiVisualBibleDocument;
} = {}): StudioAiComicDirectorSessionDocument {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: input.id ?? id(),
    workId: input.workId ?? null,
    remixSourceWorkId: input.remixSourceWorkId ?? null,
    title: input.title?.trim() || "AI 코믹 디렉터 세션",
    entrySource: input.entrySource ?? "short-story",
    stage: input.scenes?.length ? "direction" : "brief",
    status: input.scenes?.length ? "ready" : "draft",
    revision: 1,
    baseDocumentRevision: input.baseDocumentRevision ?? null,
    storyText: input.storyText ?? "",
    characterDescription: input.characterDescription ?? "",
    scenes: input.scenes ? [...input.scenes] : [],
    visualBible: input.visualBible ?? defaultBible(),
    jobs: [],
    approval: null,
    updatedAt: now,
  };
}

function hydrateVisualBible(value: unknown): StudioAiVisualBibleDocument {
  const raw = object(value);
  const entries = Array.isArray(raw.entries)
    ? raw.entries.flatMap((candidate) => {
        const entry = object(candidate);
        if (typeof entry.id !== "string" || typeof entry.name !== "string") return [];
        const kind = enumValue(
          entry.kind,
          ["character", "costume", "location", "prop", "style", "lighting"] as const,
          "character",
        );
        const constraints = Array.isArray(entry.constraints)
          ? entry.constraints.flatMap((constraintValue) => {
              const constraint = object(constraintValue);
              if (
                typeof constraint.id !== "string"
                || typeof constraint.field !== "string"
                || typeof constraint.description !== "string"
              ) return [];
              return [{
                id: constraint.id,
                field: constraint.field,
                strength: enumValue(
                  constraint.strength,
                  ["must_keep", "prefer_keep", "may_vary", "forbidden"] as const,
                  "prefer_keep",
                ),
                description: constraint.description,
                source: enumValue(
                  constraint.source,
                  ["user", "project", "ai_inferred"] as const,
                  "user",
                ),
              } satisfies StudioAiVisualBibleConstraint];
            })
          : [];
        return [{
          id: entry.id,
          kind,
          name: entry.name,
          version: text(entry.version, "v1"),
          referenceAssetIds: Array.isArray(entry.referenceAssetIds)
            ? entry.referenceAssetIds.filter((item): item is string => typeof item === "string")
            : [],
          constraints,
          rightsStatus: enumValue(
            entry.rightsStatus,
            ["allowed", "review_required", "blocked"] as const,
            "review_required",
          ),
          canSendToExternalProvider: entry.canSendToExternalProvider === true,
        } satisfies StudioAiVisualBibleEntry];
      })
    : [];
  return {
    version: 1,
    revision: Math.max(1, number(raw.revision, 1)),
    status: enumValue(
      raw.status,
      ["draft", "recommended", "approved", "deprecated"] as const,
      "draft",
    ),
    entries,
    updatedAt: iso(raw.updatedAt),
  };
}

function hydrateJob(value: unknown): StudioAiComicDirectorJob | null {
  const raw = object(value);
  if (typeof raw.id !== "string" || typeof raw.operationId !== "string") return null;
  const progressTotal = number(raw.progressTotal, 0);
  return {
    id: raw.id,
    operationId: raw.operationId,
    kind: enumValue(
      raw.kind,
      ["generation", "repair", "quality", "decomposition", "apply"] as const,
      "generation",
    ),
    status: enumValue(
      raw.status,
      ["queued", "running", "succeeded", "failed", "cancelled", "unknown"] as const,
      "unknown",
    ),
    progressDone: Math.min(progressTotal, number(raw.progressDone, 0)),
    progressTotal,
    payload: object(raw.payload),
    result: raw.result == null ? null : object(raw.result),
    error: raw.error == null ? null : text(raw.error),
    leaseExpiresAt: raw.leaseExpiresAt == null ? null : iso(raw.leaseExpiresAt),
    updatedAt: iso(raw.updatedAt),
  };
}

export function hydrateStudioAiComicDirectorSession(
  value: unknown,
): StudioAiComicDirectorSessionDocument | null {
  const raw = object(value);
  if (raw.version !== 1 || typeof raw.id !== "string") return null;
  const jobs = Array.isArray(raw.jobs)
    ? raw.jobs.map(hydrateJob).filter((job): job is StudioAiComicDirectorJob => job !== null)
    : [];
  const approvalRaw = object(raw.approval);
  const approval =
    typeof approvalRaw.id === "string"
    && typeof approvalRaw.candidateDigest === "string"
      ? {
          id: approvalRaw.id,
          sessionRevision: Math.max(1, number(approvalRaw.sessionRevision, 1)),
          candidateDigest: approvalRaw.candidateDigest,
          status: enumValue(
            approvalRaw.status,
            ["active", "superseded"] as const,
            "superseded",
          ),
          createdAt: iso(approvalRaw.createdAt),
        } satisfies StudioAiComicDirectorApproval
      : null;
  return {
    version: 1,
    id: raw.id,
    workId: raw.workId == null ? null : text(raw.workId),
    remixSourceWorkId:
      raw.remixSourceWorkId == null ? null : text(raw.remixSourceWorkId),
    title: text(raw.title, "AI 코믹 디렉터 세션"),
    entrySource: enumValue(raw.entrySource, ENTRY_SOURCES, "short-story"),
    stage: enumValue(raw.stage, STAGES, "brief"),
    status: enumValue(raw.status, STATUSES, "draft"),
    revision: Math.max(1, number(raw.revision, 1)),
    baseDocumentRevision:
      raw.baseDocumentRevision == null ? null : text(raw.baseDocumentRevision),
    storyText: text(raw.storyText),
    characterDescription: text(raw.characterDescription),
    scenes: Array.isArray(raw.scenes) ? (raw.scenes as ScenarioPreviewItem[]) : [],
    visualBible: hydrateVisualBible(raw.visualBible),
    jobs,
    approval,
    updatedAt: iso(raw.updatedAt),
  };
}

export function studioAiComicDirectorStorageKey(sessionId: string): string {
  return `${STUDIO_AI_COMIC_DIRECTOR_LOCAL_KEY_PREFIX}${sessionId}`;
}

export function loadStudioAiComicDirectorSession(
  storage: StudioAiComicDirectorStorage | null | undefined,
  sessionId: string,
): StudioAiComicDirectorSessionDocument | null {
  try {
    const raw = storage?.getItem(studioAiComicDirectorStorageKey(sessionId));
    return raw ? hydrateStudioAiComicDirectorSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveStudioAiComicDirectorSession(
  storage: StudioAiComicDirectorStorage | null | undefined,
  session: StudioAiComicDirectorSessionDocument,
): void {
  try {
    storage?.setItem(
      studioAiComicDirectorStorageKey(session.id),
      JSON.stringify(session),
    );
  } catch {
    // Local persistence can be unavailable in private/locked-down browsing modes.
  }
}

export function updateStudioAiComicDirectorSession(
  session: StudioAiComicDirectorSessionDocument,
  patch: Partial<Omit<StudioAiComicDirectorSessionDocument, "version" | "id" | "revision">>,
): StudioAiComicDirectorSessionDocument {
  return {
    ...session,
    ...patch,
    revision: session.revision + 1,
    approval: null,
    updatedAt: new Date().toISOString(),
  };
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function studioAiComicDirectorCandidateDigest(
  scenes: readonly ScenarioPreviewItem[],
): string {
  return fnv1a(stableSerialize(scenes.map((scene, index) => ({
    index,
    selectedImageCandidateId: scene.selectedImageCandidateId ?? null,
    imageFingerprint: scene.imageCandidates?.find(
      (candidate) => candidate.id === scene.selectedImageCandidateId,
    )?.inputFingerprint ?? null,
    dialogue: scene.dialogue,
    layerManifest: scene.layerManifest ?? null,
  }))));
}

export function createStudioAiComicApplyDiff(input: {
  readonly session: StudioAiComicDirectorSessionDocument;
  readonly target: "current-page" | "new-page";
  readonly operationId?: string;
}): StudioAiComicApplyDiff {
  const candidateDigest = studioAiComicDirectorCandidateDigest(input.session.scenes);
  const nativeBubbleCount = input.session.scenes.reduce(
    (total, scene) => total + scene.bubbles.length,
    0,
  );
  const decomposedLayerCount = input.session.scenes.reduce(
    (total, scene) => total + (scene.layerManifest?.layers.length ?? 0),
    0,
  );
  return {
    operationId: input.operationId ?? id(),
    sessionId: input.session.id,
    sessionRevision: input.session.revision,
    target: input.target,
    panelCount: input.session.scenes.length,
    imageCount: input.session.scenes.filter((scene) => Boolean(scene.imageDataUrl)).length,
    nativeBubbleCount,
    decomposedLayerCount,
    existingLayerChanges: 0,
    candidateDigest,
    approved:
      input.session.approval?.status === "active"
      && input.session.approval.sessionRevision === input.session.revision
      && input.session.approval.candidateDigest === candidateDigest,
    baseDocumentRevision: input.session.baseDocumentRevision,
  };
}

export function reconcileStudioAiComicDirectorJobs(
  jobs: readonly StudioAiComicDirectorJob[],
  now = Date.now(),
): StudioAiComicDirectorJob[] {
  return jobs.map((job) => {
    if (
      job.status !== "running"
      || !job.leaseExpiresAt
      || new Date(job.leaseExpiresAt).getTime() > now
    ) return job;
    return {
      ...job,
      status: "unknown",
      error:
        job.error
        ?? "브라우저 연결이 끊긴 동안 공급자 완료 여부를 확인하지 못했습니다.",
      updatedAt: new Date(now).toISOString(),
    };
  });
}
