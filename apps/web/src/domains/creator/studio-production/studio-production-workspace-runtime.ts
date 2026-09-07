import type { StudioLocalDatabase } from "../studio-local-database";

export const STUDIO_PRODUCTION_NAMESPACE = "studio-production-command-center-v1";
export const STUDIO_PRODUCTION_WORKSPACE_VERSION = 2 as const;
export const STUDIO_PRODUCTION_INVALIDATION_TYPE =
  "studio-production-workspace-invalidated" as const;

export const STUDIO_PRODUCTION_WORKSPACE_MODES = [
  "local-draft",
  "linked-local",
  "server-work",
  "read-only-cache",
  "demo",
] as const;

export type StudioProductionWorkspaceMode =
  (typeof STUDIO_PRODUCTION_WORKSPACE_MODES)[number];

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
}

export interface ProductionReviewIssue {
  readonly id: string;
  readonly title: string;
  readonly assignee: string;
  readonly severity: ProductionReviewSeverity;
  readonly status: ProductionReviewStatus;
}

export interface ProductionVersionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly tasks: readonly ProductionTask[];
  readonly reviews: readonly ProductionReviewIssue[];
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
const MAX_TASKS = 1_000;
const MAX_REVIEWS = 1_000;
const MAX_VERSIONS = 200;
const MAX_SLIDES = 200;
const MAX_MEMBERS = 200;
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
  if (
    !id
    || !title
    || !due
    || typeof progress !== "number"
    || !Number.isFinite(progress)
    || progress < 0
    || progress > 100
    || !TASK_STATUSES.has(status as ProductionTaskStatus)
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
  };
}

function parseReview(value: unknown): ProductionReviewIssue | null {
  if (!isRecord(value)) return null;
  const id = safeIdentity(value.id);
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  const assignee = optionalString(value.assignee, MAX_TITLE_LENGTH);
  const severity = value.severity;
  const status = value.status;
  if (
    !id
    || !title
    || !REVIEW_SEVERITIES.has(severity as ProductionReviewSeverity)
    || !REVIEW_STATUSES.has(status as ProductionReviewStatus)
  ) {
    return null;
  }
  return {
    id,
    title,
    assignee,
    severity: severity as ProductionReviewSeverity,
    status: status as ProductionReviewStatus,
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
  if (tasks.some((task) => task === null) || reviews.some((review) => review === null)) {
    return null;
  }
  return {
    id,
    name,
    createdAt,
    tasks: tasks as ProductionTask[],
    reviews: reviews as ProductionReviewIssue[],
  };
}

function parseMembers(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_MEMBERS) return null;
  const members = value.map((member) => requiredString(member, MAX_TITLE_LENGTH));
  return members.some((member) => member === null) ? null : members as string[];
}

function workspaceTitle(scopeKey: string): string {
  if (scopeKey === "draft") return "새 웹툰 제작 프로젝트";
  const [kind, identity] = scopeKey.split(":", 2);
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
    members: ["디렉터", "작가", "편집자"],
    tasks: [
      {
        id: "task-story",
        title: "콘티와 대사 확정",
        owner: "작가",
        due: "2026-09-08",
        progress: 100,
        status: "done",
      },
      {
        id: "task-line",
        title: "선화·톤 작업",
        owner: "작가",
        due: "2026-09-10",
        progress: 68,
        status: "doing",
      },
      {
        id: "task-review",
        title: "연출·가독성 검수",
        owner: "편집자",
        due: "2026-09-11",
        progress: 35,
        status: "blocked",
      },
    ],
    reviews: [
      {
        id: "review-continuity",
        title: "3컷 시선 방향 불일치",
        assignee: "작가",
        severity: "blocker",
        status: "open",
      },
      {
        id: "review-balloon",
        title: "말풍선 안전 영역 확인",
        assignee: "편집자",
        severity: "major",
        status: "open",
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
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    throw new Error("지원하지 않는 제작 운영 데이터 형식입니다.");
  }
  if (value.scopeKey !== scopeKey || !isStudioProductionScopeKey(value.scopeKey)) {
    throw new Error("제작 운영 데이터의 작품 범위가 일치하지 않습니다.");
  }
  const title = requiredString(value.title, MAX_TITLE_LENGTH);
  const updatedAt = canonicalTimestamp(value.updatedAt);
  const revision = value.schemaVersion === 1 ? 0 : value.revision;
  if (
    !title
    || !updatedAt
    || !Number.isSafeInteger(revision)
    || Number(revision) < 0
    || !Array.isArray(value.tasks)
    || value.tasks.length > MAX_TASKS
    || !Array.isArray(value.reviews)
    || value.reviews.length > MAX_REVIEWS
    || !Array.isArray(value.versions)
    || value.versions.length > MAX_VERSIONS
    || !Array.isArray(value.slides)
    || value.slides.length > MAX_SLIDES
  ) {
    throw new Error("저장된 제작 운영 데이터가 올바르지 않습니다.");
  }
  const tasks = value.tasks.map(parseTask);
  const reviews = value.reviews.map(parseReview);
  const versions = value.versions.map(parseVersion);
  const slides = value.slides.map(parseSlide);
  const members = parseMembers(value.members);
  const inviteToken = value.inviteToken === null || value.inviteToken === undefined
    ? null
    : safeIdentity(value.inviteToken, 240);
  if (
    tasks.some((task) => task === null)
    || reviews.some((review) => review === null)
    || versions.some((version) => version === null)
    || slides.some((slide) => slide === null)
    || members === null
    || (value.inviteToken !== null
      && value.inviteToken !== undefined
      && inviteToken === null)
  ) {
    throw new Error("저장된 제작 운영 항목이 올바르지 않습니다.");
  }
  return {
    schemaVersion: STUDIO_PRODUCTION_WORKSPACE_VERSION,
    revision: Number(revision),
    scopeKey,
    title,
    updatedAt,
    tasks: tasks as ProductionTask[],
    reviews: reviews as ProductionReviewIssue[],
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
