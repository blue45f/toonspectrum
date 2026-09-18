import { z } from "zod";

import { isoTimestampSchema, studioEntityIdSchema } from "./ids";
import { scopeRefSchema } from "./scope-ref";

import type {
  ArtifactId,
  ProjectId,
  RevisionId,
  WorkspaceId,
} from "./ids";
import type { ScopeRef } from "./scope-ref";

export const artifactKindSchema = z.enum([
  "story",
  "storyboard",
  "canvas-2d",
  "scene-3d",
  "asset",
  "audio",
  "localization",
  "review-snapshot",
  "deliverable",
  "release",
]);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export interface Artifact {
  id: ArtifactId;
  projectId: ProjectId;
  scope: ScopeRef;
  kind: ArtifactKind;
  title: string;
  headRevisionId: RevisionId;
  approvedRevisionId?: RevisionId;
  ownerWorkspaceId: WorkspaceId;
  createdAt: string;
  updatedAt: string;
}

export const artifactSchema = z
  .object({
    id: studioEntityIdSchema,
    projectId: studioEntityIdSchema,
    scope: scopeRefSchema,
    kind: artifactKindSchema,
    title: z.string().trim().min(1).max(240),
    headRevisionId: studioEntityIdSchema,
    approvedRevisionId: studioEntityIdSchema.optional(),
    ownerWorkspaceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.scope.projectId !== artifact.projectId) {
      context.addIssue({
        code: "custom",
        path: ["scope", "projectId"],
        message: "artifact scope must point at artifact.projectId",
      });
    }
    if (Date.parse(artifact.updatedAt) < Date.parse(artifact.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt must not precede createdAt",
      });
    }
  });

export function parseArtifact(value: unknown): Artifact {
  return artifactSchema.parse(value) as Artifact;
}

export function moveArtifactHead(
  artifact: Artifact,
  headRevisionId: RevisionId,
  updatedAt: string,
): Artifact {
  const next = { ...artifact, headRevisionId, updatedAt };
  return parseArtifact(next);
}
