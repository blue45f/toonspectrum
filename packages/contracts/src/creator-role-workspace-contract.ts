import {
  CREATOR_ROLE_IDS,
  CREATOR_SPECIALTY_IDS,
  type CreatorCollaborationStatus,
  type CreatorExperienceLevel,
  type CreatorRoleId,
  type CreatorRoleProfile,
  type CreatorSpecialtyId,
  type CreatorStage,
  type PublicCreatorRoleProfile,
} from "./creator-role-contract";

export const CREATOR_ROLE_WORKSPACE_VERSION = 1 as const;
export const GLOBAL_CREATOR_ROLE_WORKSPACE_KEY = "global";
export const DEFAULT_CREATOR_ROLE_WORKSPACE_KEY = "draft";
export const CREATOR_ROLE_CUSTOM_LABEL_MAX = 48;
export const CREATOR_ROLE_CHECKLIST_MAX = 96;

export const CREATOR_DETAILED_ROLE_LENSES = [
  "story",
  "planning",
  "storyboard",
  "drawing",
  "background",
  "color-finishing",
  "lettering",
  "review",
  "production",
] as const;
export type CreatorDetailedRoleLens = (typeof CREATOR_DETAILED_ROLE_LENSES)[number];

export const CREATOR_ROLE_WORKSPACE_PRESETS = [
  "quick-sketch",
  "storyboard",
  "lineart",
  "coloring",
  "lettering",
  "review",
  "publish",
  "pro-comic",
  "pose-3d",
] as const;
export type CreatorRoleWorkspacePreset =
  (typeof CREATOR_ROLE_WORKSPACE_PRESETS)[number];

export const CREATOR_ROLE_NOTIFICATION_PRESETS = [
  "focused",
  "balanced",
  "all",
  "muted",
] as const;
export type CreatorRoleNotificationPreset =
  (typeof CREATOR_ROLE_NOTIFICATION_PRESETS)[number];

export const CREATOR_ROLE_USAGE_GOALS = [
  "learning",
  "first-project",
  "personal-project",
  "serialization",
  "drawing-practice",
  "story-writing",
  "character-building",
  "team-production",
  "portfolio",
  "studio-management",
  "education",
  "outsourcing",
] as const;
export type CreatorRoleUsageGoal = (typeof CREATOR_ROLE_USAGE_GOALS)[number];

export const CREATOR_ACCOUNT_CONTEXTS = ["individual", "education", "studio"] as const;
export type CreatorAccountContext = (typeof CREATOR_ACCOUNT_CONTEXTS)[number];

export const CREATOR_WORKSPACE_MODES = ["guided", "creator", "production"] as const;
export type CreatorWorkspaceMode = (typeof CREATOR_WORKSPACE_MODES)[number];

export const CREATOR_COLLABORATION_MODES = ["solo", "team"] as const;
export type CreatorCollaborationMode =
  (typeof CREATOR_COLLABORATION_MODES)[number];

export const CREATOR_COLLABORATION_LEVELS = [
  "solo",
  "lightweight",
  "studio",
] as const;
export type CreatorCollaborationLevel =
  (typeof CREATOR_COLLABORATION_LEVELS)[number];

export const CREATOR_ROLE_NOTIFICATION_EVENTS = [
  "assignment",
  "handoff-ready",
  "review-request",
  "revision-request",
  "deadline-risk",
  "unassigned-work",
  "approval-needed",
  "publish-risk",
  "canon-change",
  "question",
] as const;
export type CreatorRoleNotificationEvent =
  (typeof CREATOR_ROLE_NOTIFICATION_EVENTS)[number];

export const CREATOR_ROLE_AI_TOOL_IDS = [
  "canon-conflict",
  "dialogue-voice",
  "script-to-panels",
  "composition-review",
  "reference-organizer",
  "layer-preflight",
  "background-brief",
  "palette-consistency",
  "lettering-proof",
  "review-summary",
  "schedule-risk",
  "workload-balance",
] as const;
export type CreatorRoleAiToolId = (typeof CREATOR_ROLE_AI_TOOL_IDS)[number];

export const CREATOR_PRODUCTION_ROLES = [
  "story",
  "storyboard",
  "lineart",
  "color",
  "background",
  "lettering",
  "reviewer",
  "director",
  "publisher",
] as const;
export type CreatorProductionRole = (typeof CREATOR_PRODUCTION_ROLES)[number];

export interface CreatorRoleVisibility {
  readonly roles: boolean;
  readonly specialties: boolean;
  readonly experienceLevel: boolean;
  readonly collaborationStatus: boolean;
}

export interface CreatorRoleCapacity {
  readonly weeklyCapacityHours: number | null;
  readonly currentAssignedHours: number;
  readonly concurrentTaskLimit: number | null;
  readonly unavailableUntil: string | null;
}

export interface CreatorRoleWorkspacePreference {
  readonly version: typeof CREATOR_ROLE_WORKSPACE_VERSION;
  readonly activeRole: CreatorRoleId | null;
  readonly detailedLens: CreatorDetailedRoleLens | null;
  readonly workspacePreset: CreatorRoleWorkspacePreset | null;
  readonly notificationPreset: CreatorRoleNotificationPreset;
  readonly notificationOverrides: Readonly<
    Partial<Record<CreatorRoleNotificationEvent, boolean>>
  >;
  readonly usageGoals: readonly CreatorRoleUsageGoal[];
  readonly accountContext: CreatorAccountContext;
  readonly workspaceMode: CreatorWorkspaceMode;
  readonly collaborationMode: CreatorCollaborationMode;
  readonly capacity: CreatorRoleCapacity;
  readonly visibility: CreatorRoleVisibility;
  readonly customRoleLabel: string | null;
  readonly onboardingComplete: boolean;
  readonly checklistStates: Readonly<Record<string, boolean>>;
}

export interface CreatorRoleWorkspaceSnapshot {
  readonly projectKey: string;
  readonly revision: number;
  readonly document: CreatorRoleWorkspacePreference;
  readonly updatedAt: string | null;
  readonly source: "server" | "local" | "default";
}

export interface CreatorRoleChecklistItem {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export interface CreatorRoleAiTool {
  readonly id: CreatorRoleAiToolId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly href: string;
}

export type CreatorWorkReason =
  | "assigned-to-me"
  | "role-match"
  | "overdue"
  | "due-today"
  | "due-soon"
  | "blocked"
  | "urgent"
  | "review-requested"
  | "approval-required"
  | "dependency-ready";

export interface CreatorRoleTaskLike {
  readonly id: string;
  readonly title: string;
  readonly owner?: string;
  readonly due: string;
  readonly status: "todo" | "doing" | "blocked" | "done";
  readonly priority?: "low" | "normal" | "high" | "urgent";
  readonly role?: CreatorProductionRole | null;
  readonly dependencyIds?: readonly string[];
  readonly assigneeIds?: readonly string[];
  readonly reviewerIds?: readonly string[];
  readonly blockedReason?: string;
}

export interface CreatorRoleReviewLike {
  readonly id: string;
  readonly title: string;
  readonly assignee?: string;
  readonly severity: "blocker" | "major" | "minor";
  readonly status: "open" | "resolved";
  readonly requestedByRole?: CreatorProductionRole | null;
  readonly approvalRequired?: boolean;
}

export interface CreatorRoleAssignmentLike {
  readonly id: string;
  readonly memberId: string | null;
  readonly displayName: string;
  readonly roles: readonly CreatorProductionRole[];
}

export interface CreatorRoleWorkspaceLike {
  readonly tasks: readonly CreatorRoleTaskLike[];
  readonly reviews: readonly CreatorRoleReviewLike[];
  readonly roleAssignments: readonly CreatorRoleAssignmentLike[];
}

export interface RankedCreatorWorkItem {
  readonly id: string;
  readonly kind: "task" | "review";
  readonly title: string;
  readonly score: number;
  readonly reasons: readonly CreatorWorkReason[];
  readonly due: string | null;
  readonly status: string;
  readonly productionRole: CreatorProductionRole | null;
}

export interface PublicCreatorRoleCandidate {
  readonly userId: string;
  readonly name: string;
  readonly roleProfile: PublicCreatorRoleProfile;
  readonly capacity?: CreatorRoleCapacity | null;
  readonly customRoleLabel?: string | null;
}

export interface CreatorTeamRoleRecommendation {
  readonly userId: string;
  readonly name: string;
  readonly productionRole: CreatorProductionRole;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface CreatorRoleMatchCriteria {
  readonly role?: CreatorRoleId | null;
  readonly specialties?: readonly CreatorSpecialtyId[];
  readonly collaborationStatus?: CreatorCollaborationStatus | null;
}

const ROLE_ID_SET = new Set<string>(CREATOR_ROLE_IDS);
const SPECIALTY_ID_SET = new Set<string>(CREATOR_SPECIALTY_IDS);
const LENS_SET = new Set<string>(CREATOR_DETAILED_ROLE_LENSES);
const WORKSPACE_PRESET_SET = new Set<string>(CREATOR_ROLE_WORKSPACE_PRESETS);
const NOTIFICATION_PRESET_SET = new Set<string>(CREATOR_ROLE_NOTIFICATION_PRESETS);
const USAGE_GOAL_SET = new Set<string>(CREATOR_ROLE_USAGE_GOALS);
const ACCOUNT_CONTEXT_SET = new Set<string>(CREATOR_ACCOUNT_CONTEXTS);
const WORKSPACE_MODE_SET = new Set<string>(CREATOR_WORKSPACE_MODES);
const COLLABORATION_MODE_SET = new Set<string>(CREATOR_COLLABORATION_MODES);
const NOTIFICATION_EVENT_SET = new Set<string>(CREATOR_ROLE_NOTIFICATION_EVENTS);
const PRODUCTION_ROLE_SET = new Set<string>(CREATOR_PRODUCTION_ROLES);

export const EMPTY_CREATOR_ROLE_VISIBILITY: CreatorRoleVisibility = Object.freeze({
  roles: false,
  specialties: false,
  experienceLevel: false,
  collaborationStatus: false,
});

export const EMPTY_CREATOR_ROLE_CAPACITY: CreatorRoleCapacity = Object.freeze({
  weeklyCapacityHours: null,
  currentAssignedHours: 0,
  concurrentTaskLimit: null,
  unavailableUntil: null,
});

export const EMPTY_CREATOR_ROLE_WORKSPACE_PREFERENCE: CreatorRoleWorkspacePreference =
  Object.freeze({
    version: CREATOR_ROLE_WORKSPACE_VERSION,
    activeRole: null,
    detailedLens: null,
    workspacePreset: null,
    notificationPreset: "balanced",
    notificationOverrides: Object.freeze({}),
    usageGoals: Object.freeze([]),
    accountContext: "individual",
    workspaceMode: "creator",
    collaborationMode: "solo",
    capacity: EMPTY_CREATOR_ROLE_CAPACITY,
    visibility: EMPTY_CREATOR_ROLE_VISIBILITY,
    customRoleLabel: null,
    onboardingComplete: false,
    checklistStates: Object.freeze({}),
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(minimum, Math.min(maximum, value));
}

function nullableIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizeEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | null {
  return typeof value === "string" && allowed.has(value) ? value as T : null;
}

function normalizeDistinctEnums<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  maximum: number,
): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      typeof candidate !== "string"
      || !allowed.has(candidate)
      || seen.has(candidate)
    ) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate as T);
    if (result.length >= maximum) break;
  }
  return result;
}

function normalizeVisibility(value: unknown): CreatorRoleVisibility {
  if (!isRecord(value)) return { ...EMPTY_CREATOR_ROLE_VISIBILITY };
  return {
    roles: value.roles === true,
    specialties: value.specialties === true,
    experienceLevel: value.experienceLevel === true,
    collaborationStatus: value.collaborationStatus === true,
  };
}

function normalizeCapacity(value: unknown): CreatorRoleCapacity {
  if (!isRecord(value)) return { ...EMPTY_CREATOR_ROLE_CAPACITY };
  const weekly = finiteNumber(value.weeklyCapacityHours, 0, 168);
  const assigned = finiteNumber(value.currentAssignedHours, 0, 2_000);
  const concurrent = finiteNumber(value.concurrentTaskLimit, 1, 100);
  return {
    weeklyCapacityHours: weekly === null ? null : Math.round(weekly * 2) / 2,
    currentAssignedHours: assigned === null ? 0 : Math.round(assigned * 2) / 2,
    concurrentTaskLimit: concurrent === null ? null : Math.round(concurrent),
    unavailableUntil: nullableIsoDate(value.unavailableUntil),
  };
}

function normalizeChecklistStates(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  const result: Record<string, boolean> = {};
  for (const [key, checked] of Object.entries(value)) {
    const normalized = key.trim();
    if (
      !normalized
      || normalized.length > 100
      || typeof checked !== "boolean"
      || Object.keys(result).length >= CREATOR_ROLE_CHECKLIST_MAX
    ) {
      continue;
    }
    result[normalized] = checked;
  }
  return result;
}

function normalizeNotificationOverrides(
  value: unknown,
): Partial<Record<CreatorRoleNotificationEvent, boolean>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<CreatorRoleNotificationEvent, boolean>> = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (NOTIFICATION_EVENT_SET.has(key) && typeof enabled === "boolean") {
      result[key as CreatorRoleNotificationEvent] = enabled;
    }
  }
  return result;
}

export function normalizeCreatorRoleWorkspacePreference(
  value: unknown,
): CreatorRoleWorkspacePreference {
  if (!isRecord(value)) {
    return {
      ...EMPTY_CREATOR_ROLE_WORKSPACE_PREFERENCE,
      notificationOverrides: {},
      usageGoals: [],
      capacity: { ...EMPTY_CREATOR_ROLE_CAPACITY },
      visibility: { ...EMPTY_CREATOR_ROLE_VISIBILITY },
      checklistStates: {},
    };
  }

  const activeRole = normalizeEnum<CreatorRoleId>(value.activeRole, ROLE_ID_SET);
  const inferredLens = activeRole ? creatorDetailedRoleLens(activeRole) : null;
  const inferredPreset = activeRole ? creatorRoleStudioWorkspace(activeRole) : null;
  const customRoleLabel = typeof value.customRoleLabel === "string"
    ? value.customRoleLabel.trim().slice(0, CREATOR_ROLE_CUSTOM_LABEL_MAX) || null
    : null;
  const usageGoals = normalizeDistinctEnums<CreatorRoleUsageGoal>(
    value.usageGoals,
    USAGE_GOAL_SET,
    CREATOR_ROLE_USAGE_GOALS.length,
  );
  const collaborationMode =
    normalizeEnum<CreatorCollaborationMode>(
      value.collaborationMode,
      COLLABORATION_MODE_SET,
    )
    ?? (usageGoals.includes("team-production")
      || usageGoals.includes("studio-management")
      ? "team"
      : "solo");

  return {
    version: CREATOR_ROLE_WORKSPACE_VERSION,
    activeRole,
    detailedLens:
      normalizeEnum<CreatorDetailedRoleLens>(value.detailedLens, LENS_SET)
      ?? inferredLens,
    workspacePreset:
      normalizeEnum<CreatorRoleWorkspacePreset>(
        value.workspacePreset,
        WORKSPACE_PRESET_SET,
      )
      ?? inferredPreset,
    notificationPreset:
      normalizeEnum<CreatorRoleNotificationPreset>(
        value.notificationPreset,
        NOTIFICATION_PRESET_SET,
      )
      ?? "balanced",
    notificationOverrides: normalizeNotificationOverrides(
      value.notificationOverrides,
    ),
    usageGoals,
    accountContext:
      normalizeEnum<CreatorAccountContext>(value.accountContext, ACCOUNT_CONTEXT_SET)
      ?? "individual",
    workspaceMode:
      normalizeEnum<CreatorWorkspaceMode>(value.workspaceMode, WORKSPACE_MODE_SET)
      ?? "creator",
    collaborationMode,
    capacity: normalizeCapacity(value.capacity),
    visibility: normalizeVisibility(value.visibility),
    customRoleLabel,
    onboardingComplete: value.onboardingComplete === true,
    checklistStates: normalizeChecklistStates(value.checklistStates),
  };
}

/** Map the legacy mixed creatorStage field into the new account-context axis. */
export function creatorAccountContextFromLegacyStage(
  stage: CreatorStage | null | undefined,
): CreatorAccountContext {
  if (stage === "studio") return "studio";
  if (stage === "student" || stage === "educator") return "education";
  return "individual";
}

/** Preserve old onboarding choices while new flows write the dedicated experienceLevel field. */
export function creatorExperienceLevelFromLegacyStage(
  stage: CreatorStage | null | undefined,
): CreatorExperienceLevel | null {
  if (stage === "student" || stage === "hobbyist") return "beginner";
  if (stage === "aspiring") return "experienced";
  if (stage === "professional" || stage === "studio" || stage === "educator") {
    return "professional";
  }
  return null;
}

/** Recommend information density without changing feature access or project permissions. */
export function recommendCreatorWorkspaceMode(input: {
  readonly accountContext: CreatorAccountContext;
  readonly experienceLevel: CreatorExperienceLevel | null;
  readonly usageGoals: readonly CreatorRoleUsageGoal[];
}): CreatorWorkspaceMode {
  const goals = new Set(input.usageGoals);
  if (
    input.accountContext === "studio"
    || goals.has("studio-management")
    || goals.has("team-production")
  ) {
    return "production";
  }
  if (
    input.experienceLevel === "professional"
    && (goals.has("serialization") || goals.has("outsourcing"))
  ) {
    return "production";
  }
  if (
    input.experienceLevel === "beginner"
    && (
      input.accountContext === "education"
      || goals.has("learning")
      || goals.has("first-project")
      || goals.has("drawing-practice")
    )
  ) {
    return "guided";
  }
  return "creator";
}

export function creatorRoleWorkspacePreferenceForProfile(
  profile: CreatorRoleProfile | null | undefined,
): CreatorRoleWorkspacePreference {
  const activeRole = profile?.activeRole ?? profile?.primaryRole ?? null;
  return normalizeCreatorRoleWorkspacePreference({
    activeRole,
    detailedLens: activeRole ? creatorDetailedRoleLens(activeRole) : null,
    workspacePreset: activeRole ? creatorRoleStudioWorkspace(activeRole) : null,
    visibility: {
      roles: profile?.roleVisibility === true,
      specialties: false,
      experienceLevel: false,
      collaborationStatus: false,
    },
  });
}

export function isCreatorRoleProjectKey(value: unknown): value is string {
  if (value === GLOBAL_CREATOR_ROLE_WORKSPACE_KEY || value === "draft") return true;
  if (typeof value !== "string" || value.length > 170) return false;
  const separator = value.indexOf(":");
  if (separator < 1 || separator === value.length - 1) return false;
  const kind = value.slice(0, separator);
  if (!["work", "remix", "project"].includes(kind)) return false;
  const identity = value.slice(separator + 1);
  return identity.trim() === identity
    && identity !== "."
    && identity !== ".."
    && !identity.includes("\\")
    && ![...identity].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || (code >= 127 && code <= 159);
    });
}

export function resolveCreatorRoleProjectKey(input: {
  readonly pathname?: string | null;
  readonly search?: string | URLSearchParams | null;
}): string {
  const params = input.search instanceof URLSearchParams
    ? input.search
    : new URLSearchParams(input.search ?? "");
  const explicit = params.get("scope") ?? params.get("projectKey");
  if (explicit && isCreatorRoleProjectKey(explicit)) return explicit;

  const projectId = params.get("projectId");
  if (projectId && isCreatorRoleProjectKey(`project:${projectId}`)) {
    return `project:${projectId}`;
  }

  const pathname = input.pathname ?? "";
  const routePatterns: readonly [RegExp, "work" | "remix" | "project"][] = [
    [/\/studio\/work\/([^/?#]+)/u, "work"],
    [/\/studio\/remix\/([^/?#]+)/u, "remix"],
    [/\/production\/projects\/([^/?#]+)/u, "project"],
  ];
  for (const [pattern, kind] of routePatterns) {
    const match = pattern.exec(pathname);
    if (!match?.[1]) continue;
    let identity: string;
    try {
      identity = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    const candidate = `${kind}:${identity}`;
    if (isCreatorRoleProjectKey(candidate)) return candidate;
  }
  return DEFAULT_CREATOR_ROLE_WORKSPACE_KEY;
}

const ROLE_LENSES: Readonly<Record<CreatorRoleId, CreatorDetailedRoleLens>> = {
  creator: "production",
  story: "story",
  planner: "planning",
  storyboard: "storyboard",
  "line-art": "drawing",
  background: "background",
  color: "color-finishing",
  lettering: "lettering",
  character: "drawing",
  "three-d": "background",
  educator: "story",
  assistant: "drawing",
  editor: "review",
  producer: "production",
  localization: "lettering",
  reviewer: "review",
};

export function creatorDetailedRoleLens(
  role: CreatorRoleId | null | undefined,
): CreatorDetailedRoleLens {
  return role ? ROLE_LENSES[role] : "production";
}

const ROLE_WORKSPACES: Readonly<
  Record<CreatorRoleId, CreatorRoleWorkspacePreset>
> = {
  creator: "pro-comic",
  story: "quick-sketch",
  planner: "storyboard",
  storyboard: "storyboard",
  "line-art": "lineart",
  background: "pose-3d",
  color: "coloring",
  lettering: "lettering",
  character: "lineart",
  "three-d": "pose-3d",
  educator: "quick-sketch",
  assistant: "lineart",
  editor: "review",
  producer: "publish",
  localization: "lettering",
  reviewer: "review",
};

export function creatorRoleStudioWorkspace(
  role: CreatorRoleId | null | undefined,
): CreatorRoleWorkspacePreset {
  return role ? ROLE_WORKSPACES[role] : "quick-sketch";
}

export function creatorWorkspaceStudioUiMode(mode: CreatorWorkspaceMode): "basic" | "standard" | "full" {
  if (mode === "guided") return "basic";
  if (mode === "production") return "full";
  return "standard";
}

export function resolveCreatorCollaborationLevel(input: {
  readonly collaborationMode: CreatorCollaborationMode;
  readonly workspaceMode?: CreatorWorkspaceMode;
  readonly serverBacked?: boolean;
  readonly memberCount?: number;
}): CreatorCollaborationLevel {
  const memberCount = Number.isFinite(input.memberCount)
    ? Math.max(0, Math.floor(input.memberCount ?? 0))
    : 0;
  if (memberCount >= 6 && input.workspaceMode === "production") {
    return "studio";
  }
  if (
    input.serverBacked === true
    || memberCount > 1
    || input.collaborationMode === "team"
  ) {
    return "lightweight";
  }
  return "solo";
}

export function creatorCollaborationUiEnabled(
  level: CreatorCollaborationLevel,
): boolean {
  return level !== "solo";
}

const ROLE_PRODUCTION_ROLES: Readonly<
  Record<CreatorRoleId, readonly CreatorProductionRole[]>
> = {
  creator: ["story", "storyboard", "lineart", "publisher"],
  story: ["story"],
  planner: ["story", "director"],
  storyboard: ["storyboard"],
  "line-art": ["lineart"],
  background: ["background"],
  color: ["color"],
  lettering: ["lettering"],
  character: ["lineart"],
  "three-d": ["background"],
  educator: ["story", "reviewer"],
  assistant: ["lineart", "color", "background"],
  editor: ["reviewer", "director"],
  producer: ["director", "publisher"],
  localization: ["lettering", "reviewer"],
  reviewer: ["reviewer"],
};

export function creatorRoleProductionRoles(
  role: CreatorRoleId | null | undefined,
): readonly CreatorProductionRole[] {
  return role ? ROLE_PRODUCTION_ROLES[role] : [];
}

const FOCUSED_NOTIFICATION_EVENTS: Readonly<
  Record<CreatorDetailedRoleLens, readonly CreatorRoleNotificationEvent[]>
> = {
  story: ["canon-change", "question", "review-request"],
  planning: ["canon-change", "approval-needed", "deadline-risk"],
  storyboard: ["handoff-ready", "question", "review-request"],
  drawing: ["assignment", "handoff-ready", "revision-request"],
  background: ["assignment", "handoff-ready", "revision-request"],
  "color-finishing": ["assignment", "handoff-ready", "revision-request"],
  lettering: ["assignment", "handoff-ready", "revision-request"],
  review: ["review-request", "revision-request", "approval-needed"],
  production: ["deadline-risk", "unassigned-work", "approval-needed", "publish-risk"],
};

export function creatorRoleNotificationSettings(
  role: CreatorRoleId | null | undefined,
  preference: Pick<
    CreatorRoleWorkspacePreference,
    "notificationPreset" | "notificationOverrides"
  >,
): Readonly<Record<CreatorRoleNotificationEvent, boolean>> {
  const focused = new Set(
    FOCUSED_NOTIFICATION_EVENTS[creatorDetailedRoleLens(role)],
  );
  const balanced = new Set<CreatorRoleNotificationEvent>([
    ...focused,
    "assignment",
    "deadline-risk",
    "question",
  ]);
  const base = preference.notificationPreset === "all"
    ? new Set<CreatorRoleNotificationEvent>(CREATOR_ROLE_NOTIFICATION_EVENTS)
    : preference.notificationPreset === "muted"
      ? new Set<CreatorRoleNotificationEvent>()
      : preference.notificationPreset === "focused"
        ? focused
        : balanced;
  return Object.freeze(Object.fromEntries(
    CREATOR_ROLE_NOTIFICATION_EVENTS.map((event) => [
      event,
      preference.notificationOverrides[event] ?? base.has(event),
    ]),
  ) as Record<CreatorRoleNotificationEvent, boolean>);
}

const CHECKLISTS: Readonly<
  Record<CreatorDetailedRoleLens, readonly CreatorRoleChecklistItem[]>
> = {
  story: [
    {
      id: "story-canon",
      labelKo: "설정 충돌 확인",
      labelEn: "Check canon conflicts",
      descriptionKo: "인물·세계관·호칭이 기존 설정과 맞는지 확인합니다.",
      descriptionEn: "Verify characters, canon and forms of address.",
    },
    {
      id: "story-dialogue",
      labelKo: "인물 말투 점검",
      labelEn: "Review character voice",
      descriptionKo: "대사가 인물별 말투와 감정선을 유지하는지 확인합니다.",
      descriptionEn: "Keep dialogue aligned with voice and emotional intent.",
    },
    {
      id: "story-handoff",
      labelKo: "작화 인계 정보 작성",
      labelEn: "Prepare art handoff",
      descriptionKo: "꼭 보여야 할 내용과 연출 자유 범위를 구분합니다.",
      descriptionEn: "Separate must-show intent from creative latitude.",
    },
  ],
  planning: [
    {
      id: "planning-audience",
      labelKo: "타깃과 작품 기준 확인",
      labelEn: "Confirm audience and baseline",
      descriptionKo: "장르·독자·작품의 핵심 약속을 명확히 합니다.",
      descriptionEn: "Clarify genre, audience and the core promise.",
    },
    {
      id: "planning-arc",
      labelKo: "시즌·회차 구조 점검",
      labelEn: "Review season and episode arc",
      descriptionKo: "회차 목표와 시즌 내 위치를 연결합니다.",
      descriptionEn: "Connect episode goals to the season arc.",
    },
    {
      id: "planning-decision",
      labelKo: "결정 이력 기록",
      labelEn: "Record decisions",
      descriptionKo: "변경 이유와 영향을 다음 담당자가 알 수 있게 남깁니다.",
      descriptionEn: "Record rationale and impact for the next owner.",
    },
  ],
  storyboard: [
    {
      id: "board-intent",
      labelKo: "장면 의도 확인",
      labelEn: "Confirm scene intent",
      descriptionKo: "대본의 감정과 반드시 보존할 정보를 확인합니다.",
      descriptionEn: "Confirm emotion and must-preserve story information.",
    },
    {
      id: "board-flow",
      labelKo: "시선·스크롤 흐름 점검",
      labelEn: "Review eye and scroll flow",
      descriptionKo: "컷 순서와 여백이 읽는 방향을 자연스럽게 유도하는지 봅니다.",
      descriptionEn: "Check that panels and spacing guide reading naturally.",
    },
    {
      id: "board-handoff",
      labelKo: "작화 질문 해소",
      labelEn: "Resolve art questions",
      descriptionKo: "모호한 구도·배경·연기 지시를 작화 전에 정리합니다.",
      descriptionEn: "Resolve composition, environment and acting ambiguity.",
    },
  ],
  drawing: [
    {
      id: "drawing-reference",
      labelKo: "콘티·레퍼런스 확인",
      labelEn: "Review boards and references",
      descriptionKo: "담당 컷의 입력 자료와 최신 버전을 확인합니다.",
      descriptionEn: "Confirm inputs and the latest source version.",
    },
    {
      id: "drawing-continuity",
      labelKo: "캐릭터 연속성 점검",
      labelEn: "Check character continuity",
      descriptionKo: "의상·소품·표정·작화 기준을 앞뒤 컷과 맞춥니다.",
      descriptionEn: "Match costume, props, acting and drawing standards.",
    },
    {
      id: "drawing-file",
      labelKo: "레이어·파일 규칙 검사",
      labelEn: "Validate layers and files",
      descriptionKo: "레이어명, 해상도, 저장 형식과 제출 위치를 확인합니다.",
      descriptionEn: "Validate layer names, resolution, format and destination.",
    },
  ],
  background: [
    {
      id: "background-camera",
      labelKo: "카메라·원근 확인",
      labelEn: "Confirm camera and perspective",
      descriptionKo: "인물 동선과 컷 의도에 맞는 시점인지 확인합니다.",
      descriptionEn: "Match camera and perspective to action and intent.",
    },
    {
      id: "background-assets",
      labelKo: "에셋 권리·출처 확인",
      labelEn: "Check asset rights",
      descriptionKo: "사용한 2D·3D 소재의 라이선스와 출처를 남깁니다.",
      descriptionEn: "Record licenses and sources for 2D and 3D assets.",
    },
    {
      id: "background-handoff",
      labelKo: "작화용 패스 준비",
      labelEn: "Prepare art passes",
      descriptionKo: "선화·톤·깊이·마스크 등 후속 공정 입력을 준비합니다.",
      descriptionEn: "Prepare line, tone, depth and mask passes.",
    },
  ],
  "color-finishing": [
    {
      id: "color-palette",
      labelKo: "팔레트·광원 기준 확인",
      labelEn: "Confirm palette and lighting",
      descriptionKo: "장면 시간대와 감정에 맞는 색 기준을 적용합니다.",
      descriptionEn: "Apply palette and lighting for time and emotion.",
    },
    {
      id: "color-line",
      labelKo: "선화 정본 확인",
      labelEn: "Confirm approved line art",
      descriptionKo: "승인된 선화 버전과 수정 범위를 확인합니다.",
      descriptionEn: "Use approved line art and the intended revision scope.",
    },
    {
      id: "color-output",
      labelKo: "후보정·출력 점검",
      labelEn: "Review finishing and output",
      descriptionKo: "효과, 색공간, 잘림, 해상도와 용량을 검사합니다.",
      descriptionEn: "Check effects, color space, crop, resolution and size.",
    },
  ],
  lettering: [
    {
      id: "lettering-copy",
      labelKo: "대사 정본 확인",
      labelEn: "Confirm approved copy",
      descriptionKo: "최종 대사와 호칭·맞춤법을 확인합니다.",
      descriptionEn: "Confirm final dialogue, names and proofreading.",
    },
    {
      id: "lettering-balloon",
      labelKo: "말풍선 흐름 점검",
      labelEn: "Review balloon flow",
      descriptionKo: "읽는 순서와 인물 연결이 명확한지 확인합니다.",
      descriptionEn: "Keep reading order and speaker association clear.",
    },
    {
      id: "lettering-safe",
      labelKo: "안전 영역·잘림 검사",
      labelEn: "Check safe areas and clipping",
      descriptionKo: "플랫폼 규격에서 텍스트가 잘리거나 겹치지 않는지 봅니다.",
      descriptionEn: "Check platform safe areas, clipping and overlap.",
    },
  ],
  review: [
    {
      id: "review-scope",
      labelKo: "검수 범위 명시",
      labelEn: "Define review scope",
      descriptionKo: "차단 이슈와 개선 제안을 구분합니다.",
      descriptionEn: "Separate blockers from optional improvements.",
    },
    {
      id: "review-anchor",
      labelKo: "수정 위치·근거 연결",
      labelEn: "Anchor feedback",
      descriptionKo: "페이지·컷·좌표와 수정 이유를 함께 남깁니다.",
      descriptionEn: "Attach page, panel, coordinates and rationale.",
    },
    {
      id: "review-close",
      labelKo: "재제출 확인·종료",
      labelEn: "Verify resubmission",
      descriptionKo: "수정 반영 여부를 확인하고 이슈를 명시적으로 닫습니다.",
      descriptionEn: "Verify changes and explicitly close the issue.",
    },
  ],
  production: [
    {
      id: "production-owner",
      labelKo: "담당자 없는 업무 확인",
      labelEn: "Find unowned work",
      descriptionKo: "마감이 있는 모든 작업에 담당자와 승인자를 지정합니다.",
      descriptionEn: "Assign owners and approvers to scheduled work.",
    },
    {
      id: "production-capacity",
      labelKo: "작업량·병목 점검",
      labelEn: "Review capacity and bottlenecks",
      descriptionKo: "과부하, 선행 작업 지연과 대체 경로를 확인합니다.",
      descriptionEn: "Review overload, delayed dependencies and fallbacks.",
    },
    {
      id: "production-publish",
      labelKo: "연재·납품 위험 확인",
      labelEn: "Review delivery risk",
      descriptionKo: "승인, 규격, 권리와 게시 준비 상태를 확인합니다.",
      descriptionEn: "Confirm approvals, specs, rights and publishing readiness.",
    },
  ],
};

export function creatorRoleChecklist(
  role: CreatorRoleId | null | undefined,
): readonly CreatorRoleChecklistItem[] {
  return CHECKLISTS[creatorDetailedRoleLens(role)];
}

const AI_TOOLS: Readonly<
  Record<CreatorDetailedRoleLens, readonly CreatorRoleAiTool[]>
> = {
  story: [
    {
      id: "canon-conflict",
      titleKo: "설정 충돌 검사",
      titleEn: "Canon conflict check",
      descriptionKo: "대본과 인물·세계관 설정의 불일치를 찾습니다.",
      descriptionEn: "Find conflicts between scripts, characters and canon.",
      href: "/studio/ai-lab?task=canon-conflict",
    },
    {
      id: "dialogue-voice",
      titleKo: "인물 말투 점검",
      titleEn: "Character voice review",
      descriptionKo: "대사가 인물별 말투와 감정선을 유지하는지 검토합니다.",
      descriptionEn: "Review dialogue against character voice and emotion.",
      href: "/studio/ai-lab?task=dialogue-voice",
    },
  ],
  planning: [
    {
      id: "canon-conflict",
      titleKo: "기획 기준 충돌 검사",
      titleEn: "Planning consistency check",
      descriptionKo: "시즌·회차·캐릭터 기획 간 충돌을 찾습니다.",
      descriptionEn: "Find conflicts across season, episode and character plans.",
      href: "/studio/ai-lab?task=canon-conflict",
    },
    {
      id: "schedule-risk",
      titleKo: "기획 변경 영향 분석",
      titleEn: "Change impact analysis",
      descriptionKo: "기획 변경이 일정과 후속 공정에 미치는 영향을 정리합니다.",
      descriptionEn: "Summarize downstream schedule and workflow impact.",
      href: "/studio/ai-lab?task=schedule-risk",
    },
  ],
  storyboard: [
    {
      id: "script-to-panels",
      titleKo: "대본을 컷 지시로 변환",
      titleEn: "Script to panel brief",
      descriptionKo: "장면 목표와 대사를 콘티 초안 지시로 구조화합니다.",
      descriptionEn: "Structure scene goals and dialogue into a panel brief.",
      href: "/studio/ai-lab?task=script-to-panels",
    },
    {
      id: "composition-review",
      titleKo: "구도·스크롤 점검",
      titleEn: "Composition and scroll review",
      descriptionKo: "시선 흐름과 스크롤 리듬의 위험을 검토합니다.",
      descriptionEn: "Review eye flow and scroll rhythm risks.",
      href: "/studio/ai-lab?task=composition-review",
    },
  ],
  drawing: [
    {
      id: "reference-organizer",
      titleKo: "레퍼런스 정리",
      titleEn: "Reference organizer",
      descriptionKo: "담당 컷에 필요한 인물·의상·소품 자료를 묶습니다.",
      descriptionEn: "Bundle character, costume and prop references.",
      href: "/studio/ai-lab?task=reference-organizer",
    },
    {
      id: "layer-preflight",
      titleKo: "레이어·파일 사전 검사",
      titleEn: "Layer and file preflight",
      descriptionKo: "제출 전 레이어 규칙과 출력 조건을 확인합니다.",
      descriptionEn: "Validate layer rules and output requirements.",
      href: "/studio/ai-lab?task=layer-preflight",
    },
  ],
  background: [
    {
      id: "background-brief",
      titleKo: "배경 제작 브리프",
      titleEn: "Background production brief",
      descriptionKo: "장소, 카메라, 원근과 필요한 패스를 정리합니다.",
      descriptionEn: "Summarize location, camera, perspective and passes.",
      href: "/studio/ai-lab?task=background-brief",
    },
    {
      id: "reference-organizer",
      titleKo: "공간 레퍼런스 정리",
      titleEn: "Environment reference organizer",
      descriptionKo: "장면별 공간·소품 자료를 분류합니다.",
      descriptionEn: "Organize environment and prop references by scene.",
      href: "/studio/ai-lab?task=reference-organizer",
    },
  ],
  "color-finishing": [
    {
      id: "palette-consistency",
      titleKo: "팔레트 일관성 검사",
      titleEn: "Palette consistency check",
      descriptionKo: "회차 전체의 색·광원·효과 기준을 비교합니다.",
      descriptionEn: "Compare color, lighting and effects across the episode.",
      href: "/studio/ai-lab?task=palette-consistency",
    },
    {
      id: "layer-preflight",
      titleKo: "출력 사전 검사",
      titleEn: "Output preflight",
      descriptionKo: "색공간, 해상도, 잘림과 파일 규격을 점검합니다.",
      descriptionEn: "Check color space, resolution, clipping and file specs.",
      href: "/studio/ai-lab?task=layer-preflight",
    },
  ],
  lettering: [
    {
      id: "lettering-proof",
      titleKo: "식자·맞춤법 검사",
      titleEn: "Lettering proof",
      descriptionKo: "대사, 호칭, 말풍선 순서와 잘림을 확인합니다.",
      descriptionEn: "Check copy, names, balloon order and clipping.",
      href: "/studio/ai-lab?task=lettering-proof",
    },
    {
      id: "dialogue-voice",
      titleKo: "대사 정본 비교",
      titleEn: "Approved copy comparison",
      descriptionKo: "식자 원고가 최종 대본과 일치하는지 비교합니다.",
      descriptionEn: "Compare lettering against the approved script.",
      href: "/studio/ai-lab?task=dialogue-voice",
    },
  ],
  review: [
    {
      id: "review-summary",
      titleKo: "검수 의견 요약",
      titleEn: "Review summary",
      descriptionKo: "중복 의견을 묶고 차단 이슈와 개선안을 분리합니다.",
      descriptionEn: "Group duplicates and separate blockers from suggestions.",
      href: "/studio/ai-lab?task=review-summary",
    },
    {
      id: "layer-preflight",
      titleKo: "납품 규격 검사",
      titleEn: "Delivery preflight",
      descriptionKo: "플랫폼 규격과 파일 구성의 누락을 확인합니다.",
      descriptionEn: "Check platform specs and file completeness.",
      href: "/studio/ai-lab?task=layer-preflight",
    },
  ],
  production: [
    {
      id: "schedule-risk",
      titleKo: "일정 위험 분석",
      titleEn: "Schedule risk analysis",
      descriptionKo: "마감, 선행 작업과 승인 대기에서 병목을 찾습니다.",
      descriptionEn: "Find deadline, dependency and approval bottlenecks.",
      href: "/studio/ai-lab?task=schedule-risk",
    },
    {
      id: "workload-balance",
      titleKo: "작업량 재배분",
      titleEn: "Workload balancing",
      descriptionKo: "팀원별 가능량과 담당 업무를 비교합니다.",
      descriptionEn: "Compare capacity and assignments across the team.",
      href: "/studio/ai-lab?task=workload-balance",
    },
    {
      id: "review-summary",
      titleKo: "주간 제작 보고",
      titleEn: "Weekly production report",
      descriptionKo: "진행, 위험, 결정과 다음 행동을 정리합니다.",
      descriptionEn: "Summarize progress, risks, decisions and next actions.",
      href: "/studio/ai-lab?task=review-summary",
    },
  ],
};

export function creatorRoleAiTools(
  role: CreatorRoleId | null | undefined,
): readonly CreatorRoleAiTool[] {
  return AI_TOOLS[creatorDetailedRoleLens(role)];
}

function dateOnlyEpoch(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(epoch) ? epoch : null;
}

function todayEpoch(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function addReason(
  reasons: CreatorWorkReason[],
  reason: CreatorWorkReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function rankCreatorRoleWork(
  workspace: CreatorRoleWorkspaceLike,
  options: {
    readonly userId: string | null;
    readonly displayName: string | null;
    readonly activeRole: CreatorRoleId | null;
    readonly now?: Date;
    readonly limit?: number;
  },
): readonly RankedCreatorWorkItem[] {
  const now = options.now ?? new Date();
  const today = todayEpoch(now);
  const displayName = options.displayName?.trim().toLocaleLowerCase() ?? "";
  const productionRoles = new Set(creatorRoleProductionRoles(options.activeRole));
  const assignments = workspace.roleAssignments.filter((assignment) => (
    options.userId && assignment.memberId === options.userId
  ) || (
    displayName
    && assignment.displayName.trim().toLocaleLowerCase() === displayName
  ));
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  for (const assignment of assignments) {
    for (const role of assignment.roles) productionRoles.add(role);
  }
  const statusById = new Map(
    workspace.tasks.map((task) => [task.id, task.status] as const),
  );
  const result: RankedCreatorWorkItem[] = [];
  const producerView = creatorDetailedRoleLens(options.activeRole) === "production";

  for (const task of workspace.tasks) {
    if (task.status === "done") continue;
    const reasons: CreatorWorkReason[] = [];
    let score = 0;
    const assigned = (task.assigneeIds ?? []).some((id) => assignmentIds.has(id))
      || (displayName !== ""
        && task.owner?.trim().toLocaleLowerCase() === displayName);
    const roleMatch = task.role ? productionRoles.has(task.role) : false;
    if (assigned) {
      score += 70;
      addReason(reasons, "assigned-to-me");
    }
    if (roleMatch) {
      score += 25;
      addReason(reasons, "role-match");
    }
    if (!assigned && !roleMatch && !producerView) continue;

    const due = dateOnlyEpoch(task.due);
    if (due !== null) {
      const days = Math.round((due - today) / 86_400_000);
      if (days < 0) {
        score += 110 + Math.min(30, Math.abs(days));
        addReason(reasons, "overdue");
      } else if (days === 0) {
        score += 80;
        addReason(reasons, "due-today");
      } else if (days <= 2) {
        score += 45;
        addReason(reasons, "due-soon");
      }
    }
    if (task.status === "blocked") {
      score += 65;
      addReason(reasons, "blocked");
    } else if (task.status === "doing") {
      score += 18;
    }
    if (task.priority === "urgent") {
      score += 45;
      addReason(reasons, "urgent");
    } else if (task.priority === "high") {
      score += 22;
    }
    if (
      (task.dependencyIds ?? []).length > 0
      && (task.dependencyIds ?? []).every((id) => statusById.get(id) === "done")
    ) {
      score += 12;
      addReason(reasons, "dependency-ready");
    }

    result.push({
      id: task.id,
      kind: "task",
      title: task.title,
      score,
      reasons,
      due: task.due,
      status: task.status,
      productionRole: task.role ?? null,
    });
  }

  for (const review of workspace.reviews) {
    if (review.status === "resolved") continue;
    const reasons: CreatorWorkReason[] = [];
    const assigned = displayName !== ""
      && review.assignee?.trim().toLocaleLowerCase() === displayName;
    const roleMatch = review.requestedByRole
      ? productionRoles.has(review.requestedByRole)
      : productionRoles.has("reviewer");
    if (!assigned && !roleMatch && !producerView) continue;
    let score = assigned ? 85 : 40;
    addReason(reasons, "review-requested");
    if (assigned) addReason(reasons, "assigned-to-me");
    if (review.approvalRequired) {
      score += 55;
      addReason(reasons, "approval-required");
    }
    if (review.severity === "blocker") score += 70;
    else if (review.severity === "major") score += 35;
    result.push({
      id: review.id,
      kind: "review",
      title: review.title,
      score,
      reasons,
      due: null,
      status: review.status,
      productionRole: review.requestedByRole ?? "reviewer",
    });
  }

  return result
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, Math.max(1, Math.min(50, options.limit ?? 16)));
}

const SPECIALTY_PRODUCTION_ROLES: Partial<
  Record<CreatorSpecialtyId, readonly CreatorProductionRole[]>
> = {
  "world-building": ["story"],
  plot: ["story"],
  dialogue: ["story"],
  adaptation: ["story"],
  "episode-planning": ["story", "director"],
  storyboard: ["storyboard"],
  "scroll-direction": ["storyboard"],
  composition: ["storyboard", "lineart"],
  "character-design": ["lineart"],
  "line-art": ["lineart"],
  inking: ["lineart"],
  "background-2d": ["background"],
  "background-3d": ["background"],
  "prop-design": ["background"],
  "flat-color": ["color"],
  rendering: ["color"],
  effects: ["color"],
  retouching: ["color", "reviewer"],
  lettering: ["lettering"],
  balloon: ["lettering"],
  "sound-effects": ["lettering"],
  "production-schedule": ["director"],
  budget: ["director", "publisher"],
  "quality-control": ["reviewer"],
  editing: ["reviewer", "director"],
  proofing: ["reviewer"],
  localization: ["lettering", "reviewer"],
  "file-cleanup": ["lineart"],
};

export function recommendCreatorTeamRoles(
  candidates: readonly PublicCreatorRoleCandidate[],
  requiredRoles: readonly CreatorProductionRole[] = CREATOR_PRODUCTION_ROLES,
): readonly CreatorTeamRoleRecommendation[] {
  const allowed = new Set(requiredRoles.filter((role) => PRODUCTION_ROLE_SET.has(role)));
  const recommendations: CreatorTeamRoleRecommendation[] = [];

  for (const candidate of candidates) {
    const primaryRoles = new Set(
      creatorRoleProductionRoles(candidate.roleProfile.primaryRole),
    );
    const secondaryRoles = new Set(
      candidate.roleProfile.secondaryRoles.flatMap((role) => creatorRoleProductionRoles(role)),
    );
    const specialtyRoles = new Set(
      candidate.roleProfile.specialties.flatMap(
        (specialty) => SPECIALTY_PRODUCTION_ROLES[specialty] ?? [],
      ),
    );
    for (const role of allowed) {
      let score = 0;
      const reasons: string[] = [];
      const hasPrimaryRole = primaryRoles.has(role);
      const hasSecondaryRole = secondaryRoles.has(role);
      const hasSpecialtyRole = specialtyRoles.has(role);
      const hasRoleEvidence = hasPrimaryRole || hasSecondaryRole || hasSpecialtyRole;
      if (!hasRoleEvidence) continue;
      if (hasPrimaryRole) {
        score += 70;
        reasons.push("대표 직무와 일치");
      }
      if (hasSecondaryRole) {
        score += 35;
        reasons.push("보조 직무와 일치");
      }
      if (hasSpecialtyRole) {
        score += 30;
        reasons.push("전문 분야와 일치");
      }
      const capacity = candidate.capacity;
      if (
        capacity?.weeklyCapacityHours !== null
        && capacity?.weeklyCapacityHours !== undefined
      ) {
        const remaining = capacity.weeklyCapacityHours - capacity.currentAssignedHours;
        if (remaining > 0) {
          score += Math.min(20, Math.round(remaining));
          reasons.push(`가용 ${Math.round(remaining * 10) / 10}시간`);
        } else {
          score -= 35;
          reasons.push("현재 가능량 초과");
        }
      }
      if (candidate.roleProfile.collaborationStatus === "available") {
        score += 12;
        reasons.push("협업 가능");
      } else if (candidate.roleProfile.collaborationStatus === "unavailable") {
        score -= 80;
        reasons.push("현재 협업 불가");
      }
      recommendations.push({
        userId: candidate.userId,
        name: candidate.name,
        productionRole: role,
        score,
        reasons,
      });
    }
  }

  return recommendations.sort(
    (left, right) =>
      right.score - left.score
      || left.productionRole.localeCompare(right.productionRole)
      || left.name.localeCompare(right.name),
  );
}

export function scoreCreatorRoleMatch(
  candidate: PublicCreatorRoleCandidate,
  criteria: CreatorRoleMatchCriteria,
): number {
  let score = 0;
  if (criteria.role) {
    if (candidate.roleProfile.primaryRole === criteria.role) score += 70;
    else if (candidate.roleProfile.secondaryRoles.includes(criteria.role)) score += 35;
    else return 0;
  }
  const requestedSpecialties = criteria.specialties?.filter((specialty) => (
    SPECIALTY_ID_SET.has(specialty)
  )) ?? [];
  for (const specialty of requestedSpecialties) {
    if (candidate.roleProfile.specialties.includes(specialty)) score += 15;
  }
  if (
    criteria.collaborationStatus
    && candidate.roleProfile.collaborationStatus !== criteria.collaborationStatus
  ) {
    return 0;
  }
  if (candidate.roleProfile.collaborationStatus === "available") score += 10;
  if (candidate.roleProfile.experienceLevel === "professional") score += 8;
  return score;
}
