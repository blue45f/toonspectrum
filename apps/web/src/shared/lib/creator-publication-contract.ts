export const CREATOR_PUBLICATION_VERSION = 1 as const;
export const CREATOR_PUBLICATION_MAX_SCHEDULE_DAYS = 365;
export const CREATOR_PUBLICATION_MIN_SCHEDULE_LEAD_MS = 60_000;
export const CREATOR_PUBLICATION_MAX_SOCIAL_TITLE_LENGTH = 70;
export const CREATOR_PUBLICATION_MAX_SOCIAL_DESCRIPTION_LENGTH = 160;
export const CREATOR_PUBLICATION_MAX_SLUG_LENGTH = 80;
export const CREATOR_PUBLICATION_MAX_TIME_ZONE_LENGTH = 100;

export const CREATOR_PUBLICATION_MODES = ["immediate", "scheduled"] as const;
export const CREATOR_PUBLICATION_VISIBILITIES = ["public", "unlisted", "private"] as const;
export const CREATOR_PUBLICATION_COMMENT_POLICIES = ["open", "closed"] as const;
export const CREATOR_PUBLICATION_READING_MODES = ["vertical", "paged"] as const;
export const CREATOR_PUBLICATION_READING_DIRECTIONS = ["ltr", "rtl"] as const;
export const CREATOR_PUBLICATION_CONTENT_RATINGS = ["all", "teen", "mature"] as const;

export type CreatorPublicationMode = (typeof CREATOR_PUBLICATION_MODES)[number];
export type CreatorPublicationVisibility = (typeof CREATOR_PUBLICATION_VISIBILITIES)[number];
export type CreatorPublicationCommentPolicy =
  (typeof CREATOR_PUBLICATION_COMMENT_POLICIES)[number];
export type CreatorPublicationReadingMode =
  (typeof CREATOR_PUBLICATION_READING_MODES)[number];
export type CreatorPublicationReadingDirection =
  (typeof CREATOR_PUBLICATION_READING_DIRECTIONS)[number];
export type CreatorPublicationContentRating =
  (typeof CREATOR_PUBLICATION_CONTENT_RATINGS)[number];
export type CreatorPublicationWorkStatus = "draft" | "published";

export interface CreatorPublicationDirective {
  version: typeof CREATOR_PUBLICATION_VERSION;
  mode: CreatorPublicationMode;
  visibility: CreatorPublicationVisibility;
  scheduledAt: string | null;
  timeZone: string;
  comments: CreatorPublicationCommentPolicy;
  allowRemix: boolean;
  readingMode: CreatorPublicationReadingMode;
  readingDirection: CreatorPublicationReadingDirection;
  contentRating: CreatorPublicationContentRating;
  searchIndexing: boolean;
  socialTitle: string;
  socialDescription: string;
  canonicalSlug: string;
  publishedAt: string | null;
}

export const CREATOR_PUBLICATION_VALIDATION_CODES = [
  "SCHEDULE_REQUIRED",
  "SCHEDULE_TOO_SOON",
  "SCHEDULE_TOO_FAR",
  "PRIVATE_SCHEDULE_UNSUPPORTED",
  "CHALLENGE_REQUIRES_PUBLIC",
  "SOCIAL_TITLE_MISSING",
  "SOCIAL_DESCRIPTION_MISSING",
  "CANONICAL_SLUG_MISSING",
  "MATURE_CONTENT_CONFIRMATION",
] as const;

export type CreatorPublicationValidationCode =
  (typeof CREATOR_PUBLICATION_VALIDATION_CODES)[number];
export type CreatorPublicationValidationSeverity = "error" | "warning";

export interface CreatorPublicationValidationIssue {
  code: CreatorPublicationValidationCode;
  severity: CreatorPublicationValidationSeverity;
  message: string;
  path: keyof CreatorPublicationDirective | "challengeId";
}

export interface CreatorPublicationValidationResult {
  valid: boolean;
  errors: CreatorPublicationValidationIssue[];
  warnings: CreatorPublicationValidationIssue[];
  issues: CreatorPublicationValidationIssue[];
  directive: CreatorPublicationDirective;
}

export interface ValidateCreatorPublicationDirectiveOptions {
  now?: Date;
  challengeLinked?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function cleanText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .trim()
    .slice(0, maximumLength);
}

function canonicalIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return null;
  }
}

export function normalizeCreatorPublicationTimeZone(value: unknown): string {
  const candidate = cleanText(value, CREATOR_PUBLICATION_MAX_TIME_ZONE_LENGTH) || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function normalizeCreatorPublicationSlug(value: unknown): string {
  const candidate = cleanText(value, CREATOR_PUBLICATION_MAX_SLUG_LENGTH * 2)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "");
  return candidate.slice(0, CREATOR_PUBLICATION_MAX_SLUG_LENGTH).replace(/-$/u, "");
}

export function createDefaultCreatorPublicationDirective(
  timeZone: unknown = "UTC",
): CreatorPublicationDirective {
  return {
    version: CREATOR_PUBLICATION_VERSION,
    mode: "immediate",
    visibility: "public",
    scheduledAt: null,
    timeZone: normalizeCreatorPublicationTimeZone(timeZone),
    comments: "open",
    allowRemix: true,
    readingMode: "vertical",
    readingDirection: "ltr",
    contentRating: "all",
    searchIndexing: true,
    socialTitle: "",
    socialDescription: "",
    canonicalSlug: "",
    publishedAt: null,
  };
}

/**
 * Normalizes creator-authored JSON into one forward-compatible publication policy. Unknown values
 * fail to conservative defaults, while non-public works can never opt into search indexing and a
 * vertical reader never carries a contradictory page-turn direction.
 */
export function normalizeCreatorPublicationDirective(
  value: unknown,
  options: { fallbackTimeZone?: unknown } = {},
): CreatorPublicationDirective {
  const source = isRecord(value) ? value : {};
  const fallback = createDefaultCreatorPublicationDirective(options.fallbackTimeZone);
  const visibility = oneOf(
    source.visibility,
    CREATOR_PUBLICATION_VISIBILITIES,
    fallback.visibility,
  );
  const readingMode = oneOf(
    source.readingMode,
    CREATOR_PUBLICATION_READING_MODES,
    fallback.readingMode,
  );
  const requestedDirection = oneOf(
    source.readingDirection,
    CREATOR_PUBLICATION_READING_DIRECTIONS,
    fallback.readingDirection,
  );
  return {
    version: CREATOR_PUBLICATION_VERSION,
    mode: oneOf(source.mode, CREATOR_PUBLICATION_MODES, fallback.mode),
    visibility,
    scheduledAt: canonicalIso(source.scheduledAt),
    timeZone: normalizeCreatorPublicationTimeZone(source.timeZone ?? fallback.timeZone),
    comments: oneOf(
      source.comments,
      CREATOR_PUBLICATION_COMMENT_POLICIES,
      fallback.comments,
    ),
    allowRemix:
      typeof source.allowRemix === "boolean" ? source.allowRemix : fallback.allowRemix,
    readingMode,
    readingDirection: readingMode === "vertical" ? "ltr" : requestedDirection,
    contentRating: oneOf(
      source.contentRating,
      CREATOR_PUBLICATION_CONTENT_RATINGS,
      fallback.contentRating,
    ),
    searchIndexing:
      visibility === "public" && typeof source.searchIndexing === "boolean"
        ? source.searchIndexing
        : visibility === "public"
          ? fallback.searchIndexing
          : false,
    socialTitle: cleanText(
      source.socialTitle,
      CREATOR_PUBLICATION_MAX_SOCIAL_TITLE_LENGTH,
    ),
    socialDescription: cleanText(
      source.socialDescription,
      CREATOR_PUBLICATION_MAX_SOCIAL_DESCRIPTION_LENGTH,
    ),
    canonicalSlug: normalizeCreatorPublicationSlug(source.canonicalSlug),
    publishedAt: canonicalIso(source.publishedAt),
  };
}

export function readCreatorPublicationDirective(
  doc: unknown,
): CreatorPublicationDirective | null {
  if (!isRecord(doc) || !Object.hasOwn(doc, "publication")) return null;
  return normalizeCreatorPublicationDirective(doc.publication);
}

export function writeCreatorPublicationDirective(
  doc: unknown,
  directive: CreatorPublicationDirective,
): Record<string, unknown> {
  return {
    ...(isRecord(doc) ? doc : {}),
    publication: normalizeCreatorPublicationDirective(directive),
  };
}

export function validateCreatorPublicationDirective(
  value: unknown,
  options: ValidateCreatorPublicationDirectiveOptions = {},
): CreatorPublicationValidationResult {
  const directive = normalizeCreatorPublicationDirective(value);
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const issues: CreatorPublicationValidationIssue[] = [];
  const add = (
    code: CreatorPublicationValidationCode,
    severity: CreatorPublicationValidationSeverity,
    message: string,
    path: CreatorPublicationValidationIssue["path"],
  ) => issues.push({ code, severity, message, path });

  if (directive.mode === "scheduled") {
    if (!directive.scheduledAt) {
      add(
        "SCHEDULE_REQUIRED",
        "error",
        "예약 게시 날짜와 시간을 입력해 주세요.",
        "scheduledAt",
      );
    } else {
      const scheduledMs = Date.parse(directive.scheduledAt);
      if (scheduledMs < nowMs + CREATOR_PUBLICATION_MIN_SCHEDULE_LEAD_MS) {
        add(
          "SCHEDULE_TOO_SOON",
          "error",
          "예약 시간은 현재보다 최소 1분 뒤여야 합니다.",
          "scheduledAt",
        );
      }
      if (scheduledMs > nowMs + CREATOR_PUBLICATION_MAX_SCHEDULE_DAYS * 86_400_000) {
        add(
          "SCHEDULE_TOO_FAR",
          "error",
          `예약 게시일은 ${CREATOR_PUBLICATION_MAX_SCHEDULE_DAYS}일 이내로 선택해 주세요.`,
          "scheduledAt",
        );
      }
    }
    if (directive.visibility === "private") {
      add(
        "PRIVATE_SCHEDULE_UNSUPPORTED",
        "error",
        "비공개 원고는 예약 게시할 수 없습니다. 링크 공개 또는 전체 공개를 선택해 주세요.",
        "visibility",
      );
    }
  }

  if (options.challengeLinked && directive.visibility !== "public") {
    add(
      "CHALLENGE_REQUIRES_PUBLIC",
      "error",
      "챌린지 참여작은 전체 공개로 게시해야 합니다.",
      "challengeId",
    );
  }

  if (!directive.socialTitle) {
    add(
      "SOCIAL_TITLE_MISSING",
      "warning",
      "공유 카드 제목을 입력하면 링크를 보낼 때 작품을 더 잘 설명할 수 있습니다.",
      "socialTitle",
    );
  }
  if (!directive.socialDescription) {
    add(
      "SOCIAL_DESCRIPTION_MISSING",
      "warning",
      "공유 카드 설명을 입력하면 검색·메신저 미리보기 품질이 좋아집니다.",
      "socialDescription",
    );
  }
  if (!directive.canonicalSlug) {
    add(
      "CANONICAL_SLUG_MISSING",
      "warning",
      "읽기 쉬운 주소 슬러그를 지정하지 않았습니다. 작품 ID 주소를 사용합니다.",
      "canonicalSlug",
    );
  }
  if (directive.contentRating === "mature") {
    add(
      "MATURE_CONTENT_CONFIRMATION",
      "warning",
      "성인 대상 고지를 독자 화면에서 다시 확인하세요.",
      "contentRating",
    );
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
    directive,
  };
}

export function resolveCreatorPublicationStatus(
  requestedStatus: CreatorPublicationWorkStatus,
  value: unknown,
  now: Date = new Date(),
): CreatorPublicationWorkStatus {
  if (requestedStatus === "draft") return "draft";
  const directive = normalizeCreatorPublicationDirective(value);
  if (directive.visibility === "private") return "draft";
  if (
    directive.mode === "scheduled" &&
    (!directive.scheduledAt || Date.parse(directive.scheduledAt) > now.getTime())
  ) {
    return "draft";
  }
  return "published";
}

export function isCreatorPublicationDue(
  value: unknown,
  now: Date = new Date(),
): boolean {
  const directive = normalizeCreatorPublicationDirective(value);
  return (
    directive.mode === "scheduled" &&
    directive.visibility !== "private" &&
    directive.publishedAt === null &&
    directive.scheduledAt !== null &&
    Date.parse(directive.scheduledAt) <= now.getTime()
  );
}

export function markCreatorPublicationPublished(
  value: unknown,
  publishedAt: Date = new Date(),
): CreatorPublicationDirective {
  return {
    ...normalizeCreatorPublicationDirective(value),
    publishedAt: publishedAt.toISOString(),
  };
}

/** Legacy published works have no directive and retain their historical public behavior. */
export function isCreatorPublicationListable(value: unknown): boolean {
  const directive = readCreatorPublicationDirective(value);
  return directive === null || directive.visibility === "public";
}

/** Link-public works are reachable by exact URL but intentionally absent from discovery surfaces. */
export function isCreatorPublicationDirectlyReadable(value: unknown): boolean {
  const directive = readCreatorPublicationDirective(value);
  return directive === null || directive.visibility !== "private";
}

export function creatorPublicationCommentsAllowed(value: unknown): boolean {
  const directive = readCreatorPublicationDirective(value);
  return directive === null || directive.comments === "open";
}

export function creatorPublicationRemixAllowed(value: unknown): boolean {
  const directive = readCreatorPublicationDirective(value);
  return directive === null || directive.allowRemix;
}

export function toPublicCreatorPublicationDirective(
  value: unknown,
): Omit<CreatorPublicationDirective, "scheduledAt" | "timeZone"> | undefined {
  const directive = normalizeCreatorPublicationDirective(value);
  if (directive.visibility === "private") return undefined;
  const { scheduledAt: _scheduledAt, timeZone: _timeZone, ...publicDirective } = directive;
  return publicDirective;
}
