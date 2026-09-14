export const CREATOR_COMMUNITY_METADATA_VERSION = 1 as const;
export const CREATOR_COMMUNITY_RELEASE_VERSION = 1 as const;

export const CREATOR_COMMUNITY_CONTENT_KINDS = [
  "illustration",
  "illustration_set",
  "art_project",
  "webtoon_episode",
  "one_shot",
  "page_comic",
  "short_comic",
  "process",
  "wip",
] as const;

export const CREATOR_COMMUNITY_CONTENT_GROUPS = [
  "all",
  "illustration",
  "webtoon",
  "process",
] as const;

export const CREATOR_COMMUNITY_PROVENANCES = [
  "human",
  "ai_assisted",
  "ai_generated",
  "mixed",
] as const;

export const CREATOR_COMMUNITY_CONTENT_DESCRIPTORS = [
  "violence",
  "gore",
  "horror",
  "sexuality",
  "language",
  "drugs",
  "self_harm",
  "sensitive_topic",
] as const;

export const CREATOR_COMMUNITY_FEEDBACK_TOPICS = [
  "general",
  "composition",
  "color",
  "anatomy",
  "background",
  "direction",
  "lettering",
  "portfolio",
  "none",
] as const;

export const CREATOR_COMMUNITY_RELEASE_STATES = [
  "review",
  "approved",
  "published",
  "superseded",
  "withdrawn",
] as const;
export const CREATOR_COMMUNITY_APPROVAL_STATES = [
  "pending",
  "approved",
  "rejected",
] as const;
export const CREATOR_COMMUNITY_PUBLICATION_STATES = [
  "scheduled",
  "published",
  "unpublished",
] as const;
export const CREATOR_COMMUNITY_EXTERNAL_PLATFORMS = [
  "naver",
  "webtoon_canvas",
  "tapas",
  "postype",
  "pixiv",
  "globalcomix",
  "other",
] as const;
export const CREATOR_COMMUNITY_EXTERNAL_STATUSES = [
  "draft",
  "published",
  "updated",
  "removed",
] as const;

export type CreatorCommunityContentKind =
  (typeof CREATOR_COMMUNITY_CONTENT_KINDS)[number];
export type CreatorCommunityContentGroup =
  (typeof CREATOR_COMMUNITY_CONTENT_GROUPS)[number];
export type CreatorCommunityProvenance =
  (typeof CREATOR_COMMUNITY_PROVENANCES)[number];
export type CreatorCommunityContentDescriptor =
  (typeof CREATOR_COMMUNITY_CONTENT_DESCRIPTORS)[number];
export type CreatorCommunityFeedbackTopic =
  (typeof CREATOR_COMMUNITY_FEEDBACK_TOPICS)[number];
export type CreatorCommunityReleaseState =
  (typeof CREATOR_COMMUNITY_RELEASE_STATES)[number];
export type CreatorCommunityApprovalState =
  (typeof CREATOR_COMMUNITY_APPROVAL_STATES)[number];
export type CreatorCommunityPublicationState =
  (typeof CREATOR_COMMUNITY_PUBLICATION_STATES)[number];
export type CreatorCommunityExternalPlatform =
  (typeof CREATOR_COMMUNITY_EXTERNAL_PLATFORMS)[number];
export type CreatorCommunityExternalStatus =
  (typeof CREATOR_COMMUNITY_EXTERNAL_STATUSES)[number];

export interface CreatorCommunityMetadata {
  version: typeof CREATOR_COMMUNITY_METADATA_VERSION;
  kind: CreatorCommunityContentKind;
  portfolio: boolean;
  provenance: CreatorCommunityProvenance;
  contentDescriptors: CreatorCommunityContentDescriptor[];
  feedbackTopics: CreatorCommunityFeedbackTopic[];
  downloadAllowed: boolean;
  trainingAllowed: boolean;
  attributionText: string;
  altText: string;
}

export interface CreatorCommunityReleaseManifest {
  version: typeof CREATOR_COMMUNITY_RELEASE_VERSION;
  workId: string;
  workRevision: number;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  format: "cuttoon" | "upload";
  pages: string[];
  doc: Record<string, unknown>;
  seriesId: string | null;
  episodeNo: number | null;
  challengeId: string | null;
  remixFromId: string | null;
  author: { id: string; name: string; avatar: string };
  community: CreatorCommunityMetadata;
  capturedAt: string;
}

export interface CreatorCommunityReleaseApproval {
  userId: string;
  name: string;
  avatar: string;
  state: CreatorCommunityApprovalState;
  note: string;
  decidedAt: string | null;
}

export interface CreatorCommunityReleaseSummary {
  id: string;
  workId: string;
  releaseNo: number;
  workRevision: number;
  fingerprint: string;
  state: CreatorCommunityReleaseState;
  title: string;
  kind: CreatorCommunityContentKind;
  provenance: CreatorCommunityProvenance;
  approvals: CreatorCommunityReleaseApproval[];
  createdAt: string;
  publishedAt: string | null;
}

export interface CreatorCommunityPublicationSummary {
  id: string;
  workId: string;
  releaseId: string;
  state: CreatorCommunityPublicationState;
  visibility: "public" | "unlisted" | "private";
  scheduledAt: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  canonicalSlug: string;
}

export interface CreatorCommunityPortfolioEntry {
  workId: string;
  releaseId: string;
  position: number;
  featured: boolean;
  createdAt: string;
  work: {
    title: string;
    description: string;
    cover: string;
    tags: string[];
    kind: CreatorCommunityContentKind;
    provenance: CreatorCommunityProvenance;
    author: { id: string; name: string; avatar: string };
  };
}

export interface CreatorCommunityExternalPublication {
  id: string;
  workId: string;
  releaseId: string;
  platform: CreatorCommunityExternalPlatform;
  externalUrl: string;
  status: CreatorCommunityExternalStatus;
  publishedAt: string | null;
  updatedAt: string;
}

const ILLUSTRATION_KINDS = new Set<CreatorCommunityContentKind>([
  "illustration",
  "illustration_set",
  "art_project",
]);
const WEBTOON_KINDS = new Set<CreatorCommunityContentKind>([
  "webtoon_episode",
  "one_shot",
  "page_comic",
  "short_comic",
]);

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

function uniqueValues<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  maximum: number,
): Value[] {
  if (!Array.isArray(value)) return [];
  const result: Value[] = [];
  for (const candidate of value) {
    if (!allowed.includes(candidate as Value) || result.includes(candidate as Value)) continue;
    result.push(candidate as Value);
    if (result.length >= maximum) break;
  }
  return result;
}

function stripDisallowedControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 9 ||
      codePoint === 10 ||
      codePoint === 13 ||
      (codePoint >= 32 && codePoint !== 127)
    ) {
      result += character;
    }
  }
  return result;
}

function cleanText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") return "";
  return stripDisallowedControlCharacters(value).trim().slice(0, maximumLength);
}

export function defaultCreatorCommunityContentKind(
  format: unknown,
): CreatorCommunityContentKind {
  return format === "upload" ? "illustration" : "webtoon_episode";
}

export function createDefaultCreatorCommunityMetadata(
  format: unknown = "cuttoon",
): CreatorCommunityMetadata {
  return {
    version: CREATOR_COMMUNITY_METADATA_VERSION,
    kind: defaultCreatorCommunityContentKind(format),
    portfolio: false,
    provenance: "human",
    contentDescriptors: [],
    feedbackTopics: ["general"],
    downloadAllowed: false,
    trainingAllowed: false,
    attributionText: "",
    altText: "",
  };
}

export function normalizeCreatorCommunityMetadata(
  value: unknown,
  options: { format?: unknown } = {},
): CreatorCommunityMetadata {
  const source = isRecord(value) ? value : {};
  const fallback = createDefaultCreatorCommunityMetadata(options.format);
  const feedbackTopics = uniqueValues(
    source.feedbackTopics,
    CREATOR_COMMUNITY_FEEDBACK_TOPICS,
    8,
  );
  return {
    version: CREATOR_COMMUNITY_METADATA_VERSION,
    kind: oneOf(source.kind, CREATOR_COMMUNITY_CONTENT_KINDS, fallback.kind),
    portfolio: typeof source.portfolio === "boolean" ? source.portfolio : false,
    provenance: oneOf(
      source.provenance,
      CREATOR_COMMUNITY_PROVENANCES,
      fallback.provenance,
    ),
    contentDescriptors: uniqueValues(
      source.contentDescriptors,
      CREATOR_COMMUNITY_CONTENT_DESCRIPTORS,
      8,
    ),
    feedbackTopics: feedbackTopics.includes("none")
      ? ["none"]
      : feedbackTopics.length > 0
        ? feedbackTopics
        : fallback.feedbackTopics,
    downloadAllowed:
      typeof source.downloadAllowed === "boolean" ? source.downloadAllowed : false,
    trainingAllowed:
      typeof source.trainingAllowed === "boolean" ? source.trainingAllowed : false,
    attributionText: cleanText(source.attributionText, 240),
    altText: cleanText(source.altText, 1_000),
  };
}

export function readCreatorCommunityMetadata(
  doc: unknown,
  options: { format?: unknown } = {},
): CreatorCommunityMetadata {
  if (!isRecord(doc)) return createDefaultCreatorCommunityMetadata(options.format);
  return normalizeCreatorCommunityMetadata(doc.community, options);
}

export function writeCreatorCommunityMetadata(
  doc: unknown,
  metadata: CreatorCommunityMetadata,
  options: { format?: unknown } = {},
): Record<string, unknown> {
  return {
    ...(isRecord(doc) ? doc : {}),
    community: normalizeCreatorCommunityMetadata(metadata, options),
  };
}

export function creatorCommunityContentGroupOf(
  kind: CreatorCommunityContentKind,
): Exclude<CreatorCommunityContentGroup, "all"> {
  if (ILLUSTRATION_KINDS.has(kind)) return "illustration";
  if (WEBTOON_KINDS.has(kind)) return "webtoon";
  return "process";
}

export function creatorCommunityKindMatchesGroup(
  kind: CreatorCommunityContentKind,
  group: CreatorCommunityContentGroup,
): boolean {
  return group === "all" || creatorCommunityContentGroupOf(kind) === group;
}

export function parseCreatorCommunityContentGroup(
  value: unknown,
): CreatorCommunityContentGroup {
  return oneOf(value, CREATOR_COMMUNITY_CONTENT_GROUPS, "all");
}

export function parseCreatorCommunityProvenance(
  value: unknown,
): CreatorCommunityProvenance | null {
  return CREATOR_COMMUNITY_PROVENANCES.includes(value as CreatorCommunityProvenance)
    ? (value as CreatorCommunityProvenance)
    : null;
}
