import {
  createStudioArtifact,
  type StudioArtifactRevisionV1,
  type StudioArtifactV1,
} from "./artifact-revision";
import {
  assertStudioScopeRef,
  type StudioScopeRefV1,
} from "./scope-ref";

import { z } from "zod";

import { artifactSchema, moveArtifactHead, parseArtifact } from "./artifact";
import { studioEntityIdSchema } from "./ids";
import {
  assertSameImmutableRevision,
  parseRevisionManifest,
  revisionManifestSchema,
  revisionParentKindIssues,
} from "./revision";

import type { Artifact } from "./artifact";
import type { ProjectId, RevisionId } from "./ids";
import type { RevisionManifest } from "./revision";

export const projectAuthorityVersionSchema = z.enum(["legacy-v2", "project-graph-v3"]);
export type ProjectAuthorityVersion = z.infer<typeof projectAuthorityVersionSchema>;

export interface LegacyProjectionMetadata {
  readonly snapshotVersion: 2;
  readonly sceneDigest: string;
  readonly projectDigest: string;
}

export interface ProjectGraphV3 {
  readonly schemaVersion: 3;
  readonly projectId: ProjectId;
  readonly authorityVersion: ProjectAuthorityVersion;
  readonly artifacts: Readonly<Record<string, Artifact>>;
  readonly revisions: Readonly<Record<string, RevisionManifest>>;
  readonly legacyProjection?: LegacyProjectionMetadata;
}

export const projectGraphV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    projectId: studioEntityIdSchema,
    authorityVersion: projectAuthorityVersionSchema,
    artifacts: z.record(studioEntityIdSchema, artifactSchema),
    revisions: z.record(studioEntityIdSchema, revisionManifestSchema),
    legacyProjection: z
      .object({
        snapshotVersion: z.literal(2),
        sceneDigest: z.string().regex(/^[a-f0-9]{16}$/u),
        projectDigest: z.string().regex(/^[a-f0-9]{16}$/u),
      })
      .strict()
      .optional(),
  })
  .strict();

export class ProjectGraphInvariantError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`invalid ProjectGraphV3: ${issues.join("; ")}`);
    this.name = "ProjectGraphInvariantError";
  }
}

export class ProjectGraphConflictError extends Error {
  constructor(
    readonly code:
      | "artifact-exists"
      | "artifact-missing"
      | "revision-missing"
      | "revision-artifact-mismatch"
      | "head-mismatch",
    readonly targetId: string,
  ) {
    super(`project graph conflict: ${code}:${targetId}`);
    this.name = "ProjectGraphConflictError";
  }
}

export function createProjectGraphV3(
  projectId: ProjectId,
  authorityVersion: ProjectAuthorityVersion = "project-graph-v3",
): ProjectGraphV3 {
  return {
    schemaVersion: 3,
    projectId,
    authorityVersion,
    artifacts: {},
    revisions: {},
  };
}

export function parseProjectGraphV3(value: unknown): ProjectGraphV3 {
  const graph = projectGraphV3Schema.parse(value) as ProjectGraphV3;
  const issues = validateProjectGraphV3(graph);
  if (issues.length > 0) throw new ProjectGraphInvariantError(issues);
  return graph;
}

export function validateProjectGraphV3(graph: ProjectGraphV3): string[] {
  const issues: string[] = [];
  for (const [key, artifact] of Object.entries(graph.artifacts)) {
    if (key !== artifact.id) issues.push(`artifact map key ${key} differs from id ${artifact.id}`);
    if (artifact.projectId !== graph.projectId) {
      issues.push(`artifact ${artifact.id} belongs to another project`);
    }
    if (artifact.scope.projectId !== graph.projectId) {
      issues.push(`artifact ${artifact.id} scope belongs to another project`);
    }
    const head = graph.revisions[artifact.headRevisionId];
    if (head === undefined) {
      issues.push(`artifact ${artifact.id} head revision is missing`);
    } else if (head.artifactId !== artifact.id) {
      issues.push(`artifact ${artifact.id} head belongs to another artifact`);
    }
    if (artifact.approvedRevisionId !== undefined) {
      const approved = graph.revisions[artifact.approvedRevisionId];
      if (approved === undefined) {
        issues.push(`artifact ${artifact.id} approved revision is missing`);
      } else if (approved.artifactId !== artifact.id || approved.kind !== "approved") {
        issues.push(`artifact ${artifact.id} approved pointer is not an approved revision`);
      }
    }
  }

  for (const [key, revision] of Object.entries(graph.revisions)) {
    if (key !== revision.id) issues.push(`revision map key ${key} differs from id ${revision.id}`);
    const artifact = graph.artifacts[revision.artifactId];
    if (artifact === undefined) {
      issues.push(`revision ${revision.id} references a missing artifact`);
      continue;
    }
    const parents = revision.parentIds.flatMap((parentId) => {
      const parent = graph.revisions[parentId];
      if (parent === undefined) {
        issues.push(`revision ${revision.id} parent ${parentId} is missing`);
        return [];
      }
      return [parent];
    });
    if (parents.length === revision.parentIds.length) {
      issues.push(...revisionParentKindIssues(revision, parents).map(
        (issue) => `revision ${revision.id}: ${issue}`,
      ));
    }
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const visit = (revisionId: string): void => {
    const state = visitState.get(revisionId);
    if (state === "visiting") {
      issues.push(`revision graph contains a cycle at ${revisionId}`);
      return;
    }
    if (state === "visited") return;
    visitState.set(revisionId, "visiting");
    const revision = graph.revisions[revisionId];
    if (revision !== undefined) {
      for (const parentId of revision.parentIds) visit(parentId);
    }
    visitState.set(revisionId, "visited");
  };
  for (const revisionId of Object.keys(graph.revisions)) visit(revisionId);
  return [...new Set(issues)];
}

export function addArtifactWithInitialRevision(
  graph: ProjectGraphV3,
  artifactInput: Artifact,
  revisionInput: RevisionManifest,
): ProjectGraphV3 {
  const artifact = parseArtifact(artifactInput);
  const revision = parseRevisionManifest(revisionInput);
  if (graph.artifacts[artifact.id] !== undefined) {
    throw new ProjectGraphConflictError("artifact-exists", artifact.id);
  }
  if (artifact.projectId !== graph.projectId || artifact.scope.projectId !== graph.projectId) {
    throw new ProjectGraphInvariantError([`artifact ${artifact.id} project scope mismatch`]);
  }
  if (artifact.headRevisionId !== revision.id) {
    throw new ProjectGraphConflictError("head-mismatch", artifact.id);
  }
  if (revision.artifactId !== artifact.id) {
    throw new ProjectGraphConflictError("revision-artifact-mismatch", revision.id);
  }
  const transitionIssues = revisionParentKindIssues(revision, []);
  if (transitionIssues.length > 0) throw new ProjectGraphInvariantError(transitionIssues);
  const next: ProjectGraphV3 = {
    ...graph,
    artifacts: { ...graph.artifacts, [artifact.id]: artifact },
    revisions: { ...graph.revisions, [revision.id]: revision },
  };
  return parseProjectGraphV3(next);
}

export interface AppendRevisionOptions {
  readonly advanceHead?: boolean;
  readonly approve?: boolean;
}

export function appendRevision(
  graph: ProjectGraphV3,
  revisionInput: RevisionManifest,
  options: AppendRevisionOptions = {},
): ProjectGraphV3 {
  const revision = parseRevisionManifest(revisionInput);
  const artifact = graph.artifacts[revision.artifactId];
  if (artifact === undefined) {
    throw new ProjectGraphConflictError("artifact-missing", revision.artifactId);
  }
  const existing = graph.revisions[revision.id];
  if (existing !== undefined) {
    assertSameImmutableRevision(existing, revision);
    return graph;
  }
  const parents = revision.parentIds.map((parentId) => {
    const parent = graph.revisions[parentId];
    if (parent === undefined) {
      throw new ProjectGraphConflictError("revision-missing", parentId);
    }
    return parent;
  });
  const transitionIssues = revisionParentKindIssues(revision, parents);
  if (transitionIssues.length > 0) throw new ProjectGraphInvariantError(transitionIssues);
  const shouldAdvanceHead = options.advanceHead
    ?? (revision.kind !== "review-snapshot" && revision.kind !== "release");
  const approve = options.approve ?? revision.kind === "approved";
  if (approve && revision.kind !== "approved") {
    throw new ProjectGraphInvariantError(["only an approved revision may be pinned as approved"]);
  }
  let nextArtifact = artifact;
  if (shouldAdvanceHead) {
    nextArtifact = moveArtifactHead(artifact, revision.id, revision.createdAt);
  }
  if (approve) nextArtifact = { ...nextArtifact, approvedRevisionId: revision.id };
  const next: ProjectGraphV3 = {
    ...graph,
    artifacts: { ...graph.artifacts, [artifact.id]: nextArtifact },
    revisions: { ...graph.revisions, [revision.id]: revision },
  };
  return parseProjectGraphV3(next);
}

export function moveProjectArtifactHead(
  graph: ProjectGraphV3,
  artifactId: string,
  revisionId: RevisionId,
  updatedAt: string,
): ProjectGraphV3 {
  const artifact = graph.artifacts[artifactId];
  if (artifact === undefined) {
    throw new ProjectGraphConflictError("artifact-missing", artifactId);
  }
  const revision = graph.revisions[revisionId];
  if (revision === undefined) {
    throw new ProjectGraphConflictError("revision-missing", revisionId);
  }
  if (revision.artifactId !== artifact.id) {
    throw new ProjectGraphConflictError("revision-artifact-mismatch", revisionId);
  }
  return parseProjectGraphV3({
    ...graph,
    artifacts: {
      ...graph.artifacts,
      [artifact.id]: moveArtifactHead(artifact, revisionId, updatedAt),
    },
  });
}

export const STUDIO_PROJECT_NODE_KINDS = [
  "series",
  "season",
  "episode",
  "sequence",
  "scene",
  "panel",
  "element",
] as const;

export type StudioProjectNodeKind = (typeof STUDIO_PROJECT_NODE_KINDS)[number];

export interface StudioProjectNodeV1 {
  readonly version: 1;
  readonly id: string;
  readonly kind: StudioProjectNodeKind;
  readonly parentId: string | null;
  readonly scope: StudioScopeRefV1;
  readonly label: string;
  readonly order: number;
}

export interface StudioAssetUsageV1 {
  readonly version: 1;
  readonly id: string;
  readonly assetId: string;
  readonly assetRevisionId: string;
  readonly licenseGrantId: string;
  readonly scope: StudioScopeRefV1;
  readonly insertedAt: string;
}

export interface StudioTaskArtifactLinkV1 {
  readonly version: 1;
  readonly taskId: string;
  readonly scope: StudioScopeRefV1;
  readonly inputRevisionIds: readonly string[];
  readonly outputArtifactIds: readonly string[];
}

export interface StudioReviewArtifactLinkV1 {
  readonly version: 1;
  readonly reviewId: string;
  readonly reviewSnapshotRevisionId: string;
  readonly approvedRevisionId: string | null;
}

export interface StudioReleaseLinkV1 {
  readonly version: 1;
  readonly releaseId: string;
  readonly approvedRevisionId: string;
  readonly releaseRevisionId: string;
  readonly destinationProfileId: string;
}

export interface StudioProjectGraphV1 {
  readonly version: 1;
  readonly projectId: string;
  readonly title: string;
  readonly nodes: readonly StudioProjectNodeV1[];
  readonly artifacts: readonly StudioArtifactV1[];
  readonly revisions: readonly StudioArtifactRevisionV1[];
  readonly assetUsages: readonly StudioAssetUsageV1[];
  readonly taskLinks: readonly StudioTaskArtifactLinkV1[];
  readonly reviewLinks: readonly StudioReviewArtifactLinkV1[];
  readonly releaseLinks: readonly StudioReleaseLinkV1[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type StudioProjectGraphIssueCode =
  | "duplicate-id"
  | "missing-parent"
  | "scope-project-mismatch"
  | "revision-artifact-missing"
  | "revision-not-listed"
  | "working-revision-invalid"
  | "review-revision-invalid"
  | "release-revision-invalid";

export interface StudioProjectGraphIssue {
  readonly code: StudioProjectGraphIssueCode;
  readonly entityId: string;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

function uniqueIssues(ids: readonly string[], entity: string): StudioProjectGraphIssue[] {
  const seen = new Set<string>();
  const issues: StudioProjectGraphIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ code: "duplicate-id", entityId: id, message: `${entity} id is duplicated.` });
    }
    seen.add(id);
  }
  return issues;
}

export function validateStudioProjectGraph(
  graph: StudioProjectGraphV1,
): readonly StudioProjectGraphIssue[] {
  const issues: StudioProjectGraphIssue[] = [
    ...uniqueIssues(graph.nodes.map((node) => node.id), "Project node"),
    ...uniqueIssues(graph.artifacts.map((artifact) => artifact.id), "Artifact"),
    ...uniqueIssues(graph.revisions.map((revision) => revision.id), "Revision"),
  ];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const artifacts = new Map(graph.artifacts.map((artifact) => [artifact.id, artifact]));
  const revisions = new Map(graph.revisions.map((revision) => [revision.id, revision]));

  for (const node of graph.nodes) {
    assertStudioScopeRef(node.scope);
    if (node.scope.projectId !== graph.projectId) {
      issues.push({
        code: "scope-project-mismatch",
        entityId: node.id,
        message: "Project node scope belongs to another project.",
      });
    }
    if (node.parentId !== null && !nodes.has(node.parentId)) {
      issues.push({
        code: "missing-parent",
        entityId: node.id,
        message: "Project node parent does not exist.",
      });
    }
  }

  for (const artifact of graph.artifacts) {
    if (artifact.projectId !== graph.projectId || artifact.scope.projectId !== graph.projectId) {
      issues.push({
        code: "scope-project-mismatch",
        entityId: artifact.id,
        message: "Artifact belongs to another project.",
      });
    }
    for (const revisionId of artifact.revisionIds) {
      const revision = revisions.get(revisionId);
      if (!revision || revision.artifactId !== artifact.id) {
        issues.push({
          code: "revision-not-listed",
          entityId: revisionId,
          message: "Artifact revision list references an invalid revision.",
        });
      }
    }
    if (artifact.workingRevisionId !== null) {
      const working = revisions.get(artifact.workingRevisionId);
      if (!working || working.artifactId !== artifact.id || working.kind !== "working") {
        issues.push({
          code: "working-revision-invalid",
          entityId: artifact.id,
          message: "Artifact working revision must be a mutable working revision.",
        });
      }
    }
  }

  for (const revision of graph.revisions) {
    if (!artifacts.has(revision.artifactId)) {
      issues.push({
        code: "revision-artifact-missing",
        entityId: revision.id,
        message: "Revision artifact does not exist.",
      });
    }
  }

  for (const link of graph.reviewLinks) {
    const snapshot = revisions.get(link.reviewSnapshotRevisionId);
    const approved = link.approvedRevisionId === null
      ? null
      : revisions.get(link.approvedRevisionId);
    if (!snapshot || snapshot.kind !== "review-snapshot" || (approved && approved.kind !== "approved")) {
      issues.push({
        code: "review-revision-invalid",
        entityId: link.reviewId,
        message: "Review links must reference review-snapshot and approved revisions.",
      });
    }
  }

  for (const link of graph.releaseLinks) {
    const approved = revisions.get(link.approvedRevisionId);
    const release = revisions.get(link.releaseRevisionId);
    if (!approved || approved.kind !== "approved" || !release || release.kind !== "release") {
      issues.push({
        code: "release-revision-invalid",
        entityId: link.releaseId,
        message: "Release links must reference approved and release revisions.",
      });
    }
  }
  return Object.freeze(issues);
}

export function createStudioProjectGraph(input: {
  readonly projectId: string;
  readonly title: string;
  readonly createdAt: string;
}): StudioProjectGraphV1 {
  if (!SAFE_ID.test(input.projectId) || !input.title.trim()) {
    throw new Error("Project graph requires a canonical id and title.");
  }
  const graph: StudioProjectGraphV1 = Object.freeze({
    version: 1,
    projectId: input.projectId,
    title: input.title,
    nodes: Object.freeze([]),
    artifacts: Object.freeze([]),
    revisions: Object.freeze([]),
    assetUsages: Object.freeze([]),
    taskLinks: Object.freeze([]),
    reviewLinks: Object.freeze([]),
    releaseLinks: Object.freeze([]),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  return graph;
}

export function addStudioArtifactToGraph(
  graph: StudioProjectGraphV1,
  artifact: StudioArtifactV1,
): StudioProjectGraphV1 {
  if (graph.artifacts.some((candidate) => candidate.id === artifact.id)) {
    throw new Error(`Artifact ${artifact.id} already exists.`);
  }
  const next = Object.freeze({
    ...graph,
    artifacts: Object.freeze([...graph.artifacts, createStudioArtifact(artifact)]),
    updatedAt: artifact.updatedAt,
  });
  const issues = validateStudioProjectGraph(next);
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(" "));
  return next;
}

export function appendStudioRevisionToGraph(
  graph: StudioProjectGraphV1,
  revision: StudioArtifactRevisionV1,
): StudioProjectGraphV1 {
  if (graph.revisions.some((candidate) => candidate.id === revision.id)) {
    throw new Error(`Revision ${revision.id} already exists.`);
  }
  const artifactIndex = graph.artifacts.findIndex(
    (artifact) => artifact.id === revision.artifactId,
  );
  if (artifactIndex < 0) throw new Error("Revision artifact does not exist.");
  for (const parentId of revision.parentRevisionIds) {
    const parent = graph.revisions.find((candidate) => candidate.id === parentId);
    if (!parent || parent.artifactId !== revision.artifactId) {
      throw new Error("Revision parent is missing or belongs to another artifact.");
    }
  }

  const artifacts = [...graph.artifacts];
  const current = artifacts[artifactIndex]!;
  artifacts[artifactIndex] = createStudioArtifact({
    ...current,
    revisionIds: [...current.revisionIds, revision.id],
    workingRevisionId: revision.kind === "working"
      ? revision.id
      : current.workingRevisionId,
    updatedAt: revision.createdAt,
  });
  const next = Object.freeze({
    ...graph,
    artifacts: Object.freeze(artifacts),
    revisions: Object.freeze([...graph.revisions, revision]),
    updatedAt: revision.createdAt,
  });
  const issues = validateStudioProjectGraph(next);
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(" "));
  return next;
}
