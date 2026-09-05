import { z } from "zod";

export const STUDIO_PRODUCTION_SURFACES = [
  "projects",
  "review",
  "versions",
  "present",
  "share",
  "join",
] as const;

export const STUDIO_PRODUCTION_STAGES = [
  "idea",
  "script",
  "storyboard",
  "sketch",
  "line",
  "color",
  "lettering",
  "qa",
  "delivered",
] as const;

export const STUDIO_PRODUCTION_STATUSES = [
  "planned",
  "active",
  "blocked",
  "review",
  "done",
] as const;

export const STUDIO_REVIEW_SEVERITIES = ["blocker", "major", "minor", "note"] as const;
export const STUDIO_REVIEW_STATUSES = ["open", "in_progress", "resolved", "waived"] as const;
export const STUDIO_REVIEW_CATEGORIES = [
  "story",
  "art",
  "lettering",
  "continuity",
  "platform",
  "rights",
  "accessibility",
  "localization",
] as const;
export const STUDIO_SHARE_ROLES = ["viewer", "commenter", "editor", "producer"] as const;
export const STUDIO_SLIDE_LAYOUTS = [
  "cover",
  "statement",
  "character",
  "world",
  "sequence",
  "metrics",
  "cta",
] as const;

export type StudioProductionSurface = (typeof STUDIO_PRODUCTION_SURFACES)[number];
export type StudioProductionStage = (typeof STUDIO_PRODUCTION_STAGES)[number];
export type StudioProductionStatus = (typeof STUDIO_PRODUCTION_STATUSES)[number];
export type StudioReviewSeverity = (typeof STUDIO_REVIEW_SEVERITIES)[number];
export type StudioReviewStatus = (typeof STUDIO_REVIEW_STATUSES)[number];
export type StudioReviewCategory = (typeof STUDIO_REVIEW_CATEGORIES)[number];
export type StudioShareRole = (typeof STUDIO_SHARE_ROLES)[number];
export type StudioPitchSlideLayout = (typeof STUDIO_SLIDE_LAYOUTS)[number];

export interface StudioProductionScope {
  readonly key: string;
  readonly kind: "portfolio" | "draft" | "work" | "remix";
  readonly documentId: string | null;
  readonly label: string;
  readonly editorHref: string;
}

const SafeString = z.string().trim().max(500);
const RequiredString = z.string().trim().min(1).max(500);
const IsoTimestamp = z.string().min(1).max(64);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const ProjectBriefSchema = z.object({
  genre: SafeString,
  logline: SafeString,
  seasonLabel: SafeString,
  targetPlatform: SafeString,
  targetRating: SafeString,
  targetReleaseOn: IsoDate,
});

const EpisodeSchema = z.object({
  id: RequiredString,
  number: z.number().int().min(0).max(10_000),
  title: RequiredString,
  stage: z.enum(STUDIO_PRODUCTION_STAGES),
  status: z.enum(STUDIO_PRODUCTION_STATUSES),
  owner: SafeString,
  dueOn: IsoDate,
  priority: z.enum(["low", "normal", "high", "urgent"]),
  panelCount: z.number().int().min(0).max(100_000),
  plannedHours: z.number().min(0).max(100_000),
  spentHours: z.number().min(0).max(100_000),
  words: z.number().int().min(0).max(10_000_000),
  localeCount: z.number().int().min(1).max(100),
  notes: SafeString,
  tags: z.array(SafeString).max(30),
  updatedAt: IsoTimestamp,
});

const DeliveryCheckSchema = z.object({
  id: RequiredString,
  category: z.enum([
    "story",
    "art",
    "lettering",
    "rights",
    "accessibility",
    "localization",
    "platform",
    "backup",
  ]),
  label: RequiredString,
  required: z.boolean(),
  done: z.boolean(),
  owner: SafeString,
  evidence: SafeString,
});

const ReviewCommentSchema = z.object({
  id: RequiredString,
  author: RequiredString,
  body: RequiredString,
  createdAt: IsoTimestamp,
});

const ReviewItemSchema = z.object({
  id: RequiredString,
  episodeId: SafeString.nullable(),
  pageLabel: SafeString,
  title: RequiredString,
  detail: SafeString,
  category: z.enum(STUDIO_REVIEW_CATEGORIES),
  severity: z.enum(STUDIO_REVIEW_SEVERITIES),
  status: z.enum(STUDIO_REVIEW_STATUSES),
  assignee: SafeString,
  reporter: SafeString,
  dueOn: IsoDate,
  comments: z.array(ReviewCommentSchema).max(200),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});

const PitchSlideSchema = z.object({
  id: RequiredString,
  layout: z.enum(STUDIO_SLIDE_LAYOUTS),
  eyebrow: SafeString,
  title: RequiredString,
  body: SafeString,
  speakerNotes: SafeString,
  durationSec: z.number().int().min(5).max(900),
  hidden: z.boolean(),
  mediaHint: SafeString,
});

const WorkspaceSnapshotPayloadSchema = z.object({
  title: RequiredString,
  seriesTitle: RequiredString,
  projectBrief: ProjectBriefSchema,
  dailyCapacityHours: z.number().min(1).max(24),
  episodes: z.array(EpisodeSchema).max(500),
  deliveryChecklist: z.array(DeliveryCheckSchema).max(200),
  reviews: z.array(ReviewItemSchema).max(2_000),
  pitchSlides: z.array(PitchSlideSchema).max(200),
  releaseApproval: z.object({
    status: z.enum(["not_requested", "pending", "approved", "changes_requested"]),
    actor: SafeString,
    note: SafeString,
    updatedAt: IsoTimestamp,
  }),
});

const VersionSnapshotSchema = z.object({
  id: RequiredString,
  name: RequiredString,
  summary: SafeString,
  branch: RequiredString,
  kind: z.enum(["baseline", "manual", "approval", "delivery", "restore"]),
  author: RequiredString,
  createdAt: IsoTimestamp,
  parentId: SafeString.nullable(),
  pinned: z.boolean(),
  checksum: RequiredString,
  payload: WorkspaceSnapshotPayloadSchema,
});

const ShareGrantSchema = z.object({
  id: RequiredString,
  token: RequiredString,
  label: RequiredString,
  role: z.enum(STUDIO_SHARE_ROLES),
  expiresAt: IsoTimestamp,
  downloadsAllowed: z.boolean(),
  watermark: z.boolean(),
  approvalRequired: z.boolean(),
  createdAt: IsoTimestamp,
  revokedAt: IsoTimestamp.nullable(),
  lastOpenedAt: IsoTimestamp.nullable(),
});

const ParticipantSchema = z.object({
  id: RequiredString,
  name: RequiredString,
  role: z.enum(STUDIO_SHARE_ROLES),
  status: z.enum(["pending", "online", "offline", "removed"]),
  joinedAt: IsoTimestamp,
  lastSeenAt: IsoTimestamp,
  sourceGrantId: SafeString.nullable(),
});

const AuditEventSchema = z.object({
  id: RequiredString,
  actor: RequiredString,
  action: RequiredString,
  detail: SafeString,
  createdAt: IsoTimestamp,
});

export const StudioProductionWorkspaceSchema = z.object({
  schema: z.literal("toonstudio-production-workspace"),
  version: z.literal(1),
  scopeKey: RequiredString,
  title: RequiredString,
  seriesTitle: RequiredString,
  owner: RequiredString,
  timezone: RequiredString,
  dailyCapacityHours: z.number().min(1).max(24),
  projectBrief: ProjectBriefSchema,
  episodes: z.array(EpisodeSchema).max(500),
  deliveryChecklist: z.array(DeliveryCheckSchema).max(200),
  reviews: z.array(ReviewItemSchema).max(2_000),
  versions: z.array(VersionSnapshotSchema).max(500),
  pitchSlides: z.array(PitchSlideSchema).max(200),
  shareGrants: z.array(ShareGrantSchema).max(500),
  participants: z.array(ParticipantSchema).max(1_000),
  audit: z.array(AuditEventSchema).max(1_000),
  releaseApproval: z.object({
    status: z.enum(["not_requested", "pending", "approved", "changes_requested"]),
    actor: SafeString,
    note: SafeString,
    updatedAt: IsoTimestamp,
  }),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});

const StudioProductionExportEnvelopeSchema = z.object({
  kind: z.literal("toonstudio-production-export"),
  version: z.literal(1),
  exportedAt: IsoTimestamp,
  checksum: RequiredString,
  workspace: StudioProductionWorkspaceSchema,
});

export interface StudioProjectBrief {
  genre: string;
  logline: string;
  seasonLabel: string;
  targetPlatform: string;
  targetRating: string;
  targetReleaseOn: string;
}

export interface StudioProductionEpisode {
  id: string;
  number: number;
  title: string;
  stage: StudioProductionStage;
  status: StudioProductionStatus;
  owner: string;
  dueOn: string;
  priority: "low" | "normal" | "high" | "urgent";
  panelCount: number;
  plannedHours: number;
  spentHours: number;
  words: number;
  localeCount: number;
  notes: string;
  tags: string[];
  updatedAt: string;
}

export interface StudioDeliveryCheck {
  id: string;
  category: "story" | "art" | "lettering" | "rights" | "accessibility" | "localization" | "platform" | "backup";
  label: string;
  required: boolean;
  done: boolean;
  owner: string;
  evidence: string;
}

export interface StudioReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface StudioReviewItem {
  id: string;
  episodeId: string | null;
  pageLabel: string;
  title: string;
  detail: string;
  category: StudioReviewCategory;
  severity: StudioReviewSeverity;
  status: StudioReviewStatus;
  assignee: string;
  reporter: string;
  dueOn: string;
  comments: StudioReviewComment[];
  createdAt: string;
  updatedAt: string;
}

export interface StudioPitchSlide {
  id: string;
  layout: StudioPitchSlideLayout;
  eyebrow: string;
  title: string;
  body: string;
  speakerNotes: string;
  durationSec: number;
  hidden: boolean;
  mediaHint: string;
}

export interface StudioReleaseApproval {
  status: "not_requested" | "pending" | "approved" | "changes_requested";
  actor: string;
  note: string;
  updatedAt: string;
}

export interface StudioProductionSnapshotPayload {
  title: string;
  seriesTitle: string;
  projectBrief: StudioProjectBrief;
  dailyCapacityHours: number;
  episodes: StudioProductionEpisode[];
  deliveryChecklist: StudioDeliveryCheck[];
  reviews: StudioReviewItem[];
  pitchSlides: StudioPitchSlide[];
  releaseApproval: StudioReleaseApproval;
}

export interface StudioVersionSnapshot {
  id: string;
  name: string;
  summary: string;
  branch: string;
  kind: "baseline" | "manual" | "approval" | "delivery" | "restore";
  author: string;
  createdAt: string;
  parentId: string | null;
  pinned: boolean;
  checksum: string;
  payload: StudioProductionSnapshotPayload;
}

export interface StudioShareGrant {
  id: string;
  token: string;
  label: string;
  role: StudioShareRole;
  expiresAt: string;
  downloadsAllowed: boolean;
  watermark: boolean;
  approvalRequired: boolean;
  createdAt: string;
  revokedAt: string | null;
  lastOpenedAt: string | null;
}

export interface StudioParticipant {
  id: string;
  name: string;
  role: StudioShareRole;
  status: "pending" | "online" | "offline" | "removed";
  joinedAt: string;
  lastSeenAt: string;
  sourceGrantId: string | null;
}

export interface StudioProductionAuditEvent {
  id: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface StudioProductionWorkspace {
  schema: "toonstudio-production-workspace";
  version: 1;
  scopeKey: string;
  title: string;
  seriesTitle: string;
  owner: string;
  timezone: string;
  dailyCapacityHours: number;
  projectBrief: StudioProjectBrief;
  episodes: StudioProductionEpisode[];
  deliveryChecklist: StudioDeliveryCheck[];
  reviews: StudioReviewItem[];
  versions: StudioVersionSnapshot[];
  pitchSlides: StudioPitchSlide[];
  shareGrants: StudioShareGrant[];
  participants: StudioParticipant[];
  audit: StudioProductionAuditEvent[];
  releaseApproval: StudioReleaseApproval;
  createdAt: string;
  updatedAt: string;
}

export interface StudioProductionOverview {
  readonly completionPercent: number;
  readonly remainingHours: number;
  readonly overdueCount: number;
  readonly blockedCount: number;
  readonly openReviewCount: number;
  readonly reviewBlockerCount: number;
  readonly missingRequiredChecks: number;
  readonly projectedDeliveryOn: string;
  readonly requiredDailyHours: number;
  readonly risk: "healthy" | "at_risk" | "critical";
}

export interface StudioReviewGate {
  readonly ready: boolean;
  readonly blockerCount: number;
  readonly majorCount: number;
  readonly missingRequiredChecks: readonly StudioDeliveryCheck[];
  readonly reasons: readonly string[];
  readonly readinessPercent: number;
}

export interface StudioSnapshotDiff {
  readonly totalChanges: number;
  readonly episodesAdded: number;
  readonly episodesRemoved: number;
  readonly episodesChanged: number;
  readonly reviewsChanged: number;
  readonly checklistChanged: number;
  readonly slidesChanged: number;
  readonly projectFieldsChanged: number;
  readonly details: readonly string[];
}

export interface StudioProductionImportResult {
  readonly ok: boolean;
  readonly workspace?: StudioProductionWorkspace;
  readonly error?: string;
}

const STAGE_PROGRESS: Readonly<Record<StudioProductionStage, number>> = {
  idea: 4,
  script: 14,
  storyboard: 27,
  sketch: 40,
  line: 58,
  color: 77,
  lettering: 89,
  qa: 96,
  delivered: 100,
};

let generatedIdSequence = 0;

function nextId(prefix: string): string {
  generatedIdSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${generatedIdSequence.toString(36)}`;
}

function safeDecode(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && decoded.length <= 120 ? decoded : null;
  } catch {
    return null;
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(nowIso: string, days: number): string {
  const value = new Date(nowIso);
  value.setUTCDate(value.getUTCDate() + days);
  return dateOnly(value);
}

function shiftHours(nowIso: string, hours: number): string {
  const value = new Date(nowIso);
  value.setUTCHours(value.getUTCHours() + hours);
  return value.toISOString();
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cappedPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compareDate(left: string, right: string): number {
  return left.localeCompare(right);
}

export function resolveStudioProductionScope(
  pathname: string,
  search: string | URLSearchParams = "",
): StudioProductionScope {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "studio" && (segments[1] === "work" || segments[1] === "remix")) {
    const documentId = safeDecode(segments[2] ?? "");
    if (documentId !== null) {
      const kind = segments[1];
      return Object.freeze({
        key: `${kind}:${documentId}`,
        kind,
        documentId,
        label: kind === "work" ? `작품 ${documentId}` : `리믹스 ${documentId}`,
        editorHref: `/studio/${kind}/${encodeURIComponent(documentId)}/canvas`,
      });
    }
  }

  const params = search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(search);
  const requestedScope = params.get("scope");
  if (requestedScope === "draft") {
    return Object.freeze({
      key: "draft",
      kind: "draft",
      documentId: null,
      label: "새 웹툰 초안",
      editorHref: "/studio",
    });
  }
  const scoped = /^(work|remix):([\w.~-]{1,120})$/u.exec(requestedScope ?? "");
  if (scoped) {
    const kind = scoped[1] as "work" | "remix";
    const documentId = scoped[2];
    return Object.freeze({
      key: `${kind}:${documentId}`,
      kind,
      documentId,
      label: kind === "work" ? `작품 ${documentId}` : `리믹스 ${documentId}`,
      editorHref: `/studio/${kind}/${encodeURIComponent(documentId)}/canvas`,
    });
  }

  return Object.freeze({
    key: "portfolio:default",
    kind: "portfolio",
    documentId: null,
    label: "Studio 제작 포트폴리오",
    editorHref: "/studio",
  });
}

export function studioProductionSurfaceHref(
  surface: StudioProductionSurface,
  scope: StudioProductionScope,
): string {
  if (
    (surface === "review" || surface === "versions" || surface === "present")
    && (scope.kind === "work" || scope.kind === "remix")
    && scope.documentId !== null
  ) {
    return `/studio/${scope.kind}/${encodeURIComponent(scope.documentId)}/${surface}`;
  }
  const params = new URLSearchParams();
  if (scope.key !== "portfolio:default") params.set("scope", scope.key);
  const query = params.toString();
  return query.length > 0 ? `/studio/${surface}?${query}` : `/studio/${surface}`;
}

export function studioProductionEpisodeProgress(episode: StudioProductionEpisode): number {
  if (episode.status === "done" || episode.stage === "delivered") return 100;
  const base = STAGE_PROGRESS[episode.stage];
  if (episode.status === "review") return Math.min(99, base + 3);
  if (episode.status === "blocked") return Math.max(1, base - 4);
  if (episode.status === "planned") return Math.max(1, base - 6);
  return base;
}

export function buildStudioReviewGate(workspace: StudioProductionWorkspace): StudioReviewGate {
  const active = workspace.reviews.filter(
    (item) => item.status !== "resolved" && item.status !== "waived",
  );
  const blockerCount = active.filter((item) => item.severity === "blocker").length;
  const majorCount = active.filter((item) => item.severity === "major").length;
  const missingRequiredChecks = workspace.deliveryChecklist.filter(
    (item) => item.required && !item.done,
  );
  const reasons: string[] = [];
  if (blockerCount > 0) reasons.push(`차단 이슈 ${blockerCount}건`);
  if (majorCount > 0) reasons.push(`중요 이슈 ${majorCount}건`);
  if (missingRequiredChecks.length > 0) {
    reasons.push(`필수 납품 체크 ${missingRequiredChecks.length}건`);
  }
  const totalGateUnits = Math.max(
    1,
    workspace.deliveryChecklist.filter((item) => item.required).length + active.length,
  );
  const unresolvedWeight = blockerCount * 2 + majorCount;
  const missingWeight = missingRequiredChecks.length;
  const readinessPercent = cappedPercent(
    100 - ((unresolvedWeight + missingWeight) / (totalGateUnits + blockerCount)) * 100,
  );
  return Object.freeze({
    ready: reasons.length === 0,
    blockerCount,
    majorCount,
    missingRequiredChecks,
    reasons,
    readinessPercent,
  });
}

export function buildStudioProductionOverview(
  workspace: StudioProductionWorkspace,
  nowIso = new Date().toISOString(),
): StudioProductionOverview {
  const totalPanels = workspace.episodes.reduce(
    (sum, episode) => sum + Math.max(episode.panelCount, 1),
    0,
  );
  const weightedProgress = workspace.episodes.reduce(
    (sum, episode) => sum + studioProductionEpisodeProgress(episode) * Math.max(episode.panelCount, 1),
    0,
  );
  const completionPercent = totalPanels > 0
    ? cappedPercent(weightedProgress / totalPanels)
    : 0;
  const remainingHours = Math.round(
    workspace.episodes.reduce(
      (sum, episode) => sum + Math.max(0, episode.plannedHours - episode.spentHours),
      0,
    ) * 10,
  ) / 10;
  const today = nowIso.slice(0, 10);
  const overdueCount = workspace.episodes.filter(
    (episode) => episode.status !== "done" && compareDate(episode.dueOn, today) < 0,
  ).length;
  const blockedCount = workspace.episodes.filter((episode) => episode.status === "blocked").length;
  const openReviews = workspace.reviews.filter(
    (item) => item.status !== "resolved" && item.status !== "waived",
  );
  const gate = buildStudioReviewGate(workspace);
  const capacity = Math.max(1, workspace.dailyCapacityHours);
  const projectedDays = Math.ceil(remainingHours / capacity);
  const projectedDate = new Date(`${today}T00:00:00.000Z`);
  projectedDate.setUTCDate(projectedDate.getUTCDate() + projectedDays);
  const targetDate = new Date(`${workspace.projectBrief.targetReleaseOn}T00:00:00.000Z`);
  const nowDate = new Date(`${today}T00:00:00.000Z`);
  const daysToTarget = Math.max(1, Math.ceil((targetDate.getTime() - nowDate.getTime()) / 86_400_000));
  const requiredDailyHours = Math.round((remainingHours / daysToTarget) * 10) / 10;
  const critical = overdueCount > 1
    || gate.blockerCount > 0
    || requiredDailyHours > capacity * 1.35;
  const atRisk = blockedCount > 0
    || overdueCount > 0
    || gate.majorCount > 0
    || requiredDailyHours > capacity;
  return Object.freeze({
    completionPercent,
    remainingHours,
    overdueCount,
    blockedCount,
    openReviewCount: openReviews.length,
    reviewBlockerCount: gate.blockerCount,
    missingRequiredChecks: gate.missingRequiredChecks.length,
    projectedDeliveryOn: dateOnly(projectedDate),
    requiredDailyHours,
    risk: critical ? "critical" : atRisk ? "at_risk" : "healthy",
  });
}

export function snapshotPayloadFromWorkspace(
  workspace: StudioProductionWorkspace,
): StudioProductionSnapshotPayload {
  return cloneValue({
    title: workspace.title,
    seriesTitle: workspace.seriesTitle,
    projectBrief: workspace.projectBrief,
    dailyCapacityHours: workspace.dailyCapacityHours,
    episodes: workspace.episodes,
    deliveryChecklist: workspace.deliveryChecklist,
    reviews: workspace.reviews,
    pitchSlides: workspace.pitchSlides,
    releaseApproval: workspace.releaseApproval,
  });
}

export function hashStudioProductionValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 2_166_136_261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createStudioVersionSnapshot(
  workspace: StudioProductionWorkspace,
  input: {
    readonly name: string;
    readonly summary?: string;
    readonly branch?: string;
    readonly kind?: StudioVersionSnapshot["kind"];
    readonly author?: string;
    readonly nowIso?: string;
  },
): StudioVersionSnapshot {
  const payload = snapshotPayloadFromWorkspace(workspace);
  return {
    id: nextId("version"),
    name: input.name.trim().slice(0, 120) || "이름 없는 버전",
    summary: input.summary?.trim().slice(0, 500) ?? "",
    branch: input.branch?.trim().slice(0, 80) || "main",
    kind: input.kind ?? "manual",
    author: input.author?.trim().slice(0, 80) || workspace.owner,
    createdAt: input.nowIso ?? new Date().toISOString(),
    parentId: workspace.versions[0]?.id ?? null,
    pinned: false,
    checksum: hashStudioProductionValue(payload),
    payload,
  };
}

function changedById<T extends { readonly id: string }>(
  left: readonly T[],
  right: readonly T[],
): { added: number; removed: number; changed: number } {
  const leftMap = new Map(left.map((item) => [item.id, item]));
  const rightMap = new Map(right.map((item) => [item.id, item]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [id, item] of rightMap) {
    const before = leftMap.get(id);
    if (!before) added += 1;
    else if (JSON.stringify(before) !== JSON.stringify(item)) changed += 1;
  }
  for (const id of leftMap.keys()) {
    if (!rightMap.has(id)) removed += 1;
  }
  return { added, removed, changed };
}

export function diffStudioVersionSnapshots(
  before: StudioVersionSnapshot,
  after: StudioVersionSnapshot,
): StudioSnapshotDiff {
  const episodes = changedById(before.payload.episodes, after.payload.episodes);
  const reviews = changedById(before.payload.reviews, after.payload.reviews);
  const checklist = changedById(
    before.payload.deliveryChecklist,
    after.payload.deliveryChecklist,
  );
  const slides = changedById(before.payload.pitchSlides, after.payload.pitchSlides);
  let projectFieldsChanged = 0;
  const details: string[] = [];
  for (const [label, left, right] of [
    ["프로젝트 제목", before.payload.title, after.payload.title],
    ["시리즈 제목", before.payload.seriesTitle, after.payload.seriesTitle],
    ["작업 용량", before.payload.dailyCapacityHours, after.payload.dailyCapacityHours],
    ["프로젝트 브리프", before.payload.projectBrief, after.payload.projectBrief],
    ["출시 승인", before.payload.releaseApproval, after.payload.releaseApproval],
  ] as const) {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      projectFieldsChanged += 1;
      details.push(`${label} 변경`);
    }
  }
  if (episodes.added > 0) details.push(`회차 ${episodes.added}개 추가`);
  if (episodes.removed > 0) details.push(`회차 ${episodes.removed}개 삭제`);
  if (episodes.changed > 0) details.push(`회차 ${episodes.changed}개 수정`);
  if (reviews.changed + reviews.added + reviews.removed > 0) {
    details.push(`리뷰 ${reviews.changed + reviews.added + reviews.removed}건 변경`);
  }
  if (checklist.changed + checklist.added + checklist.removed > 0) {
    details.push(`납품 체크 ${checklist.changed + checklist.added + checklist.removed}건 변경`);
  }
  if (slides.changed + slides.added + slides.removed > 0) {
    details.push(`피치 슬라이드 ${slides.changed + slides.added + slides.removed}장 변경`);
  }
  const reviewsChanged = reviews.changed + reviews.added + reviews.removed;
  const checklistChanged = checklist.changed + checklist.added + checklist.removed;
  const slidesChanged = slides.changed + slides.added + slides.removed;
  const totalChanges = episodes.added + episodes.removed + episodes.changed
    + reviewsChanged + checklistChanged + slidesChanged + projectFieldsChanged;
  return Object.freeze({
    totalChanges,
    episodesAdded: episodes.added,
    episodesRemoved: episodes.removed,
    episodesChanged: episodes.changed,
    reviewsChanged,
    checklistChanged,
    slidesChanged,
    projectFieldsChanged,
    details,
  });
}

export function restoreStudioVersionSnapshot(
  workspace: StudioProductionWorkspace,
  snapshot: StudioVersionSnapshot,
  nowIso = new Date().toISOString(),
): StudioProductionWorkspace {
  const payload = cloneValue(snapshot.payload);
  const restored = {
    ...workspace,
    ...payload,
    updatedAt: nowIso,
  };
  const restoreSnapshot = createStudioVersionSnapshot(restored, {
    name: `${snapshot.name} 복원`,
    summary: `버전 ${snapshot.name}의 제작 상태를 복원했습니다.`,
    branch: snapshot.branch,
    kind: "restore",
    nowIso,
  });
  return {
    ...restored,
    versions: [restoreSnapshot, ...workspace.versions],
  };
}

function randomTokenPart(): string {
  const bytes = new Uint8Array(12);
  try {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(36).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${nextId("token").replaceAll("-", "")}`;
  }
}

export function createStudioShareGrant(
  input: {
    readonly label: string;
    readonly role: StudioShareRole;
    readonly expiresInDays: number;
    readonly downloadsAllowed: boolean;
    readonly watermark: boolean;
    readonly approvalRequired: boolean;
    readonly nowIso?: string;
  },
): StudioShareGrant {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const expires = new Date(nowIso);
  expires.setUTCDate(expires.getUTCDate() + Math.max(1, Math.min(90, Math.round(input.expiresInDays))));
  return {
    id: nextId("grant"),
    token: `ts-${randomTokenPart().slice(0, 30)}`,
    label: input.label.trim().slice(0, 120) || "공유 링크",
    role: input.role,
    expiresAt: expires.toISOString(),
    downloadsAllowed: input.downloadsAllowed,
    watermark: input.watermark,
    approvalRequired: input.approvalRequired,
    createdAt: nowIso,
    revokedAt: null,
    lastOpenedAt: null,
  };
}

export function isStudioShareGrantActive(
  grant: StudioShareGrant,
  nowIso = new Date().toISOString(),
): boolean {
  return grant.revokedAt === null && grant.expiresAt > nowIso;
}

export function buildStudioInviteHref(
  grant: StudioShareGrant,
  scope: StudioProductionScope,
  origin = "",
): string {
  const params = new URLSearchParams({ invite: grant.token });
  if (scope.key !== "portfolio:default") params.set("scope", scope.key);
  return `${origin}/studio/join?${params.toString()}`;
}

export function joinStudioProductionWorkspace(
  workspace: StudioProductionWorkspace,
  input: {
    readonly token: string;
    readonly name: string;
    readonly nowIso?: string;
  },
): { readonly ok: true; readonly workspace: StudioProductionWorkspace; readonly participant: StudioParticipant }
  | { readonly ok: false; readonly error: string } {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const token = input.token.trim();
  const grant = workspace.shareGrants.find((item) => item.token === token);
  if (!grant) return { ok: false, error: "이 프로젝트에서 발급한 초대 코드를 찾지 못했습니다." };
  if (grant.revokedAt !== null) return { ok: false, error: "취소된 초대 링크입니다." };
  if (grant.expiresAt <= nowIso) return { ok: false, error: "만료된 초대 링크입니다." };
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "표시 이름을 2자 이상 입력해 주세요." };
  const participant: StudioParticipant = {
    id: nextId("participant"),
    name,
    role: grant.role,
    status: grant.approvalRequired ? "pending" : "online",
    joinedAt: nowIso,
    lastSeenAt: nowIso,
    sourceGrantId: grant.id,
  };
  return {
    ok: true,
    participant,
    workspace: {
      ...workspace,
      shareGrants: workspace.shareGrants.map((item) => (
        item.id === grant.id ? { ...item, lastOpenedAt: nowIso } : item
      )),
      participants: [participant, ...workspace.participants],
      updatedAt: nowIso,
    },
  };
}

export function appendStudioProductionAudit(
  workspace: StudioProductionWorkspace,
  input: {
    readonly action: string;
    readonly detail?: string;
    readonly actor?: string;
    readonly nowIso?: string;
  },
): StudioProductionWorkspace {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const event: StudioProductionAuditEvent = {
    id: nextId("audit"),
    actor: input.actor?.trim().slice(0, 80) || workspace.owner,
    action: input.action.trim().slice(0, 120) || "프로젝트 변경",
    detail: input.detail?.trim().slice(0, 500) ?? "",
    createdAt: nowIso,
  };
  return {
    ...workspace,
    audit: [event, ...workspace.audit].slice(0, 1_000),
    updatedAt: nowIso,
  };
}

export function serializeStudioProductionWorkspace(
  workspace: StudioProductionWorkspace,
  exportedAt = new Date().toISOString(),
): string {
  const normalized = StudioProductionWorkspaceSchema.parse(workspace);
  return JSON.stringify({
    kind: "toonstudio-production-export",
    version: 1,
    exportedAt,
    checksum: hashStudioProductionValue(normalized),
    workspace: normalized,
  }, null, 2);
}

export function parseStudioProductionWorkspaceExport(
  serialized: string,
  targetScope: StudioProductionScope,
): StudioProductionImportResult {
  if (serialized.length > 8_000_000) {
    return { ok: false, error: "프로젝트 운영 파일이 8MB 제한을 넘었습니다." };
  }
  try {
    const parsed = StudioProductionExportEnvelopeSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success) {
      return { ok: false, error: "지원하는 Studio 제작 운영 파일 형식이 아닙니다." };
    }
    if (hashStudioProductionValue(parsed.data.workspace) !== parsed.data.checksum) {
      return { ok: false, error: "파일 체크섬이 맞지 않습니다. 손상되었거나 일부가 수정되었습니다." };
    }
    const nowIso = new Date().toISOString();
    const rebound = StudioProductionWorkspaceSchema.parse({
      ...parsed.data.workspace,
      scopeKey: targetScope.key,
      updatedAt: nowIso,
    });
    return {
      ok: true,
      workspace: appendStudioProductionAudit(rebound, {
        action: "운영 파일 가져오기",
        detail: `${parsed.data.workspace.scopeKey}에서 ${targetScope.key}로 가져왔습니다.`,
        nowIso,
      }),
    };
  } catch {
    return { ok: false, error: "파일을 읽을 수 없습니다. JSON 형식을 확인해 주세요." };
  }
}

export function createStudioProductionWorkspace(
  scope: StudioProductionScope,
  nowIso = new Date().toISOString(),
): StudioProductionWorkspace {
  const title = scope.kind === "portfolio"
    ? "새 연재 제작 포트폴리오"
    : scope.kind === "draft"
      ? "새 웹툰 초안"
      : scope.label;
  const base: StudioProductionWorkspace = {
    schema: "toonstudio-production-workspace",
    version: 1,
    scopeKey: scope.key,
    title,
    seriesTitle: "프로젝트 오로라",
    owner: "나",
    timezone: "Asia/Seoul",
    dailyCapacityHours: 6,
    projectBrief: {
      genre: "드라마 · 판타지",
      logline: "기억을 색으로 보는 복원사가 사라진 도시의 마지막 밤을 기록한다.",
      seasonLabel: "시즌 1",
      targetPlatform: "세로 스크롤 웹툰",
      targetRating: "15세 이용가",
      targetReleaseOn: shiftDays(nowIso, 18),
    },
    episodes: [
      {
        id: "episode-001",
        number: 1,
        title: "도시가 잠든 날",
        stage: "delivered",
        status: "done",
        owner: "희준",
        dueOn: shiftDays(nowIso, -21),
        priority: "normal",
        panelCount: 68,
        plannedHours: 54,
        spentHours: 52,
        words: 1_540,
        localeCount: 2,
        notes: "런칭 회차. 대표 썸네일과 플랫폼 배너 포함.",
        tags: ["런칭", "대표회차"],
        updatedAt: shiftHours(nowIso, -240),
      },
      {
        id: "episode-002",
        number: 2,
        title: "파란 기억의 주인",
        stage: "qa",
        status: "review",
        owner: "희준",
        dueOn: shiftDays(nowIso, -1),
        priority: "urgent",
        panelCount: 74,
        plannedHours: 58,
        spentHours: 55,
        words: 1_720,
        localeCount: 2,
        notes: "최종 검수와 번역 식자 확인 필요.",
        tags: ["검수", "번역"],
        updatedAt: shiftHours(nowIso, -8),
      },
      {
        id: "episode-003",
        number: 3,
        title: "유리 정원의 방문자",
        stage: "color",
        status: "active",
        owner: "채색팀",
        dueOn: shiftDays(nowIso, 3),
        priority: "high",
        panelCount: 82,
        plannedHours: 64,
        spentHours: 39,
        words: 1_680,
        localeCount: 1,
        notes: "야간 장면 색조 일관성 확인.",
        tags: ["야간", "군중"],
        updatedAt: shiftHours(nowIso, -2),
      },
      {
        id: "episode-004",
        number: 4,
        title: "두 번째 해가 뜨기 전에",
        stage: "line",
        status: "active",
        owner: "선화팀",
        dueOn: shiftDays(nowIso, 7),
        priority: "normal",
        panelCount: 76,
        plannedHours: 61,
        spentHours: 24,
        words: 1_430,
        localeCount: 1,
        notes: "3D 배경 합성 컷 14개.",
        tags: ["3D", "액션"],
        updatedAt: shiftHours(nowIso, -6),
      },
      {
        id: "episode-005",
        number: 5,
        title: "증언하지 않는 그림자",
        stage: "storyboard",
        status: "blocked",
        owner: "콘티",
        dueOn: shiftDays(nowIso, 11),
        priority: "high",
        panelCount: 70,
        plannedHours: 56,
        spentHours: 12,
        words: 1_910,
        localeCount: 1,
        notes: "후반부 추격 동선 승인 대기.",
        tags: ["승인대기", "추격"],
        updatedAt: shiftHours(nowIso, -24),
      },
      {
        id: "episode-006",
        number: 6,
        title: "복원사의 선택",
        stage: "script",
        status: "planned",
        owner: "각색",
        dueOn: shiftDays(nowIso, 15),
        priority: "normal",
        panelCount: 66,
        plannedHours: 52,
        spentHours: 4,
        words: 2_120,
        localeCount: 1,
        notes: "시즌 중간 전환점.",
        tags: ["전환점"],
        updatedAt: shiftHours(nowIso, -48),
      },
    ],
    deliveryChecklist: [
      { id: "check-story", category: "story", label: "대본·콘티 최종 잠금", required: true, done: true, owner: "편집", evidence: "시나리오 v12" },
      { id: "check-art", category: "art", label: "레이어·재단선·여백 확인", required: true, done: true, owner: "작화", evidence: "프리플라이트 96점" },
      { id: "check-letter", category: "lettering", label: "말풍선 순서·오탈자 검수", required: true, done: false, owner: "식자", evidence: "" },
      { id: "check-rights", category: "rights", label: "폰트·에셋 상업 이용권 확인", required: true, done: false, owner: "PD", evidence: "" },
      { id: "check-a11y", category: "accessibility", label: "색 대비·텍스트 가독성 확인", required: false, done: true, owner: "QA", evidence: "모바일 360px 검수" },
      { id: "check-localize", category: "localization", label: "번역 확장 여백과 금칙 처리", required: false, done: false, owner: "번역", evidence: "" },
      { id: "check-platform", category: "platform", label: "플랫폼 용량·길이·포맷 규격", required: true, done: true, owner: "PD", evidence: "JPEG 80%, 1280px" },
      { id: "check-backup", category: "backup", label: "원본·납품본·영수증 백업", required: true, done: false, owner: "PD", evidence: "" },
    ],
    reviews: [
      {
        id: "review-001",
        episodeId: "episode-002",
        pageLabel: "2화 · 패널 43",
        title: "주요 소품이 직전 컷과 반대 손에 있음",
        detail: "연속성 메타데이터 기준으로 우산은 오른손 유지가 필요합니다.",
        category: "continuity",
        severity: "blocker",
        status: "open",
        assignee: "선화팀",
        reporter: "연속성 검사",
        dueOn: shiftDays(nowIso, 0),
        comments: [
          { id: "comment-001", author: "PD", body: "납품 전 반드시 수정해 주세요.", createdAt: shiftHours(nowIso, -5) },
        ],
        createdAt: shiftHours(nowIso, -7),
        updatedAt: shiftHours(nowIso, -5),
      },
      {
        id: "review-002",
        episodeId: "episode-002",
        pageLabel: "2화 · 패널 57",
        title: "모바일에서 독백 글자가 18px 아래로 내려감",
        detail: "360px 미리보기에서 안전 영역과 겹칩니다.",
        category: "lettering",
        severity: "major",
        status: "in_progress",
        assignee: "식자",
        reporter: "모바일 프리플라이트",
        dueOn: shiftDays(nowIso, 0),
        comments: [],
        createdAt: shiftHours(nowIso, -9),
        updatedAt: shiftHours(nowIso, -3),
      },
      {
        id: "review-003",
        episodeId: "episode-003",
        pageLabel: "3화 · 야간 시퀀스",
        title: "야간 장면 피부톤 기준색 확인",
        detail: "1화 기준 팔레트와 ΔE 차이를 확인해 주세요.",
        category: "art",
        severity: "minor",
        status: "open",
        assignee: "채색팀",
        reporter: "색상 검수",
        dueOn: shiftDays(nowIso, 2),
        comments: [],
        createdAt: shiftHours(nowIso, -20),
        updatedAt: shiftHours(nowIso, -20),
      },
      {
        id: "review-004",
        episodeId: null,
        pageLabel: "전 회차",
        title: "영문판 폰트 재배포 권한 증빙 첨부",
        detail: "번역 납품 패키지에 라이선스 영수증을 포함합니다.",
        category: "rights",
        severity: "major",
        status: "open",
        assignee: "PD",
        reporter: "권리 프리플라이트",
        dueOn: shiftDays(nowIso, 3),
        comments: [],
        createdAt: shiftHours(nowIso, -28),
        updatedAt: shiftHours(nowIso, -28),
      },
    ],
    versions: [],
    pitchSlides: [
      { id: "slide-001", layout: "cover", eyebrow: "TOON STUDIO ORIGINAL", title: "프로젝트 오로라", body: "기억을 색으로 보는 복원사의 마지막 기록", speakerNotes: "작품 제목과 핵심 정서를 10초 안에 소개합니다.", durationSec: 18, hidden: false, mediaHint: "대표 세로 컷" },
      { id: "slide-002", layout: "statement", eyebrow: "HOOK", title: "누군가의 기억은 도시를 구하고, 누군가의 기억은 도시를 지운다.", body: "색으로 보이는 기억을 거래하는 세계에서 벌어지는 감정 미스터리.", speakerNotes: "장르와 독자의 첫 질문을 연결합니다.", durationSec: 35, hidden: false, mediaHint: "강한 한 컷" },
      { id: "slide-003", layout: "character", eyebrow: "CHARACTERS", title: "복원사 윤서 · 기록관 라온", body: "서로 다른 방식으로 진실을 보존하려는 두 주인공의 충돌과 연대.", speakerNotes: "관계의 긴장과 시즌 변화를 설명합니다.", durationSec: 45, hidden: false, mediaHint: "캐릭터 시트" },
      { id: "slide-004", layout: "world", eyebrow: "WORLD", title: "빛이 사라진 뒤에도 색은 기억한다", body: "시간대별 색 규칙과 도시 구역별 시각 언어를 일관되게 설계했습니다.", speakerNotes: "3D 배경과 팔레트 시스템의 재사용성을 강조합니다.", durationSec: 38, hidden: false, mediaHint: "세계관 보드" },
      { id: "slide-005", layout: "sequence", eyebrow: "VERTICAL RHYTHM", title: "세로 스크롤에서만 가능한 침묵의 길이", body: "긴 여백, 반복 모티프, 속도 변화로 감정의 호흡을 설계합니다.", speakerNotes: "실제 2화 시퀀스를 스크롤하며 보여 줍니다.", durationSec: 55, hidden: false, mediaHint: "스크롤 시퀀스" },
      { id: "slide-006", layout: "cta", eyebrow: "NEXT", title: "시즌 1 · 24화 제작", body: "주 1회 공개, 한국어·영어 동시 제작, 3화 선행 버퍼를 목표로 합니다.", speakerNotes: "제작 일정과 필요한 파트너십을 명확히 요청합니다.", durationSec: 30, hidden: false, mediaHint: "로드맵" },
    ],
    shareGrants: [],
    participants: [
      { id: "participant-owner", name: "나", role: "producer", status: "online", joinedAt: nowIso, lastSeenAt: nowIso, sourceGrantId: null },
      { id: "participant-color", name: "채색팀", role: "editor", status: "offline", joinedAt: shiftHours(nowIso, -240), lastSeenAt: shiftHours(nowIso, -18), sourceGrantId: null },
    ],
    audit: [
      { id: "audit-initial", actor: "Studio", action: "제작 운영 허브 생성", detail: `${scope.label}의 프로젝트·검수·버전·피치·공유 흐름을 준비했습니다.`, createdAt: nowIso },
    ],
    releaseApproval: {
      status: "pending",
      actor: "PD",
      note: "차단 이슈와 필수 납품 체크를 닫으면 승인할 수 있습니다.",
      updatedAt: nowIso,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const baseline = createStudioVersionSnapshot(base, {
    name: "제작 운영 기준선",
    summary: "프로젝트 보드가 생성된 최초 기준 버전입니다.",
    branch: "main",
    kind: "baseline",
    author: "Studio",
    nowIso,
  });
  return StudioProductionWorkspaceSchema.parse({
    ...base,
    versions: [baseline],
  });
}
