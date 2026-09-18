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

export type ProjectAuthorityVersion = "legacy-v2" | "project-graph-v3";

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
    authorityVersion: z.enum(["legacy-v2", "project-graph-v3"]),
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
