import type { StudioScopeRefV1 } from "./scope-ref";
import { assertStudioScopeRef } from "./scope-ref";

export const STUDIO_ARTIFACT_KINDS = [
  "story",
  "storyboard",
  "canvas-2d",
  "scene-3d",
  "asset",
  "audio",
  "localization",
  "deliverable",
  "review",
  "release-package",
] as const;

export const STUDIO_REVISION_KINDS = [
  "working",
  "named-checkpoint",
  "submission",
  "review-snapshot",
  "approved",
  "release",
] as const;

export type StudioArtifactKind = (typeof STUDIO_ARTIFACT_KINDS)[number];
export type StudioRevisionKind = (typeof STUDIO_REVISION_KINDS)[number];

export interface StudioArtifactV1 {
  readonly version: 1;
  readonly id: string;
  readonly projectId: string;
  readonly kind: StudioArtifactKind;
  readonly scope: StudioScopeRefV1;
  readonly title: string;
  readonly revisionIds: readonly string[];
  readonly workingRevisionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioArtifactRevisionV1 {
  readonly version: 1;
  readonly id: string;
  readonly artifactId: string;
  readonly kind: StudioRevisionKind;
  readonly parentRevisionIds: readonly string[];
  readonly contentDigest: string;
  readonly manifestDigest: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly label: string | null;
  readonly sourceFormat: string | null;
  readonly sourceBlobDigest: string | null;
  readonly immutable: boolean;
}

export interface StudioRevisionTransitionInput {
  readonly id: string;
  readonly kind: StudioRevisionKind;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly contentDigest: string;
  readonly manifestDigest?: string | null;
  readonly label?: string | null;
  readonly sourceFormat?: string | null;
  readonly sourceBlobDigest?: string | null;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const DIGEST = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const IMMUTABLE_KINDS = new Set<StudioRevisionKind>([
  "named-checkpoint",
  "submission",
  "review-snapshot",
  "approved",
  "release",
]);

const ALLOWED_CHILDREN: Readonly<Record<StudioRevisionKind, readonly StudioRevisionKind[]>> = {
  working: ["working", "named-checkpoint", "submission"],
  "named-checkpoint": ["working", "submission"],
  submission: ["working", "review-snapshot"],
  "review-snapshot": ["working", "approved"],
  approved: ["working", "release"],
  release: ["working"],
};

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function assertIdentity(value: string, label: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`${label} is invalid.`);
}

export function isStudioRevisionImmutable(kind: StudioRevisionKind): boolean {
  return IMMUTABLE_KINDS.has(kind);
}

export function createStudioArtifact(input: Omit<StudioArtifactV1, "version">): StudioArtifactV1 {
  assertIdentity(input.id, "Artifact id");
  assertIdentity(input.projectId, "Artifact project id");
  assertStudioScopeRef(input.scope);
  if (input.scope.projectId !== input.projectId) {
    throw new Error("Artifact scope belongs to another project.");
  }
  if (!input.title.trim()) throw new Error("Artifact title is required.");
  if (!validTimestamp(input.createdAt) || !validTimestamp(input.updatedAt)) {
    throw new Error("Artifact timestamps must be canonical UTC timestamps.");
  }
  if (new Set(input.revisionIds).size !== input.revisionIds.length) {
    throw new Error("Artifact revision ids must be unique.");
  }
  if (
    input.workingRevisionId !== null
    && !input.revisionIds.includes(input.workingRevisionId)
  ) {
    throw new Error("Artifact working revision must belong to its revision list.");
  }
  return Object.freeze({
    version: 1,
    ...input,
    revisionIds: Object.freeze([...input.revisionIds]),
  });
}

export function createStudioArtifactRevision(
  input: Omit<StudioArtifactRevisionV1, "version" | "immutable">,
): StudioArtifactRevisionV1 {
  assertIdentity(input.id, "Revision id");
  assertIdentity(input.artifactId, "Revision artifact id");
  assertIdentity(input.createdBy, "Revision actor id");
  if (!DIGEST.test(input.contentDigest)) throw new Error("Revision content digest is invalid.");
  if (input.manifestDigest !== null && !DIGEST.test(input.manifestDigest)) {
    throw new Error("Revision manifest digest is invalid.");
  }
  if (!validTimestamp(input.createdAt)) {
    throw new Error("Revision timestamp must be a canonical UTC timestamp.");
  }
  if (new Set(input.parentRevisionIds).size !== input.parentRevisionIds.length) {
    throw new Error("Revision parent ids must be unique.");
  }
  return Object.freeze({
    version: 1,
    ...input,
    parentRevisionIds: Object.freeze([...input.parentRevisionIds]),
    immutable: isStudioRevisionImmutable(input.kind),
  });
}

export function deriveStudioArtifactRevision(
  parent: StudioArtifactRevisionV1,
  input: StudioRevisionTransitionInput,
): StudioArtifactRevisionV1 {
  if (!ALLOWED_CHILDREN[parent.kind].includes(input.kind)) {
    throw new Error(`Revision transition ${parent.kind} -> ${input.kind} is not allowed.`);
  }
  return createStudioArtifactRevision({
    id: input.id,
    artifactId: parent.artifactId,
    kind: input.kind,
    parentRevisionIds: [parent.id],
    contentDigest: input.contentDigest,
    manifestDigest: input.manifestDigest ?? null,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    label: input.label ?? null,
    sourceFormat: input.sourceFormat ?? parent.sourceFormat,
    sourceBlobDigest: input.sourceBlobDigest ?? parent.sourceBlobDigest,
  });
}

export function assertStudioRevisionWritable(revision: StudioArtifactRevisionV1): void {
  if (revision.immutable || revision.kind !== "working") {
    throw new Error(`Revision ${revision.id} is immutable and cannot be edited in place.`);
  }
}
