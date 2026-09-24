export const CREATOR_PUBLICATION_SOURCE_VERSION = 1 as const;
export const CREATOR_PUBLICATION_AUDIT_VERSION = 1 as const;

export const CREATOR_PUBLICATION_SOURCE_KINDS = [
  "studio_document",
  "uploaded_file",
  "external_tool",
  "remix",
] as const;
export type CreatorPublicationSourceKind =
  (typeof CREATOR_PUBLICATION_SOURCE_KINDS)[number];

export const CREATOR_PUBLICATION_ACTOR_MODES = [
  "owner",
  "collaborator",
  "automation",
  "agent",
] as const;
export type CreatorPublicationActorMode =
  (typeof CREATOR_PUBLICATION_ACTOR_MODES)[number];

export interface CreatorPublicationSourceLink {
  readonly version: typeof CREATOR_PUBLICATION_SOURCE_VERSION;
  readonly kind: CreatorPublicationSourceKind;
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly revisionId: string | null;
  readonly contentChecksum: string | null;
  readonly disclosure: string;
}

export interface PublicCreatorPublicationSource {
  readonly version: typeof CREATOR_PUBLICATION_SOURCE_VERSION;
  readonly kind: CreatorPublicationSourceKind;
  readonly revisionId: string | null;
  readonly contentChecksum: string | null;
  readonly disclosure: string;
}

export interface CreatorPublicationAuditTrail {
  readonly version: typeof CREATOR_PUBLICATION_AUDIT_VERSION;
  readonly editorActor: CreatorPublicationActorMode;
  readonly publisherActor: CreatorPublicationActorMode;
  readonly ownerApproved: boolean;
  readonly ownerUserId: string | null;
  readonly approvedAt: string | null;
  readonly toolIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function nullableText(value: unknown, maximum: number): string | null {
  return boundedText(value, maximum);
}

function sha256(value: unknown): string | null {
  const normalized = boundedText(value, 64)?.toLowerCase() ?? null;
  return normalized && /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}

function isoDate(value: unknown): string | null {
  const normalized = boundedText(value, 64);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  fallback: Values[number],
): Values[number] {
  return typeof value === "string" && values.includes(value) ? value as Values[number] : fallback;
}

function toolIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => boundedText(entry, 80))
    .filter((entry): entry is string => entry !== null))]
    .slice(0, 16);
}

export function normalizeCreatorPublicationSource(
  value: unknown,
): CreatorPublicationSourceLink | null {
  if (!isRecord(value)) return null;
  return {
    version: CREATOR_PUBLICATION_SOURCE_VERSION,
    kind: enumValue(value.kind, CREATOR_PUBLICATION_SOURCE_KINDS, "uploaded_file"),
    projectId: nullableText(value.projectId, 160),
    documentId: nullableText(value.documentId, 160),
    revisionId: nullableText(value.revisionId, 160),
    contentChecksum: sha256(value.contentChecksum),
    disclosure: boundedText(value.disclosure, 1_000) ?? "",
  };
}

export function normalizeCreatorPublicationAudit(
  value: unknown,
): CreatorPublicationAuditTrail | null {
  if (!isRecord(value)) return null;
  return {
    version: CREATOR_PUBLICATION_AUDIT_VERSION,
    editorActor: enumValue(value.editorActor, CREATOR_PUBLICATION_ACTOR_MODES, "owner"),
    publisherActor: enumValue(value.publisherActor, CREATOR_PUBLICATION_ACTOR_MODES, "owner"),
    ownerApproved: value.ownerApproved === true,
    ownerUserId: nullableText(value.ownerUserId, 160),
    approvedAt: isoDate(value.approvedAt),
    toolIds: toolIds(value.toolIds),
  };
}

export function readCreatorPublicationSource(value: unknown): CreatorPublicationSourceLink | null {
  return isRecord(value) ? normalizeCreatorPublicationSource(value.publicationSource) : null;
}

export function readCreatorPublicationAudit(value: unknown): CreatorPublicationAuditTrail | null {
  return isRecord(value) ? normalizeCreatorPublicationAudit(value.publicationAudit) : null;
}

export function writeCreatorPublicationSource(
  document: unknown,
  source: CreatorPublicationSourceLink | null,
): Record<string, unknown> {
  const next = isRecord(document) ? { ...document } : {};
  if (source) next.publicationSource = source;
  else delete next.publicationSource;
  return next;
}

export function writeCreatorPublicationAudit(
  document: unknown,
  audit: CreatorPublicationAuditTrail | null,
): Record<string, unknown> {
  const next = isRecord(document) ? { ...document } : {};
  if (audit) next.publicationAudit = audit;
  else delete next.publicationAudit;
  return next;
}

export function toPublicCreatorPublicationSource(
  value: unknown,
): PublicCreatorPublicationSource | null {
  const source = normalizeCreatorPublicationSource(value);
  if (!source) return null;
  return {
    version: source.version,
    kind: source.kind,
    revisionId: source.revisionId,
    contentChecksum: source.contentChecksum,
    disclosure: source.disclosure,
  };
}
