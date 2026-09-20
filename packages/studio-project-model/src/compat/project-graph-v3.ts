import { z } from "zod";

import { studioReviewSourceReferenceSchema } from "../graph/review-source-map";

export const studioEntityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u, "invalid Studio entity id");

export const sha256Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/u, "expected a lowercase SHA-256 digest");

export const isoTimestampSchema = z.string().datetime({ offset: true });

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

export const revisionKindSchema = z.enum([
  "autosave",
  "checkpoint",
  "submission",
  "review-snapshot",
  "approved",
  "release",
]);
export type RevisionKind = z.infer<typeof revisionKindSchema>;

export const blobRoleSchema = z.enum([
  "graph",
  "tile",
  "vector",
  "source",
  "thumbnail",
  "preview",
  "export",
  "license",
  "provenance",
]);
export type BlobRole = z.infer<typeof blobRoleSchema>;

export interface ScopeRef {
  readonly projectId: string;
  readonly seasonId?: string;
  readonly episodeId?: string;
  readonly sequenceId?: string;
  readonly sceneId?: string;
  readonly panelId?: string;
  readonly elementId?: string;
}

export const scopeRefSchema = z
  .object({
    projectId: studioEntityIdSchema,
    seasonId: studioEntityIdSchema.optional(),
    episodeId: studioEntityIdSchema.optional(),
    sequenceId: studioEntityIdSchema.optional(),
    sceneId: studioEntityIdSchema.optional(),
    panelId: studioEntityIdSchema.optional(),
    elementId: studioEntityIdSchema.optional(),
  })
  .strict();

const SCOPE_KEYS = [
  "projectId",
  "seasonId",
  "episodeId",
  "sequenceId",
  "sceneId",
  "panelId",
  "elementId",
] as const;

export function scopeContains(container: ScopeRef, candidate: ScopeRef): boolean {
  return SCOPE_KEYS.every((key) => {
    const expected = container[key];
    return expected === undefined || expected === candidate[key];
  });
}

export const projectAuthorityVersionSchema = z.enum([
  "legacy-v2",
  "project-graph-v3",
]);
export type ProjectAuthorityVersion = z.infer<typeof projectAuthorityVersionSchema>;

export const reviewAnchorKindSchema = z.enum([
  "artifact",
  "page",
  "panel",
  "object",
  "coordinate",
  "region",
  "timecode",
]);
export type ReviewAnchorKind = z.infer<typeof reviewAnchorKindSchema>;

export const reviewAnchorSchema = z
  .object({
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    scope: scopeRefSchema,
    kind: reviewAnchorKindSchema,
    source: studioReviewSourceReferenceSchema.optional(),
    objectId: studioEntityIdSchema.optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
    timecodeMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((anchor, context) => {
    if (anchor.kind === "object" && anchor.objectId === undefined) {
      context.addIssue({ code: "custom", path: ["objectId"], message: "object anchor requires objectId" });
    }
    if (anchor.kind === "coordinate" && (anchor.x === undefined || anchor.y === undefined)) {
      context.addIssue({ code: "custom", path: ["x"], message: "coordinate anchor requires x and y" });
    }
    if (
      anchor.kind === "region"
      && (anchor.x === undefined
        || anchor.y === undefined
        || anchor.width === undefined
        || anchor.height === undefined)
    ) {
      context.addIssue({ code: "custom", path: ["width"], message: "region anchor requires x, y, width and height" });
    }
    if (anchor.kind === "timecode" && anchor.timecodeMs === undefined) {
      context.addIssue({ code: "custom", path: ["timecodeMs"], message: "timecode anchor requires timecodeMs" });
    }
  });
export type ReviewAnchor = z.infer<typeof reviewAnchorSchema>;

export const capabilityStatusSchema = z.enum([
  "unplanned",
  "contracted",
  "core-implemented",
  "product-wired",
  "durable",
  "collaboration-ready",
  "roundtrip-ready",
  "device-validated",
  "expert-validated",
  "equivalent",
  "differentiated",
]);

export const capabilityCheckSchema = z.enum([
  "permission",
  "undo-redo",
  "autosave",
  "crash-recovery",
  "reopen",
  "offline",
  "sync",
  "conflict",
  "lease",
  "export",
  "roundtrip",
  "performance-slo",
  "accessibility",
  "security",
  "unit",
  "integration",
  "golden",
  "e2e",
  "real-device",
  "expert-validation",
]);

export const capabilityEvidenceSchema = z
  .object({
    kind: z.enum(["source", "test", "benchmark", "artifact", "audit", "expert-report"]),
    path: z.string().trim().min(1).max(1_024),
    sha256: sha256Schema.optional(),
    verifiedAt: isoTimestampSchema.optional(),
  })
  .strict();

export const capabilityLedgerEntrySchema = z
  .object({
    id: studioEntityIdSchema,
    userProblem: z.string().trim().min(1).max(1_000),
    referenceProducts: z.array(z.string().trim().min(1).max(120)).min(1),
    surfaces: z.array(z.string().trim().min(1).max(240)).min(1),
    domainOwner: z.string().trim().min(1).max(160),
    documentObjects: z.array(z.string().trim().min(1).max(160)).min(1),
    requiredChecks: z.array(capabilityCheckSchema).min(1),
    passedChecks: z.array(capabilityCheckSchema),
    performanceSlos: z.array(z.string().trim().min(1).max(500)),
    evidence: z.array(capabilityEvidenceSchema),
    remainingGaps: z.array(z.string().trim().min(1).max(1_000)),
    status: capabilityStatusSchema,
  })
  .strict();
export type CapabilityLedgerEntry = z.infer<typeof capabilityLedgerEntrySchema>;
