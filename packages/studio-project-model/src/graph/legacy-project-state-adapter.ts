import { sceneDigest } from "../ir/digest";
import { projectDigest } from "../ir/project-state";

import { addArtifactWithInitialRevision, createProjectGraphV3 } from "./project-graph";

import type { Artifact } from "./artifact";
import type {
  ArtifactId,
  DeviceId,
  ProjectId,
  RevisionId,
  Sha256,
  UserId,
  WorkspaceId,
} from "./ids";
import type { ProjectGraphV3 } from "./project-graph";
import type { RevisionManifest } from "./revision";
import type { ProjectStateIR } from "../ir/project-state";

export interface LegacyProjectStateShadowInput {
  readonly state: ProjectStateIR;
  readonly projectId: ProjectId;
  readonly artifactId: ArtifactId;
  readonly revisionId: RevisionId;
  readonly workspaceId: WorkspaceId;
  readonly actorId: UserId;
  readonly deviceId: DeviceId;
  readonly rootGraphHash: Sha256;
  readonly title: string;
  readonly createdAt: string;
}

export interface LegacyProjectStateShadow {
  /** The exact legacy object remains authoritative until the project flag advances. */
  readonly state: ProjectStateIR;
  readonly graph: ProjectGraphV3;
  readonly sceneDigest: string;
  readonly projectDigest: string;
}

export function buildLegacyProjectStateShadow(
  input: LegacyProjectStateShadowInput,
): LegacyProjectStateShadow {
  const legacySceneDigest = sceneDigest(input.state.scene);
  const legacyProjectDigest = projectDigest(input.state);
  const revision: RevisionManifest = {
    id: input.revisionId,
    artifactId: input.artifactId,
    kind: "checkpoint",
    parentIds: [],
    rootGraphHash: input.rootGraphHash,
    blobRefs: [],
    createdBy: input.actorId,
    deviceId: input.deviceId,
    createdAt: input.createdAt,
    message: "Legacy ProjectStateIR shadow checkpoint",
  };
  const artifact: Artifact = {
    id: input.artifactId,
    projectId: input.projectId,
    scope: { projectId: input.projectId },
    kind: "canvas-2d",
    title: input.title,
    headRevisionId: input.revisionId,
    ownerWorkspaceId: input.workspaceId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  const graph = addArtifactWithInitialRevision(
    {
      ...createProjectGraphV3(input.projectId, "legacy-v2"),
      legacyProjection: {
        snapshotVersion: 2,
        sceneDigest: legacySceneDigest,
        projectDigest: legacyProjectDigest,
      },
    },
    artifact,
    revision,
  );
  return {
    state: input.state,
    graph,
    sceneDigest: legacySceneDigest,
    projectDigest: legacyProjectDigest,
  };
}
