export const STUDIO_SEMANTIC_ENTITY_KINDS = [
  "scene",
  "panel",
  "dialogue",
  "character",
  "location",
  "prop",
  "asset",
] as const;

export type StudioSemanticEntityKind =
  (typeof STUDIO_SEMANTIC_ENTITY_KINDS)[number];

export const STUDIO_IDENTITY_DOMAINS = [
  "writer-room",
  "comic-graph",
  "page-state",
  "character-bible",
  "asset-registry",
  "comments",
  "motion",
  "publish",
] as const;

export type StudioIdentityDomain = (typeof STUDIO_IDENTITY_DOMAINS)[number];

export interface StudioDomainReference {
  readonly domain: StudioIdentityDomain;
  readonly entityType: string;
  readonly entityId: string;
  readonly pageId?: string;
}

export type StudioIdentityLinkState =
  | "active"
  | "detached"
  | "orphaned"
  | "deleted";

export type StudioIdentityLinkSource =
  | "native"
  | "legacy-derived"
  | "imported";

export interface StudioIdentityLinkV1 {
  readonly semanticId: string;
  readonly kind: StudioSemanticEntityKind;
  readonly references: readonly StudioDomainReference[];
  readonly state: StudioIdentityLinkState;
  readonly source: StudioIdentityLinkSource;
  readonly confidence?: number;
  readonly createdAt: string;
}

export interface StudioIdentityIndexV1 {
  readonly version: 1;
  readonly workScope: string;
  readonly links: readonly StudioIdentityLinkV1[];
}

export type StudioIdentityIssueCode =
  | "invalid-kind"
  | "invalid-work-scope"
  | "invalid-semantic-id"
  | "invalid-reference"
  | "invalid-created-at"
  | "duplicate-semantic-id"
  | "duplicate-reference"
  | "reference-owned-by-another-link"
  | "invalid-confidence"
  | "state-mismatch"
  | "missing-semantic-id";

export interface StudioIdentityIssue {
  readonly code: StudioIdentityIssueCode;
  readonly message: string;
  readonly semanticId?: string;
  readonly referenceKey?: string;
  readonly candidateIndex?: number;
}

export class StudioIdentityValidationError extends Error {
  readonly name = "StudioIdentityValidationError";

  constructor(
    readonly code: StudioIdentityIssueCode,
    message: string,
    readonly referenceKey?: string,
  ) {
    super(message);
  }
}

export interface StudioIdentityCandidate {
  readonly semanticId?: string | null;
  readonly kind: StudioSemanticEntityKind;
  readonly reference: StudioDomainReference;
  readonly source?: StudioIdentityLinkSource;
  readonly confidence?: number;
  readonly createdAt?: string;
}

export interface StudioIdentityShadowResult {
  readonly index: StudioIdentityIndexV1;
  readonly issues: readonly StudioIdentityIssue[];
}

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const MAX_ID_LENGTH = 240;
const MAX_ENTITY_TYPE_LENGTH = 120;

const OWNER_DOMAINS: Readonly<
  Record<StudioSemanticEntityKind, readonly StudioIdentityDomain[]>
> = {
  scene: ["writer-room"],
  panel: ["writer-room", "comic-graph"],
  dialogue: ["writer-room"],
  character: ["character-bible"],
  location: ["writer-room"],
  prop: ["writer-room", "character-bible"],
  asset: ["asset-registry"],
};

function validIdentifier(value: string, maxLength = MAX_ID_LENGTH): boolean {
  return value.length <= maxLength && SAFE_ID_PATTERN.test(value);
}

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function canonicalStudioDomainReferenceKey(
  reference: StudioDomainReference,
): string {
  return JSON.stringify([
    reference.domain,
    reference.entityType,
    reference.pageId ?? null,
    reference.entityId,
  ]);
}

export function validateStudioDomainReference(
  reference: StudioDomainReference,
): boolean {
  return (
    (STUDIO_IDENTITY_DOMAINS as readonly string[]).includes(reference.domain)
    && validIdentifier(reference.entityType, MAX_ENTITY_TYPE_LENGTH)
    && validIdentifier(reference.entityId)
    && (reference.pageId === undefined || validIdentifier(reference.pageId))
  );
}

export function deriveStudioIdentityLinkState(
  kind: StudioSemanticEntityKind,
  references: readonly StudioDomainReference[],
  preservedState?: StudioIdentityLinkState,
): StudioIdentityLinkState {
  if (preservedState === "deleted") return "deleted";
  if (references.length === 0) return "orphaned";
  const domains = new Set(references.map((reference) => reference.domain));
  return OWNER_DOMAINS[kind].some((domain) => domains.has(domain))
    ? "active"
    : "detached";
}

function dedupeReferences(
  references: readonly StudioDomainReference[],
): StudioDomainReference[] {
  const seen = new Set<string>();
  const result: StudioDomainReference[] = [];
  for (const reference of references) {
    const key = canonicalStudioDomainReferenceKey(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reference.pageId === undefined
      ? {
          domain: reference.domain,
          entityType: reference.entityType,
          entityId: reference.entityId,
        }
      : { ...reference });
  }
  return result;
}

export function createEmptyStudioIdentityIndex(
  workScope: string,
): StudioIdentityIndexV1 {
  if (!validIdentifier(workScope)) {
    throw new StudioIdentityValidationError(
      "invalid-work-scope",
      "Studio identity index requires a valid work scope.",
    );
  }
  return Object.freeze({ version: 1, workScope, links: [] });
}

export function createStudioIdentityLink(input: {
  readonly semanticId: string;
  readonly kind: StudioSemanticEntityKind;
  readonly references?: readonly StudioDomainReference[];
  readonly state?: StudioIdentityLinkState;
  readonly source: StudioIdentityLinkSource;
  readonly confidence?: number;
  readonly createdAt: string;
}): StudioIdentityLinkV1 {
  if (!validIdentifier(input.semanticId)) {
    throw new StudioIdentityValidationError(
      "invalid-semantic-id",
      "Studio semantic identity requires a valid identifier.",
    );
  }
  if (!validTimestamp(input.createdAt)) {
    throw new StudioIdentityValidationError(
      "invalid-created-at",
      "Studio semantic identity requires a canonical UTC timestamp.",
    );
  }
  if (
    input.confidence !== undefined
    && (!Number.isFinite(input.confidence)
      || input.confidence < 0
      || input.confidence > 1)
  ) {
    throw new StudioIdentityValidationError(
      "invalid-confidence",
      "Studio semantic identity confidence must be between 0 and 1.",
    );
  }
  const references = dedupeReferences(input.references ?? []);
  const invalidReference = references.find((reference) =>
    !validateStudioDomainReference(reference)
  );
  if (invalidReference) {
    const referenceKey = canonicalStudioDomainReferenceKey(invalidReference);
    throw new StudioIdentityValidationError(
      "invalid-reference",
      "Studio semantic identity contains an invalid domain reference.",
      referenceKey,
    );
  }
  const state = deriveStudioIdentityLinkState(
    input.kind,
    references,
    input.state,
  );
  const link: StudioIdentityLinkV1 = {
    semanticId: input.semanticId,
    kind: input.kind,
    references,
    state,
    source: input.source,
    createdAt: input.createdAt,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
  };
  return Object.freeze(link);
}

export function resolveStudioSemanticId(
  index: StudioIdentityIndexV1,
  reference: StudioDomainReference,
): string | null {
  const key = canonicalStudioDomainReferenceKey(reference);
  return index.links.find((link) =>
    link.references.some((candidate) =>
      canonicalStudioDomainReferenceKey(candidate) === key
    )
  )?.semanticId ?? null;
}

export function upsertStudioIdentityLink(
  index: StudioIdentityIndexV1,
  input: Parameters<typeof createStudioIdentityLink>[0],
): StudioIdentityIndexV1 {
  const next = createStudioIdentityLink(input);
  const nextReferenceKeys = new Set(
    next.references.map(canonicalStudioDomainReferenceKey),
  );
  for (const link of index.links) {
    if (link.semanticId === next.semanticId) continue;
    const collision = link.references.find((reference) =>
      nextReferenceKeys.has(canonicalStudioDomainReferenceKey(reference))
    );
    if (collision) {
      const referenceKey = canonicalStudioDomainReferenceKey(collision);
      throw new StudioIdentityValidationError(
        "reference-owned-by-another-link",
        `Studio domain reference already belongs to ${link.semanticId}: ${referenceKey}`,
        referenceKey,
      );
    }
  }
  const existing = index.links.findIndex(
    (link) => link.semanticId === next.semanticId,
  );
  const links = existing < 0
    ? [...index.links, next]
    : index.links.map((link, linkIndex) => linkIndex === existing ? next : link);
  return Object.freeze({ ...index, links });
}

export function addStudioIdentityReference(
  index: StudioIdentityIndexV1,
  semanticId: string,
  reference: StudioDomainReference,
): StudioIdentityIndexV1 {
  const link = index.links.find((candidate) => candidate.semanticId === semanticId);
  if (!link) {
    throw new StudioIdentityValidationError(
      "invalid-semantic-id",
      `Unknown Studio semantic identity: ${semanticId}`,
    );
  }
  return upsertStudioIdentityLink(index, {
    ...link,
    references: [...link.references, reference],
  });
}

export function removeStudioIdentityReference(
  index: StudioIdentityIndexV1,
  semanticId: string,
  reference: StudioDomainReference,
): StudioIdentityIndexV1 {
  const link = index.links.find((candidate) => candidate.semanticId === semanticId);
  if (!link) return index;
  const key = canonicalStudioDomainReferenceKey(reference);
  return upsertStudioIdentityLink(index, {
    ...link,
    references: link.references.filter((candidate) =>
      canonicalStudioDomainReferenceKey(candidate) !== key
    ),
  });
}

export function validateStudioIdentityIndex(
  index: StudioIdentityIndexV1,
): readonly StudioIdentityIssue[] {
  const issues: StudioIdentityIssue[] = [];
  if (!validIdentifier(index.workScope)) {
    issues.push({
      code: "invalid-work-scope",
      message: "Studio identity index has an invalid work scope.",
    });
  }
  const semanticIds = new Set<string>();
  const referenceOwners = new Map<string, string>();
  for (const link of index.links) {
    if (!validIdentifier(link.semanticId)) {
      issues.push({
        code: "invalid-semantic-id",
        semanticId: link.semanticId,
        message: "Studio semantic identifier is invalid.",
      });
    } else if (semanticIds.has(link.semanticId)) {
      issues.push({
        code: "duplicate-semantic-id",
        semanticId: link.semanticId,
        message: `Duplicate Studio semantic identifier: ${link.semanticId}`,
      });
    }
    semanticIds.add(link.semanticId);

    if (!validTimestamp(link.createdAt)) {
      issues.push({
        code: "invalid-created-at",
        semanticId: link.semanticId,
        message: `Invalid createdAt for ${link.semanticId}`,
      });
    }

    if (
      link.confidence !== undefined
      && (!Number.isFinite(link.confidence)
        || link.confidence < 0
        || link.confidence > 1)
    ) {
      issues.push({
        code: "invalid-confidence",
        semanticId: link.semanticId,
        message: `Invalid confidence for ${link.semanticId}`,
      });
    }

    const localReferences = new Set<string>();
    for (const reference of link.references) {
      const key = canonicalStudioDomainReferenceKey(reference);
      if (!validateStudioDomainReference(reference)) {
        issues.push({
          code: "invalid-reference",
          semanticId: link.semanticId,
          referenceKey: key,
          message: `Invalid Studio domain reference in ${link.semanticId}`,
        });
      }
      if (localReferences.has(key)) {
        issues.push({
          code: "duplicate-reference",
          semanticId: link.semanticId,
          referenceKey: key,
          message: `Duplicate reference in ${link.semanticId}`,
        });
      }
      localReferences.add(key);
      const owner = referenceOwners.get(key);
      if (owner !== undefined && owner !== link.semanticId) {
        issues.push({
          code: "reference-owned-by-another-link",
          semanticId: link.semanticId,
          referenceKey: key,
          message: `Reference belongs to both ${owner} and ${link.semanticId}`,
        });
      } else {
        referenceOwners.set(key, link.semanticId);
      }
    }

    if (!STUDIO_SEMANTIC_ENTITY_KINDS.includes(link.kind)) {
      issues.push({
        code: "invalid-kind",
        semanticId: link.semanticId,
        message: "Identity link has an unknown semantic entity kind.",
      });
      continue;
    }

    const expectedState = deriveStudioIdentityLinkState(
      link.kind,
      link.references,
      link.state,
    );
    if (link.state !== expectedState) {
      issues.push({
        code: "state-mismatch",
        semanticId: link.semanticId,
        message: `${link.semanticId} should be ${expectedState}, not ${link.state}`,
      });
    }
  }
  return issues;
}

export function buildStudioSemanticIdentityShadowIndex(input: {
  readonly workScope: string;
  readonly candidates: readonly StudioIdentityCandidate[];
  readonly now?: () => string;
}): StudioIdentityShadowResult {
  const now = input.now ?? (() => new Date().toISOString());
  let index = createEmptyStudioIdentityIndex(input.workScope);
  const issues: StudioIdentityIssue[] = [];
  const grouped = new Map<string, StudioIdentityCandidate[]>();

  input.candidates.forEach((candidate, candidateIndex) => {
    const semanticId = candidate.semanticId?.trim() ?? "";
    if (!semanticId) {
      issues.push({
        code: "missing-semantic-id",
        candidateIndex,
        referenceKey: canonicalStudioDomainReferenceKey(candidate.reference),
        message: "Shadow identity scanning never invents a missing semantic ID.",
      });
      return;
    }
    const bucket = grouped.get(semanticId) ?? [];
    bucket.push(candidate);
    grouped.set(semanticId, bucket);
  });

  for (const [semanticId, candidates] of grouped) {
    const first = candidates[0];
    if (candidates.some((candidate) => candidate.kind !== first.kind)) {
      issues.push({
        code: "duplicate-semantic-id",
        semanticId,
        message: `${semanticId} is associated with more than one entity kind.`,
      });
      continue;
    }
    try {
      index = upsertStudioIdentityLink(index, {
        semanticId,
        kind: first.kind,
        references: candidates.map((candidate) => candidate.reference),
        source: first.source ?? "legacy-derived",
        confidence: candidates.reduce<number | undefined>((lowest, candidate) => {
          if (candidate.confidence === undefined) return lowest;
          return lowest === undefined
            ? candidate.confidence
            : Math.min(lowest, candidate.confidence);
        }, undefined),
        createdAt: first.createdAt ?? now(),
      });
    } catch (error) {
      if (error instanceof StudioIdentityValidationError) {
        issues.push({
          code: error.code,
          semanticId,
          ...(error.referenceKey === undefined
            ? {}
            : { referenceKey: error.referenceKey }),
          message: error.message,
        });
      } else {
        issues.push({
          code: "invalid-reference",
          semanticId,
          message: error instanceof Error
            ? error.message
            : "Identity link validation failed.",
        });
      }
    }
  }

  return {
    index,
    issues: [...issues, ...validateStudioIdentityIndex(index)],
  };
}
