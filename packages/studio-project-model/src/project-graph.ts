import { z } from "zod";

const STUDIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;

export const studioEntityIdSchema = z
  .string()
  .regex(STUDIO_ID_PATTERN, "invalid Studio entity id");
export type StudioEntityId = z.infer<typeof studioEntityIdSchema>;

export const sha256Schema = z
  .string()
  .regex(SHA_256_PATTERN, "expected lowercase SHA-256 hex");
export type Sha256 = z.infer<typeof sha256Schema>;

export const isoTimestampSchema = z.string().superRefine((value, context) => {
  if (!Number.isFinite(Date.parse(value))) {
    context.addIssue({ code: "custom", message: "invalid ISO timestamp" });
    return;
  }
  try {
    if (new Date(value).toISOString() !== value) {
      context.addIssue({ code: "custom", message: "timestamp must be canonical UTC ISO-8601" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "invalid ISO timestamp" });
  }
});
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

export const projectAuthorityVersionSchema = z.enum([
  "legacy-v2",
  "project-graph-v3",
]);
export type ProjectAuthorityVersion = z.infer<typeof projectAuthorityVersionSchema>;

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

export const scopeKindSchema = z.enum([
  "project",
  "season",
  "episode",
  "scene",
  "scroll-segment",
  "cut",
  "layer-group",
  "asset",
  "deliverable",
]);
export type ScopeKind = z.infer<typeof scopeKindSchema>;

const SCOPE_ORDER: Readonly<Record<ScopeKind, number>> = Object.freeze({
  project: 0,
  season: 1,
  episode: 2,
  scene: 3,
  "scroll-segment": 4,
  cut: 5,
  "layer-group": 6,
  asset: 6,
  deliverable: 6,
});

export const scopeAncestorRefSchema = z
  .object({
    kind: scopeKindSchema.exclude(["deliverable"]),
    id: studioEntityIdSchema,
  })
  .strict();
export type ScopeAncestorRef = z.infer<typeof scopeAncestorRefSchema>;

export const scopeRefSchema = z
  .object({
    projectId: studioEntityIdSchema,
    kind: scopeKindSchema,
    id: studioEntityIdSchema,
    ancestors: z.array(scopeAncestorRefSchema).max(8),
  })
  .strict()
  .superRefine((scope, context) => {
    const seen = new Set<string>();
    let previousOrder = -1;
    for (const [index, ancestor] of scope.ancestors.entries()) {
      const key = `${ancestor.kind}:${ancestor.id}`;
      const order = SCOPE_ORDER[ancestor.kind];
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["ancestors", index],
          message: "scope ancestors must be unique",
        });
      }
      if (order <= previousOrder || order >= SCOPE_ORDER[scope.kind]) {
        context.addIssue({
          code: "custom",
          path: ["ancestors", index],
          message: "scope ancestors must follow canonical hierarchy order",
        });
      }
      seen.add(key);
      previousOrder = order;
    }
    const projectAncestor = scope.kind === "project"
      ? { kind: "project" as const, id: scope.id }
      : scope.ancestors.find((ancestor) => ancestor.kind === "project");
    if (!projectAncestor || projectAncestor.id !== scope.projectId) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "scope projectId must match its project identity",
      });
    }
  });
export type ScopeRef = z.infer<typeof scopeRefSchema>;

export function studioProjectScope(projectId: string): ScopeRef {
  const id = studioEntityIdSchema.parse(projectId);
  return Object.freeze({ projectId: id, kind: "project", id, ancestors: [] });
}


export function scopeContains(parent: ScopeRef, child: ScopeRef): boolean {
  if (parent.projectId !== child.projectId) return false;
  if (parent.kind === child.kind && parent.id === child.id) return true;
  return child.ancestors.some(
    (ancestor) => ancestor.kind === parent.kind && ancestor.id === parent.id,
  );
}

export const reviewTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("semantic-entity"), semanticId: studioEntityIdSchema }).strict(),
  z.object({
    type: z.literal("element"),
    semanticPanelId: studioEntityIdSchema.nullable(),
    pageId: studioEntityIdSchema,
    elementId: studioEntityIdSchema,
  }).strict(),
  z.object({
    type: z.literal("point"),
    pageId: studioEntityIdSchema,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).strict(),
  z.object({
    type: z.literal("region"),
    pageId: studioEntityIdSchema,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }).strict().superRefine((region, context) => {
    if (region.x + region.width > 1 || region.y + region.height > 1) {
      context.addIssue({
        code: "custom",
        message: "review region must stay inside normalized page bounds",
      });
    }
  }),
  z.object({
    type: z.literal("script-range"),
    blockId: studioEntityIdSchema,
    from: z.number().int().nonnegative(),
    to: z.number().int().positive(),
  }).strict().refine((range) => range.to > range.from, {
    message: "script range must be non-empty",
  }),
  z.object({
    type: z.literal("time-range"),
    motionDocumentId: studioEntityIdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  }).strict().refine((range) => range.endMs > range.startMs, {
    message: "time range must be non-empty",
  }),
  z.object({
    type: z.literal("publish-issue"),
    validationIssueId: studioEntityIdSchema,
  }).strict(),
]);
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;

export const reviewAnchorSchema = z
  .object({
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    scope: scopeRefSchema,
    target: reviewTargetSchema,
  })
  .strict();
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
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

export const capabilityEvidenceSchema = z
  .object({
    kind: z.enum([
      "test",
      "browser",
      "device",
      "benchmark",
      "roundtrip",
      "expert-review",
      "document",
    ]),
    reference: z.string().trim().min(1).max(2_048),
    summary: z.string().trim().min(1).max(4_096),
    recordedAt: isoTimestampSchema,
  })
  .strict();
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;

export const capabilityLedgerEntrySchema = z
  .object({
    id: studioEntityIdSchema,
    status: capabilityStatusSchema,
    domainOwner: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(240),
    productArea: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(8_192),
    requiredChecks: z.array(z.string().trim().min(1).max(2_048)).max(256),
    passedChecks: z.array(z.string().trim().min(1).max(2_048)).max(256),
    evidence: z.array(capabilityEvidenceSchema).max(512),
    remainingGaps: z.array(z.string().trim().min(1).max(2_048)).max(256),
    supportedDevices: z
      .array(z.enum(["desktop", "tablet", "mobile", "web"]))
      .max(4),
    notes: z.string().trim().min(1).max(8_192).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const required = new Set(entry.requiredChecks);
    for (const [index, check] of entry.passedChecks.entries()) {
      if (!required.has(check)) {
        context.addIssue({
          code: "custom",
          path: ["passedChecks", index],
          message: "passed checks must be declared in requiredChecks",
        });
      }
    }
  });
export type CapabilityLedgerEntry = z.infer<typeof capabilityLedgerEntrySchema>;
