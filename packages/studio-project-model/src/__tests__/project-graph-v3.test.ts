import { describe, expect, it } from "vitest";

import { brandSha256, brandStudioId } from "../graph/ids";
import { buildLegacyProjectStateShadow } from "../graph/legacy-project-state-adapter";
import {
  ProjectGraphInvariantError,
  appendRevision,
  validateProjectGraphV3,
} from "../graph/project-graph";
import { ImmutableRevisionError } from "../graph/revision";
import { scopeRefContains, scopeRefKey } from "../graph/scope-ref";
import { createProjectState } from "../ir/project-state";
import { createEmptyScene } from "../ir/scene";

import type {
  ArtifactId,
  DeviceId,
  EpisodeId,
  PanelId,
  ProjectId,
  RevisionId,
  UserId,
  WorkspaceId,
} from "../graph/ids";
import type { RevisionKind, RevisionManifest } from "../graph/revision";

const projectId = brandStudioId<ProjectId>("project-v3");
const artifactId = brandStudioId<ArtifactId>("artifact-canvas");
const workspaceId = brandStudioId<WorkspaceId>("workspace-main");
const actorId = brandStudioId<UserId>("artist-1");
const deviceId = brandStudioId<DeviceId>("device-mac");
const initialRevisionId = brandStudioId<RevisionId>("revision-initial");
const createdAt = "2026-09-17T00:00:00.000Z";

function revision(
  id: string,
  kind: RevisionKind,
  parentIds: readonly RevisionId[],
  minute: number,
): RevisionManifest {
  return {
    id: brandStudioId<RevisionId>(id),
    artifactId,
    kind,
    parentIds: [...parentIds],
    rootGraphHash: brandSha256(minute.toString(16).padStart(64, "0")),
    blobRefs: [],
    createdBy: actorId,
    deviceId,
    createdAt: `2026-09-17T00:${minute.toString().padStart(2, "0")}:00.000Z`,
  };
}

function legacyShadow() {
  const state = createProjectState(createEmptyScene(1_600, 120_000));
  const shadow = buildLegacyProjectStateShadow({
    state,
    projectId,
    artifactId,
    revisionId: initialRevisionId,
    workspaceId,
    actorId,
    deviceId,
    rootGraphHash: brandSha256("a".repeat(64)),
    title: "1화 원고",
    createdAt,
  });
  return { state, shadow };
}

describe("ProjectGraphV3", () => {
  it("wraps legacy ProjectStateIR without changing its digest or authority", () => {
    const { state, shadow } = legacyShadow();
    expect(shadow.state).toBe(state);
    expect(shadow.graph.authorityVersion).toBe("legacy-v2");
    expect(shadow.graph.legacyProjection).toEqual({
      snapshotVersion: 2,
      sceneDigest: shadow.sceneDigest,
      projectDigest: shadow.projectDigest,
    });
    expect(shadow.graph.artifacts[artifactId]?.headRevisionId).toBe(initialRevisionId);
    expect(validateProjectGraphV3(shadow.graph)).toEqual([]);
  });

  it("keeps submission, review, approval and release as immutable revisions", () => {
    let { graph } = legacyShadow().shadow;
    const submission = revision("revision-submission", "submission", [initialRevisionId], 1);
    const review = revision("revision-review", "review-snapshot", [submission.id], 2);
    const approved = revision("revision-approved", "approved", [review.id], 3);
    const release = revision("revision-release", "release", [approved.id], 4);

    graph = appendRevision(graph, submission);
    graph = appendRevision(graph, review);
    graph = appendRevision(graph, approved);
    graph = appendRevision(graph, release);

    expect(graph.artifacts[artifactId]?.headRevisionId).toBe(approved.id);
    expect(graph.artifacts[artifactId]?.approvedRevisionId).toBe(approved.id);
    expect(graph.revisions[release.id]?.parentIds).toEqual([approved.id]);
    expect(validateProjectGraphV3(graph)).toEqual([]);

    expect(() => appendRevision(graph, { ...release, message: "mutated" }))
      .toThrow(ImmutableRevisionError);
  });

  it("rejects a release that is not derived from an approved revision", () => {
    let { graph } = legacyShadow().shadow;
    const submission = revision("revision-submission-2", "submission", [initialRevisionId], 5);
    graph = appendRevision(graph, submission);
    const invalidRelease = revision("revision-release-invalid", "release", [submission.id], 6);
    expect(() => appendRevision(graph, invalidRelease)).toThrow(ProjectGraphInvariantError);
  });
});

describe("ScopeRef", () => {
  it("provides stable keys and containment for project, episode and panel scopes", () => {
    const projectScope = { projectId };
    const panelScope = {
      projectId,
      episodeId: brandStudioId<EpisodeId>("episode-12"),
      panelId: brandStudioId<PanelId>("panel-37"),
    };
    expect(scopeRefContains(projectScope, panelScope)).toBe(true);
    expect(scopeRefContains(panelScope, projectScope)).toBe(false);
    expect(scopeRefKey(panelScope)).toBe(
      "projectId:project-v3/episodeId:episode-12/panelId:panel-37",
    );
  });
});
