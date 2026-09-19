import { parseArtifact, type Artifact } from "./artifact";
import {
  createStudioArtifact,
  type StudioArtifactRevisionV1,
  type StudioArtifactV1,
} from "./artifact-revision";
import {
  assertSameImmutableRevision,
  parseRevisionManifest,
  revisionParentKindIssues,
  type RevisionManifest,
} from "./revision";
import {
  assertStudioScopeRef,
  type StudioScopeRefV1,
} from "./scope-ref";

import type { ProjectId } from "./ids";

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


/**
 * Durable ProjectGraph v3 compatibility surface.
 *
 * The v1 platform graph above is used by the current product adapter, while the v3 graph is the
 * append-only revision authority consumed by the engine and legacy-shadow migration. Keeping both
 * contracts here avoids making either caller reinterpret the other's persistence shape.
 */
type ProjectAuthorityVersion = "legacy-v2" | "project-graph-v3";

export interface ProjectGraphLegacyProjection {
  readonly snapshotVersion: 2;
  readonly sceneDigest: string;
  readonly projectDigest: string;
}

export interface ProjectGraphV3 {
  readonly version: 3;
  readonly projectId: ProjectId;
  readonly authorityVersion: ProjectAuthorityVersion;
  readonly artifacts: Readonly<Record<string, Artifact>>;
  readonly revisions: Readonly<Record<string, RevisionManifest>>;
  readonly legacyProjection?: ProjectGraphLegacyProjection;
}

export class ProjectGraphInvariantError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`ProjectGraph v3 invariant failed: ${issues.join("; ")}`);
    this.name = "ProjectGraphInvariantError";
  }
}

function frozenRecord<T>(entries: readonly (readonly [string, T])[]): Readonly<Record<string, T>> {
  return Object.freeze(Object.fromEntries(entries));
}

export function createProjectGraphV3(
  projectId: ProjectId,
  authorityVersion: ProjectAuthorityVersion = "project-graph-v3",
): ProjectGraphV3 {
  return Object.freeze({
    version: 3,
    projectId,
    authorityVersion,
    artifacts: frozenRecord<Artifact>([]),
    revisions: frozenRecord<RevisionManifest>([]),
  });
}

export function validateProjectGraphV3(graph: ProjectGraphV3): readonly string[] {
  const issues: string[] = [];
  if (graph.version !== 3) issues.push("graph version must be 3");
  if (graph.authorityVersion !== "legacy-v2" && graph.authorityVersion !== "project-graph-v3") {
    issues.push("graph authority version is invalid");
  }

  for (const [key, artifact] of Object.entries(graph.artifacts)) {
    try {
      parseArtifact(artifact);
    } catch {
      issues.push(`artifact ${key} is invalid`);
      continue;
    }
    if (key !== artifact.id) issues.push(`artifact key ${key} does not match id ${artifact.id}`);
    if (artifact.projectId !== graph.projectId || artifact.scope.projectId !== graph.projectId) {
      issues.push(`artifact ${artifact.id} belongs to another project`);
    }
    const head = graph.revisions[artifact.headRevisionId];
    if (!head || head.artifactId !== artifact.id) {
      issues.push(`artifact ${artifact.id} head revision is missing or belongs to another artifact`);
    }
    if (artifact.approvedRevisionId !== undefined) {
      const approved = graph.revisions[artifact.approvedRevisionId];
      if (!approved || approved.artifactId !== artifact.id || approved.kind !== "approved") {
        issues.push(`artifact ${artifact.id} approved revision is invalid`);
      }
    }
  }

  for (const [key, revision] of Object.entries(graph.revisions)) {
    try {
      parseRevisionManifest(revision);
    } catch {
      issues.push(`revision ${key} is invalid`);
      continue;
    }
    if (key !== revision.id) issues.push(`revision key ${key} does not match id ${revision.id}`);
    const artifact = graph.artifacts[revision.artifactId];
    if (!artifact) {
      issues.push(`revision ${revision.id} references a missing artifact`);
      continue;
    }
    const parents = revision.parentIds.flatMap((parentId) => {
      const parent = graph.revisions[parentId];
      if (!parent) {
        issues.push(`revision ${revision.id} parent ${parentId} is missing`);
        return [];
      }
      return [parent];
    });
    if (parents.length === revision.parentIds.length) {
      for (const issue of revisionParentKindIssues(revision, parents)) {
        issues.push(`revision ${revision.id}: ${issue}`);
      }
    }
  }
  return Object.freeze(issues);
}

function assertProjectGraphV3(graph: ProjectGraphV3): ProjectGraphV3 {
  const issues = validateProjectGraphV3(graph);
  if (issues.length > 0) throw new ProjectGraphInvariantError(issues);
  return graph;
}

export function addArtifactWithInitialRevision(
  graph: ProjectGraphV3,
  artifactInput: Artifact,
  revisionInput: RevisionManifest,
): ProjectGraphV3 {
  const artifact = parseArtifact(artifactInput);
  const revision = parseRevisionManifest(revisionInput);
  if (graph.artifacts[artifact.id]) {
    throw new ProjectGraphInvariantError([`artifact ${artifact.id} already exists`]);
  }
  if (graph.revisions[revision.id]) {
    throw new ProjectGraphInvariantError([`revision ${revision.id} already exists`]);
  }
  if (
    artifact.projectId !== graph.projectId
    || artifact.scope.projectId !== graph.projectId
    || revision.artifactId !== artifact.id
    || artifact.headRevisionId !== revision.id
    || revision.parentIds.length !== 0
  ) {
    throw new ProjectGraphInvariantError(["initial artifact and revision do not form a valid graph root"]);
  }
  const next: ProjectGraphV3 = Object.freeze({
    ...graph,
    artifacts: frozenRecord([...Object.entries(graph.artifacts), [artifact.id, Object.freeze({ ...artifact })]]),
    revisions: frozenRecord([...Object.entries(graph.revisions), [revision.id, Object.freeze({ ...revision })]]),
  });
  return assertProjectGraphV3(next);
}

export function appendRevision(
  graph: ProjectGraphV3,
  revisionInput: RevisionManifest,
): ProjectGraphV3 {
  const revision = parseRevisionManifest(revisionInput);
  const existing = graph.revisions[revision.id];
  if (existing) {
    assertSameImmutableRevision(existing, revision);
    return graph;
  }

  const artifact = graph.artifacts[revision.artifactId];
  if (!artifact) {
    throw new ProjectGraphInvariantError([`revision ${revision.id} references a missing artifact`]);
  }
  const parents: RevisionManifest[] = [];
  for (const parentId of revision.parentIds) {
    const parent = graph.revisions[parentId];
    if (!parent) {
      throw new ProjectGraphInvariantError([`revision ${revision.id} parent ${parentId} is missing`]);
    }
    parents.push(parent);
  }
  const parentIssues = revisionParentKindIssues(revision, parents);
  if (parentIssues.length > 0) throw new ProjectGraphInvariantError(parentIssues);

  const nextArtifact: Artifact = Object.freeze({
    ...artifact,
    ...(revision.kind === "release" ? {} : { headRevisionId: revision.id }),
    ...(revision.kind === "approved" ? { approvedRevisionId: revision.id } : {}),
    updatedAt: revision.createdAt,
  });
  const next: ProjectGraphV3 = Object.freeze({
    ...graph,
    artifacts: frozenRecord(Object.entries(graph.artifacts).map(([id, current]) =>
      id === artifact.id ? [id, nextArtifact] as const : [id, current] as const)),
    revisions: frozenRecord([...Object.entries(graph.revisions), [revision.id, Object.freeze({ ...revision })]]),
  });
  return assertProjectGraphV3(next);
}
