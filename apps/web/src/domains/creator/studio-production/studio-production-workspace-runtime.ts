import type { StudioLocalDatabase } from "../studio-local-database";

export const STUDIO_PRODUCTION_NAMESPACE = "studio-production-command-center-v1";
export const STUDIO_PRODUCTION_WORKSPACE_VERSION = 3 as const;
export const STUDIO_PRODUCTION_INVALIDATION_TYPE =
  "studio-production-workspace-invalidated" as const;

export const STUDIO_PRODUCTION_WORKSPACE_MODES = [
  "local-draft",
  "linked-local",
  "server-work",
  "read-only-cache",
  "demo",
] as const;

export const STUDIO_PRODUCTION_STAGES = [
  "planning",
  "script",
  "script-approved",
  "storyboard",
  "storyboard-approved",
  "rough",
  "lineart",
  "color-background",
  "lettering",
  "review",
  "approved",
  "publishing",
] as const;

export const STUDIO_PRODUCTION_ROLES = [
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

export const STUDIO_PRODUCTION_HIERARCHY_KINDS = [
  "episode",
  "sequence",
  "scene",
  "page",
] as const;

export const STUDIO_PRODUCTION_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const STUDIO_PRODUCTION_HANDOFF_STATUSES = [
  "draft",
  "ready",
  "accepted",
  "changes-requested",
] as const;

export const STUDIO_PRODUCTION_AUTHORITY_FIELDS = [
  "dialogue",
  "balloon-layout",
  "panel-layout",
  "character-continuity",
  "background",
  "publishing",
] as const;

export type StudioProductionWorkspaceMode =
  (typeof STUDIO_PRODUCTION_WORKSPACE_MODES)[number];
export type ProductionStage = (typeof STUDIO_PRODUCTION_STAGES)[number];
export type ProductionRole = (typeof STUDIO_PRODUCTION_ROLES)[number];
export type ProductionHierarchyKind =
  (typeof STUDIO_PRODUCTION_HIERARCHY_KINDS)[number];
export type ProductionPriority = (typeof STUDIO_PRODUCTION_PRIORITIES)[number];
export type ProductionHandoffStatus =
  (typeof STUDIO_PRODUCTION_HANDOFF_STATUSES)[number];
export type ProductionAuthorityField =
  (typeof STUDIO_PRODUCTION_AUTHORITY_FIELDS)[number];
export type ProductionTaskStatus = "todo" | "doing" | "blocked" | "done";
export type ProductionReviewSeverity = "blocker" | "major" | "minor";
export type ProductionReviewStatus = "open" | "resolved";

export interface ProductionTask {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly due: string;
  readonly progress: number;
  readonly status: ProductionTaskStatus;
  /** V3 workflow metadata. Optional at TypeScript call sites for source compatibility; normalization fills it. */
  readonly stage?: ProductionStage;
  readonly priority?: ProductionPriority;
  readonly role?: ProductionRole | null;
  readonly hierarchyNodeId?: string | null;
  readonly dependencyIds?: readonly string[];
  readonly assigneeIds?: readonly string[];
  readonly reviewerIds?: readonly string[];
  readonly blockedReason?: string;
}

export interface ProductionReviewIssue {
  readonly id: string;
  readonly title: string;
  readonly assignee: string;
  readonly severity: ProductionReviewSeverity;
  readonly status: ProductionReviewStatus;
  readonly hierarchyNodeId?: string | null;
  readonly pageId?: string | null;
  readonly requestedByRole?: ProductionRole | null;
  readonly approvalRequired?: boolean;
}

export interface ProductionHierarchyNode {
  readonly id: string;
  readonly kind: ProductionHierarchyKind;
  readonly parentId: string | null;
  readonly title: string;
  readonly order: number;
  /** Populated only for page nodes; points at the editor's stable page identity. */
  readonly pageId: string | null;
}

export interface ProductionRoleAssignment {
  readonly id: string;
  /** Team user identity when server-backed; null for local planning placeholders. */
  readonly memberId: string | null;
  readonly displayName: string;
  readonly roles: readonly ProductionRole[];
  readonly hierarchyNodeId: string | null;
}

export interface ProductionHandoffBrief {
  readonly id: string;
  readonly hierarchyNodeId: string;
  readonly fromRole: ProductionRole;
  readonly toRole: ProductionRole;
  readonly status: ProductionHandoffStatus;
  readonly scenePurpose: string;
  readonly emotionalBeat: string;
  readonly mustShow: readonly string[];
  readonly continuityNotes: readonly string[];
  readonly lockedFields: readonly ProductionAuthorityField[];
  readonly acceptanceCriteria: readonly string[];
  readonly createdBy: string;
  readonly assignedTo: string;
  readonly updatedAt: string;
}

export interface ProductionVersionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly tasks: readonly ProductionTask[];
  readonly reviews: readonly ProductionReviewIssue[];
  readonly hierarchy?: readonly ProductionHierarchyNode[];
  readonly roleAssignments?: readonly ProductionRoleAssignment[];
  readonly handoffs?: readonly ProductionHandoffBrief[];
}

export interface ProductionPitchSlide {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface ProductionWorkspace {
  readonly schemaVersion: typeof STUDIO_PRODUCTION_WORKSPACE_VERSION;
  readonly revision: number;
  readonly scopeKey: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly tasks: readonly ProductionTask[];
  readonly reviews: readonly ProductionReviewIssue[];
  readonly hierarchy: readonly ProductionHierarchyNode[];
  readonly roleAssignments: readonly ProductionRoleAssignment[];
  readonly handoffs: readonly ProductionHandoffBrief[];
  readonly versions: readonly ProductionVersionSnapshot[];
  readonly slides: readonly ProductionPitchSlide[];
  readonly members: readonly string[];
  /** Legacy local token only. It is never a server authorization credential. */
  readonly inviteToken: string | null;
}

export interface StudioProductionWorkspaceCapabilities {
  readonly canEdit: boolean;
  readonly canPersistLocally: boolean;
  readonly canInvite: boolean;
  readonly canApprove: boolean;
  readonly canPublish: boolean;
  readonly serverAuthoritative: boolean;
}

export interface StudioProductionWorkspaceInvalidation {
  readonly type: typeof STUDIO_PRODUCTION_INVALIDATION_TYPE;
  readonly scopeKey: string;
  readonly revision: number;
  readonly sourceClientId: string;
}

export type StudioProductionWorkspaceLock = <T>(
  name: string,
  operation: () => Promise<T>,
) => Promise<T>;

type ProductionDatabase = Pick<StudioLocalDatabase, "kvGet" | "kvSet">;

export interface StudioProductionWorkspaceRepositoryOptions {
  readonly acquireDatabase?: () => Promise<ProductionDatabase>;
  readonly lock?: StudioProductionWorkspaceLock;
  readonly now?: () => string;
}

export interface StudioProductionWorkspaceRepository {
  load(scopeKey: string): Promise<ProductionWorkspace | null>;
  commit(
    scopeKey: string,
    fallback: ProductionWorkspace,
    update: (current: ProductionWorkspace) => ProductionWorkspace,
  ): Promise<ProductionWorkspace>;
}

const MAX_SERIALIZED_LENGTH = 2_000_000;
const MAX_SCOPE_LENGTH = 170;
const MAX_ID_LENGTH = 160;
const MAX_TITLE_LENGTH = 240;
const MAX_TEXT_LENGTH = 4_000;
const MAX_LIST_ITEM_LENGTH = 600;
const MAX_TASKS = 1_000;
const MAX_REVIEWS = 1_000;
const MAX_HIERARCHY_NODES = 2_000;
const MAX_ROLE_ASSIGNMENTS = 500;
const MAX_HANDOFFS = 1_000;
const MAX_VERSIONS = 200;
const MAX_SLIDES = 200;
const MAX_MEMBERS = 200;
const MAX_LIST_ITEMS = 128;
const TASK_STATUSES = new Set<ProductionTaskStatus>([
  "todo",
  "doing",
  "blocked",
  "done",
]);
const REVIEW_SEVERITIES = new Set<ProductionReviewSeverity>([
  "blocker",
  "major",
  "minor",
]);
const REVIEW_STATUSES = new Set<ProductionReviewStatus>([
  "open",
  "resolved",
]);
const STAGE_SET = new Set<string>(STUDIO_PRODUCTION_STAGES);
const ROLE_SET = new Set<string>(STUDIO_PRODUCTION_ROLES);
const HIERARCHY_KIND_SET = new Set<string>(STUDIO_PRODUCTION_HIERARCHY_KINDS);
const PRIORITY_SET = new Set<string>(STUDIO_PRODUCTION_PRIORITIES);
const HANDOFF_STATUS_SET = new Set<string>(STUDIO_PRODUCTION_HANDOFF_STATUSES);
const AUTHORITY_FIELD_SET = new Set<string>(STUDIO_PRODUCTION_AUTHORITY_FIELDS);
const fallbackQueues = new Map<string, Promise<unknown>>();
let fallbackClientSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeIdentity(value: unknown, maxLength = MAX_ID_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || trimmed.length > maxLength) return null;
  if (trimmed === "." || trimmed === ".." || trimmed.includes("\\")) return null;
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code <= 31 || code === 127) return null;
  }
  return trimmed;
}

export function isStudioProductionScopeKey(value: unknown): value is string {
  if (value === "draft") return true;
  if (typeof value !== "string" || value.length > MAX_SCOPE_LENGTH) return false;
  const separator = value.indexOf(":");
  if (separator < 0) return false;
  const kind = value.slice(0, separator);
  if (kind !== "work" && kind !== "remix") return false;
  return safeIdentity(value.slice(separator + 1)) !== null;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80 || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function optionalString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalIdentity(value: unknown): string | null {
  return value === null || value === undefined ? null : safeIdentity(value);
}

function parseIdentityList(value: unknown, maxItems = MAX_LIST_ITEMS): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const id = safeIdentity(candidate);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function parseTextList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return null;
  const result: string[] = [];
  for (const candidate of value) {
    const text = requiredString(candidate, MAX_LIST_ITEM_LENGTH);
    if (!text) return null;
    result.push(text);
  }
  return result;
}

function parseEnumList<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return null;
  const result: T[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string" || !allowed.has(candidate) || seen.has(candidate)) {
      return null;
    }
    seen.add(candidate);
    result.push(candidate as T);
  }
  return result;
}

function parseTask(value: unknown): ProductionTask | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  const owner = optionalString(value.owner, MAX_TITLE_LENGTH);
  const due = typeof value.due === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value.due)
    ? value.due
    : null;
  const progress = value.progress;
  const status = value.status;
  const stage = value.stage === undefined ? "planning" : value.stage;
  const priority = value.priority === undefined ? "normal" : value.priority;
  const role = value.role === undefined || value.role === null ? null : value.role;
  const hierarchyNodeId = optionalIdentity(value.hierarchyNodeId);
  const dependencyIds = parseIdentityList(value.dependencyIds ?? []);
  const assigneeIds = parseIdentityList(value.assigneeIds ?? []);
  const reviewerIds = parseIdentityList(value.reviewerIds ?? []);
  const blockedReason = optionalString(value.blockedReason, MAX_TEXT_LENGTH);
  if (
    !id
    || !title
    || !due
    || typeof progress !== "number"
    || !Number.isFinite(progress)
    || progress < 0
    || progress > 100
    || !TASK_STATUSES.has(status as ProductionTaskStatus)
    || typeof stage !== "string"
    || !STAGE_SET.has(stage)
    || typeof priority !== "string"
    || !PRIORITY_SET.has(priority)
    || (role !== null && (typeof role !== "string" || !ROLE_SET.has(role)))
    || (value.hierarchyNodeId !== null
      && value.hierarchyNodeId !== undefined
      && hierarchyNodeId === null)
    || dependencyIds === null
    || dependencyIds.includes(id)
    || assigneeIds === null
    || reviewerIds === null
  ) {
    return null;
  }
  return {
    id,
    title,
    owner,
    due,
    progress: Math.round(progress),
    status: status as ProductionTaskStatus,
    stage: stage as ProductionStage,
    priority: priority as ProductionPriority,
    role: role as ProductionRole | null,
    hierarchyNodeId,
    dependencyIds,
    assigneeIds,
    reviewerIds,
    blockedReason,
  };
}

function parseReview(value: unknown): ProductionReviewIssue | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  const assignee = optionalString(value.assignee, MAX_TITLE_LENGTH);
  const severity = value.severity;
  const status = value.status;
  const hierarchyNodeId = optionalIdentity(value.hierarchyNodeId);
  const pageId = optionalIdentity(value.pageId);
  const requestedByRole = value.requestedByRole === null || value.requestedByRole === undefined
    ? null
    : value.requestedByRole;
  const approvalRequired = value.approvalRequired === undefined
    ? severity === "blocker"
    : value.approvalRequired;
  if (
    !id
    || !title
    || !REVIEW_SEVERITIES.has(severity as ProductionReviewSeverity)
    || !REVIEW_STATUSES.has(status as ProductionReviewStatus)
    || (value.hierarchyNodeId !== null
      && value.hierarchyNodeId !== undefined
      && hierarchyNodeId === null)
    || (value.pageId !== null && value.pageId !== undefined && pageId === null)
    || (requestedByRole !== null
      && (typeof requestedByRole !== "string" || !ROLE_SET.has(requestedByRole)))
    || typeof approvalRequired !== "boolean"
  ) {
    return null;
  }
  return {
    id,
    title,
    assignee,
    severity: severity as ProductionReviewSeverity,
    status: status as ProductionReviewStatus,
    hierarchyNodeId,
    pageId,
    requestedByRole: requestedByRole as ProductionRole | null,
    approvalRequired,
  };
}

function parseHierarchyNode(value: unknown): ProductionHierarchyNode | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const kind = value.kind;
  const parentId = optionalIdentity(value.parentId);
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  const pageId = optionalIdentity(value.pageId);
  const order = value.order;
  if (
    !id
    || typeof kind !== "string"
    || !HIERARCHY_KIND_SET.has(kind)
    || (value.parentId !== null && value.parentId !== undefined && parentId === null)
    || !title
    || !Number.isSafeInteger(order)
    || Number(order) < 0
    || Number(order) > MAX_HIERARCHY_NODES
    || (value.pageId !== null && value.pageId !== undefined && pageId === null)
    || (kind === "page" ? pageId === null : pageId !== null)
  ) {
    return null;
  }
  return {
    id,
    kind: kind as ProductionHierarchyKind,
    parentId,
    title,
    order: Number(order),
    pageId,
  };
}

function parseHierarchy(value: unknown): ProductionHierarchyNode[] | null {
  if (!Array.isArray(value) || value.length > MAX_HIERARCHY_NODES) return null;
  const nodes = value.map(parseHierarchyNode);
  if (nodes.some((node) => node === null)) return null;
  const typed = nodes as ProductionHierarchyNode[];
  const byId = new Map<string, ProductionHierarchyNode>();
  const pageIds = new Set<string>();
  for (const node of typed) {
    if (byId.has(node.id) || (node.pageId !== null && pageIds.has(node.pageId))) return null;
    byId.set(node.id, node);
    if (node.pageId !== null) pageIds.add(node.pageId);
  }
  for (const node of typed) {
    if (node.parentId === node.id || (node.parentId !== null && !byId.has(node.parentId))) return null;
    const visited = new Set<string>([node.id]);
    let cursor = node.parentId;
    while (cursor !== null) {
      if (visited.has(cursor)) return null;
      visited.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }
  return typed;
}

function parseRoleAssignment(value: unknown): ProductionRoleAssignment | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const memberId = optionalIdentity(value.memberId);
  const displayName = requiredString(value.displayName, MAX_TITLE_LENGTH);
  const roles = parseEnumList<ProductionRole>(value.roles, ROLE_SET);
  const hierarchyNodeId = optionalIdentity(value.hierarchyNodeId);
  if (
    !id
    || (value.memberId !== null && value.memberId !== undefined && memberId === null)
    || !displayName
    || roles === null
    || roles.length === 0
    || (value.hierarchyNodeId !== null
      && value.hierarchyNodeId !== undefined
      && hierarchyNodeId === null)
  ) {
    return null;
  }
  return { id, memberId, displayName, roles, hierarchyNodeId };
}

function parseHandoff(value: unknown): ProductionHandoffBrief | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const hierarchyNodeId = safeIdentity(value.hierarchyNodeId);
  const fromRole = value.fromRole;
  const toRole = value.toRole;
  const status = value.status;
  const scenePurpose = optionalString(value.scenePurpose, MAX_TEXT_LENGTH);
  const emotionalBeat = optionalString(value.emotionalBeat, MAX_TEXT_LENGTH);
  const mustShow = parseTextList(value.mustShow ?? []);
  const continuityNotes = parseTextList(value.continuityNotes ?? []);
  const lockedFields = parseEnumList<ProductionAuthorityField>(
    value.lockedFields ?? [],
    AUTHORITY_FIELD_SET,
  );
  const acceptanceCriteria = parseTextList(value.acceptanceCriteria ?? []);
  const createdBy = optionalString(value.createdBy, MAX_TITLE_LENGTH);
  const assignedTo = optionalString(value.assignedTo, MAX_TITLE_LENGTH);
  const updatedAt = canonicalTimestamp(value.updatedAt);
  if (
    !id
    || !hierarchyNodeId
    || typeof fromRole !== "string"
    || !ROLE_SET.has(fromRole)
    || typeof toRole !== "string"
    || !ROLE_SET.has(toRole)
    || fromRole === toRole
    || typeof status !== "string"
    || !HANDOFF_STATUS_SET.has(status)
    || mustShow === null
    || continuityNotes === null
    || lockedFields === null
    || acceptanceCriteria === null
    || !updatedAt
  ) {
    return null;
  }
  return {
    id,
    hierarchyNodeId,
    fromRole: fromRole as ProductionRole,
    toRole: toRole as ProductionRole,
    status: status as ProductionHandoffStatus,
    scenePurpose,
    emotionalBeat,
    mustShow,
    continuityNotes,
    lockedFields,
    acceptanceCriteria,
    createdBy,
    assignedTo,
    updatedAt,
  };
}

function parseSlide(value: unknown): ProductionPitchSlide | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  if (!id || !title || typeof value.body !== "string" || value.body.length > MAX_TEXT_LENGTH) {
    return null;
  }
  return { id, title, body: value.body.trim() };
}

function parseVersion(value: unknown): ProductionVersionSnapshot | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const name = requiredString(value.name, MAX_TITLE_LENGTH);
  const createdAt = canonicalTimestamp(value.createdAt);
  if (
    !id
    || !name
    || !createdAt
    || !Array.isArray(value.tasks)
    || value.tasks.length > MAX_TASKS
    || !Array.isArray(value.reviews)
    || value.reviews.length > MAX_REVIEWS
  ) {
    return null;
  }
  const tasks = value.tasks.map(parseTask);
  const reviews = value.reviews.map(parseReview);
  const hierarchy = parseHierarchy(value.hierarchy ?? []);
  const rawRoleAssignments = value.roleAssignments ?? [];
  const roleAssignments = Array.isArray(rawRoleAssignments)
    && rawRoleAssignments.length <= MAX_ROLE_ASSIGNMENTS
      ? rawRoleAssignments.map(parseRoleAssignment)
      : null;
  const rawHandoffs = value.handoffs ?? [];
  const handoffs = Array.isArray(rawHandoffs) && rawHandoffs.length <= MAX_HANDOFFS
    ? rawHandoffs.map(parseHandoff)
    : null;
  if (
    tasks.some((task) => task === null)
    || reviews.some((review) => review === null)
    || hierarchy === null
    || roleAssignments === null
    || roleAssignments.some((assignment) => assignment === null)
    || handoffs === null
    || handoffs.some((handoff) => handoff === null)
  ) {
    return null;
  }
  return {
    id,
    name,
    createdAt,
    tasks: tasks as ProductionTask[],
    reviews: reviews as ProductionReviewIssue[],
    hierarchy,
    roleAssignments: roleAssignments as ProductionRoleAssignment[],
    handoffs: handoffs as ProductionHandoffBrief[],
  };
}

function parseMembers(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_MEMBERS) return null;
  const members = value.map((member) => requiredString(member, MAX_TITLE_LENGTH));
  return members.some((member) => member === null) ? null : members as string[];
}

function duplicateIds(items: readonly { readonly id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size !== items.length;
}

function referencesAreValid(input: {
  readonly tasks: readonly ProductionTask[];
  readonly reviews: readonly ProductionReviewIssue[];
  readonly hierarchy: readonly ProductionHierarchyNode[];
  readonly roleAssignments: readonly ProductionRoleAssignment[];
  readonly handoffs: readonly ProductionHandoffBrief[];
}): boolean {
  if (
    duplicateIds(input.tasks)
    || duplicateIds(input.reviews)
    || duplicateIds(input.roleAssignments)
    || duplicateIds(input.handoffs)
  ) {
    return false;
  }
  const taskIds = new Set(input.tasks.map((task) => task.id));
  const hierarchyIds = new Set(input.hierarchy.map((node) => node.id));
  return input.tasks.every((task) =>
    (task.hierarchyNodeId === null || task.hierarchyNodeId === undefined
      || hierarchyIds.has(task.hierarchyNodeId))
    && (task.dependencyIds ?? []).every((dependencyId) => taskIds.has(dependencyId)))
    && input.reviews.every((review) =>
      review.hierarchyNodeId === null || review.hierarchyNodeId === undefined
      || hierarchyIds.has(review.hierarchyNodeId))
    && input.roleAssignments.every((assignment) =>
      assignment.hierarchyNodeId === null || hierarchyIds.has(assignment.hierarchyNodeId))
    && input.handoffs.every((handoff) => hierarchyIds.has(handoff.hierarchyNodeId));
}

function workspaceTitle(scopeKey: string): string {
  if (scopeKey === "draft") return "새 웹툰 제작 프로젝트";
  const separator = scopeKey.indexOf(":");
  const kind = scopeKey.slice(0, separator);
  const identity = scopeKey.slice(separator + 1);
  return `${kind} ${identity} 제작 운영`;
}

export function createEmptyProductionWorkspace(
  scopeKey: string,
  now = "1970-01-01T00:00:00.000Z",
): ProductionWorkspace {
  if (!isStudioProductionScopeKey(scopeKey)) {
    throw new Error("Production workspace requires a valid Studio scope.");
  }
  const updatedAt = canonicalTimestamp(now);
  if (!updatedAt) throw new Error("Production workspace requires a canonical timestamp.");
  return {
    schemaVersion: STUDIO_PRODUCTION_WORKSPACE_VERSION,
    revision: 0,
    scopeKey,
    title: workspaceTitle(scopeKey),
    updatedAt,
    tasks: [],
    reviews: [],
    hierarchy: [],
    roleAssignments: [],
    handoffs: [],
    versions: [],
    slides: [],
    members: [],
    inviteToken: null,
  };
}

export function createDemoProductionWorkspace(
  now = "2026-09-05T00:00:00.000Z",
): ProductionWorkspace {
  const base = createEmptyProductionWorkspace("draft", now);
  return {
    ...base,
    title: "샘플 웹툰 제작 프로젝트",
    members: ["디렉터", "스토리 작가", "작화 작가", "편집자"],
    hierarchy: [
      { id: "episode-1", kind: "episode", parentId: null, title: "1화", order: 0, pageId: null },
      { id: "sequence-opening", kind: "sequence", parentId: "episode-1", title: "오프닝", order: 0, pageId: null },
      { id: "scene-arrival", kind: "scene", parentId: "sequence-opening", title: "주인공의 도착", order: 0, pageId: null },
    ],
    roleAssignments: [
      { id: "role-director", memberId: null, displayName: "디렉터", roles: ["director", "reviewer"], hierarchyNodeId: null },
      { id: "role-story", memberId: null, displayName: "스토리 작가", roles: ["story"], hierarchyNodeId: "episode-1" },
      { id: "role-art", memberId: null, displayName: "작화 작가", roles: ["storyboard", "lineart", "color"], hierarchyNodeId: "episode-1" },
    ],
    tasks: [
      {
        id: "task-story",
        title: "대사와 장면 의도 확정",
        owner: "스토리 작가",
        due: "2026-09-08",
        progress: 100,
        status: "done",
        stage: "script-approved",
        priority: "high",
        role: "story",
        hierarchyNodeId: "scene-arrival",
        dependencyIds: [],
        assigneeIds: [],
        reviewerIds: [],
        blockedReason: "",
      },
      {
        id: "task-line",
        title: "선화·톤 작업",
        owner: "작화 작가",
        due: "2026-09-10",
        progress: 68,
        status: "doing",
        stage: "lineart",
        priority: "normal",
        role: "lineart",
        hierarchyNodeId: "scene-arrival",
        dependencyIds: ["task-story"],
        assigneeIds: [],
        reviewerIds: [],
        blockedReason: "",
      },
      {
        id: "task-review",
        title: "연출·가독성 검수",
        owner: "편집자",
        due: "2026-09-11",
        progress: 35,
        status: "blocked",
        stage: "review",
        priority: "urgent",
        role: "reviewer",
        hierarchyNodeId: "scene-arrival",
        dependencyIds: ["task-line"],
        assigneeIds: [],
        reviewerIds: [],
        blockedReason: "선화 완료 대기",
      },
    ],
    handoffs: [
      {
        id: "handoff-story-art",
        hierarchyNodeId: "scene-arrival",
        fromRole: "story",
        toRole: "storyboard",
        status: "ready",
        scenePurpose: "주인공의 첫 등장과 세계의 위험을 세 컷 안에 전달합니다.",
        emotionalBeat: "낯섦에서 긴장으로 전환",
        mustShow: ["찢어진 지도", "도시 입구 표지판"],
        continuityNotes: ["왼손 붕대를 유지", "비가 시작되기 전 장면"],
        lockedFields: ["dialogue", "character-continuity"],
        acceptanceCriteria: ["대사 의미를 바꾸지 않음", "첫 컷에서 장소를 식별 가능"],
        createdBy: "스토리 작가",
        assignedTo: "작화 작가",
        updatedAt: now,
      },
    ],
    reviews: [
      {
        id: "review-continuity",
        title: "3컷 시선 방향 불일치",
        assignee: "작화 작가",
        severity: "blocker",
        status: "open",
        hierarchyNodeId: "scene-arrival",
        pageId: null,
        requestedByRole: "reviewer",
        approvalRequired: true,
      },
      {
        id: "review-balloon",
        title: "말풍선 안전 영역 확인",
        assignee: "편집자",
        severity: "major",
        status: "open",
        hierarchyNodeId: "scene-arrival",
        pageId: null,
        requestedByRole: "lettering",
        approvalRequired: false,
      },
    ],
    slides: [
      {
        id: "slide-concept",
        title: "작품 한 문장",
        body: "독자가 첫 세 컷 안에 세계와 갈등을 이해하는 연재형 웹툰.",
      },
      {
        id: "slide-character",
        title: "주요 캐릭터",
        body: "욕망·결핍·관계 변화를 장면 단위 제작 지표와 연결합니다.",
      },
    ],
  };
}

export function parseProductionWorkspace(
  raw: string | null,
  scopeKey: string,
): ProductionWorkspace | null {
  if (raw === null || raw === "") return null;
  if (raw.length > MAX_SERIALIZED_LENGTH) {
    throw new Error("저장된 제작 운영 데이터가 크기 제한을 초과했습니다.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("저장된 제작 운영 데이터를 읽을 수 없습니다.");
  }
  if (
    !isRecord(value)
    || (value.schemaVersion !== 1
      && value.schemaVersion !== 2
      && value.schemaVersion !== STUDIO_PRODUCTION_WORKSPACE_VERSION)
  ) {
    throw new Error("지원하지 않는 제작 운영 데이터 형식입니다.");
  }
  if (value.scopeKey !== scopeKey || !isStudioProductionScopeKey(value.scopeKey)) {
    throw new Error("제작 운영 데이터의 작품 범위가 일치하지 않습니다.");
  }
  const legacy = value.schemaVersion !== STUDIO_PRODUCTION_WORKSPACE_VERSION;
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  const updatedAt = canonicalTimestamp(value.updatedAt);
  const revision = value.schemaVersion === 1 ? 0 : value.revision;
  const hierarchyInput = legacy ? (value.hierarchy ?? []) : value.hierarchy;
  const roleAssignmentsInput = legacy ? (value.roleAssignments ?? []) : value.roleAssignments;
  const handoffsInput = legacy ? (value.handoffs ?? []) : value.handoffs;
  if (
    !title
    || !updatedAt
    || !Number.isSafeInteger(revision)
    || Number(revision) < 0
    || !Array.isArray(value.tasks)
    || value.tasks.length > MAX_TASKS
    || !Array.isArray(value.reviews)
    || value.reviews.length > MAX_REVIEWS
    || !Array.isArray(hierarchyInput)
    || hierarchyInput.length > MAX_HIERARCHY_NODES
    || !Array.isArray(roleAssignmentsInput)
    || roleAssignmentsInput.length > MAX_ROLE_ASSIGNMENTS
    || !Array.isArray(handoffsInput)
    || handoffsInput.length > MAX_HANDOFFS
    || !Array.isArray(value.versions)
    || value.versions.length > MAX_VERSIONS
    || !Array.isArray(value.slides)
    || value.slides.length > MAX_SLIDES
  ) {
    throw new Error("저장된 제작 운영 데이터가 올바르지 않습니다.");
  }
  const tasks = value.tasks.map(parseTask);
  const reviews = value.reviews.map(parseReview);
  const hierarchy = parseHierarchy(hierarchyInput);
  const roleAssignments = roleAssignmentsInput.map(parseRoleAssignment);
  const handoffs = handoffsInput.map(parseHandoff);
  const versions = value.versions.map(parseVersion);
  const slides = value.slides.map(parseSlide);
  const members = parseMembers(value.members);
  const inviteToken = value.inviteToken === null || value.inviteToken === undefined
    ? null
    : safeIdentity(value.inviteToken, 240);
  if (
    tasks.some((task) => task === null)
    || reviews.some((review) => review === null)
    || hierarchy === null
    || roleAssignments.some((assignment) => assignment === null)
    || handoffs.some((handoff) => handoff === null)
    || versions.some((version) => version === null)
    || slides.some((slide) => slide === null)
    || members === null
    || (value.inviteToken !== null
      && value.inviteToken !== undefined
      && inviteToken === null)
  ) {
    throw new Error("저장된 제작 운영 항목이 올바르지 않습니다.");
  }
  const canonical = {
    tasks: tasks as ProductionTask[],
    reviews: reviews as ProductionReviewIssue[],
    hierarchy,
    roleAssignments: roleAssignments as ProductionRoleAssignment[],
    handoffs: handoffs as ProductionHandoffBrief[],
  };
  if (!referencesAreValid(canonical)) {
    throw new Error("제작 운영 데이터 참조가 올바르지 않습니다.");
  }
  return {
    schemaVersion: STUDIO_PRODUCTION_WORKSPACE_VERSION,
    revision: Number(revision),
    scopeKey,
    title,
    updatedAt,
    ...canonical,
    versions: versions as ProductionVersionSnapshot[],
    slides: slides as ProductionPitchSlide[],
    members,
    inviteToken,
  };
}

export function serializeProductionWorkspace(
  workspace: ProductionWorkspace,
): string {
  const normalized = parseProductionWorkspace(JSON.stringify(workspace), workspace.scopeKey);
  if (!normalized) throw new Error("제작 운영 공간을 직렬화할 수 없습니다.");
  const raw = JSON.stringify(normalized);
  if (raw.length > MAX_SERIALIZED_LENGTH) {
    throw new Error("제작 운영 공간이 저장 크기 제한을 초과했습니다.");
  }
  return raw;
}

export function productionWorkspaceHasContent(
  workspace: ProductionWorkspace,
): boolean {
  return (
    workspace.tasks.length > 0
    || workspace.reviews.length > 0
    || workspace.hierarchy.length > 0
    || workspace.roleAssignments.length > 0
    || workspace.handoffs.length > 0
    || workspace.versions.length > 0
    || workspace.slides.length > 0
    || workspace.members.length > 0
  );
}
export function resolveStudioProductionWorkspaceMode(input: {
  readonly scopeKey: string;
  readonly search?: string | URLSearchParams;
  readonly serverBacked?: boolean;
  readonly cacheOnly?: boolean;
}): StudioProductionWorkspaceMode {
  if (!isStudioProductionScopeKey(input.scopeKey)) {
    throw new Error("Production workspace mode requires a valid Studio scope.");
  }
  if (input.cacheOnly) return "read-only-cache";
  const params = input.search instanceof URLSearchParams
    ? new URLSearchParams(input.search)
    : new URLSearchParams(input.search ?? "");
  const demoValues = params.getAll("demo");
  if (input.scopeKey === "draft" && demoValues.length === 1 && demoValues[0] === "1") {
    return "demo";
  }
  if (input.serverBacked && input.scopeKey.startsWith("work:")) return "server-work";
  return input.scopeKey === "draft" ? "local-draft" : "linked-local";
}

export function studioProductionWorkspaceCapabilities(
  mode: StudioProductionWorkspaceMode,
): StudioProductionWorkspaceCapabilities {
  if (mode === "server-work") {
    return {
      canEdit: true,
      canPersistLocally: false,
      canInvite: true,
      canApprove: true,
      canPublish: true,
      serverAuthoritative: true,
    };
  }
  if (mode === "read-only-cache") {
    return {
      canEdit: false,
      canPersistLocally: false,
      canInvite: false,
      canApprove: false,
      canPublish: false,
      serverAuthoritative: false,
    };
  }
  if (mode === "demo") {
    return {
      canEdit: true,
      canPersistLocally: false,
      canInvite: false,
      canApprove: false,
      canPublish: false,
      serverAuthoritative: false,
    };
  }
  return {
    canEdit: true,
    canPersistLocally: true,
    canInvite: false,
    canApprove: false,
    canPublish: false,
    serverAuthoritative: false,
  };
}

export function studioProductionWorkspaceModeLabel(
  mode: StudioProductionWorkspaceMode,
): string {
  switch (mode) {
    case "local-draft":
      return "기기 로컬 초안";
    case "linked-local":
      return "작품 연결 로컬 플래너";
    case "server-work":
      return "서버 제작 운영";
    case "read-only-cache":
      return "읽기 전용 캐시";
    case "demo":
      return "샘플 데모";
  }
}

export function projectProductionWorkspaceMutation(
  current: ProductionWorkspace,
  update: (workspace: ProductionWorkspace) => ProductionWorkspace,
  now: string,
): ProductionWorkspace {
  const updatedAt = canonicalTimestamp(now);
  if (!updatedAt) throw new Error("Production mutation requires a canonical timestamp.");
  const projected = update(current);
  if (projected.scopeKey !== current.scopeKey) {
    throw new Error("Production mutation cannot move data across Studio scopes.");
  }
  return parseProductionWorkspace(JSON.stringify({
    ...projected,
    schemaVersion: STUDIO_PRODUCTION_WORKSPACE_VERSION,
    revision: current.revision + 1,
    updatedAt,
  }), current.scopeKey) as ProductionWorkspace;
}

async function withInProcessLock<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = fallbackQueues.get(name) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  fallbackQueues.set(name, task);
  try {
    return await task;
  } finally {
    if (fallbackQueues.get(name) === task) fallbackQueues.delete(name);
  }
}

interface StudioBrowserLockManager {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive" },
    operation: () => Promise<T>,
  ): Promise<T>;
}

const defaultLock: StudioProductionWorkspaceLock = async (name, operation) => {
  const manager = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & { readonly locks?: StudioBrowserLockManager }).locks ?? null;
  return manager
    ? manager.request(name, { mode: "exclusive" }, operation)
    : withInProcessLock(name, operation);
};

async function defaultAcquireDatabase(): Promise<ProductionDatabase> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  return acquireStudioLocalDatabase();
}

export function createStudioProductionWorkspaceRepository(
  options: StudioProductionWorkspaceRepositoryOptions = {},
): StudioProductionWorkspaceRepository {
  const acquireDatabase = options.acquireDatabase ?? defaultAcquireDatabase;
  const lock = options.lock ?? defaultLock;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async load(scopeKey) {
      if (!isStudioProductionScopeKey(scopeKey)) {
        throw new Error("Production workspace load requires a valid Studio scope.");
      }
      const database = await acquireDatabase();
      return parseProductionWorkspace(
        await database.kvGet(STUDIO_PRODUCTION_NAMESPACE, scopeKey),
        scopeKey,
      );
    },

    commit(scopeKey, fallback, update) {
      if (!isStudioProductionScopeKey(scopeKey) || fallback.scopeKey !== scopeKey) {
        return Promise.reject(new Error("Production workspace commit scope is invalid."));
      }
      return lock(`${STUDIO_PRODUCTION_NAMESPACE}:${scopeKey}`, async () => {
        const database = await acquireDatabase();
        const stored = parseProductionWorkspace(
          await database.kvGet(STUDIO_PRODUCTION_NAMESPACE, scopeKey),
          scopeKey,
        );
        const current = stored ?? fallback;
        const next = projectProductionWorkspaceMutation(current, update, now());
        await database.kvSet(
          STUDIO_PRODUCTION_NAMESPACE,
          scopeKey,
          serializeProductionWorkspace(next),
        );
        return next;
      });
    },
  };
}

const defaultRepository = createStudioProductionWorkspaceRepository();

export const loadStudioProductionWorkspace = defaultRepository.load;
export const commitStudioProductionWorkspace = defaultRepository.commit;

export function createStudioProductionClientId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `production-${random}`;
  fallbackClientSequence += 1;
  return `production-${Date.now().toString(36)}-${fallbackClientSequence.toString(36)}`;
}

export function createStudioProductionWorkspaceInvalidation(input: {
  readonly scopeKey: string;
  readonly revision: number;
  readonly sourceClientId: string;
}): StudioProductionWorkspaceInvalidation {
  if (
    !isStudioProductionScopeKey(input.scopeKey)
    || !Number.isSafeInteger(input.revision)
    || input.revision < 0
    || safeIdentity(input.sourceClientId, 240) === null
  ) {
    throw new Error("Invalid Production workspace invalidation.");
  }
  return {
    type: STUDIO_PRODUCTION_INVALIDATION_TYPE,
    scopeKey: input.scopeKey,
    revision: input.revision,
    sourceClientId: input.sourceClientId,
  };
}

export function parseStudioProductionWorkspaceInvalidation(
  value: unknown,
): StudioProductionWorkspaceInvalidation | null {
  if (!isRecord(value) || value.type !== STUDIO_PRODUCTION_INVALIDATION_TYPE) return null;
  if (
    !isStudioProductionScopeKey(value.scopeKey)
    || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 0
    || safeIdentity(value.sourceClientId, 240) === null
  ) {
    return null;
  }
  return {
    type: STUDIO_PRODUCTION_INVALIDATION_TYPE,
    scopeKey: value.scopeKey,
    revision: Number(value.revision),
    sourceClientId: value.sourceClientId as string,
  };
}
