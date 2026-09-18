import {
  isoTimestampSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "@toonspectrum/studio-project-model";
import { z } from "zod";


export const sourceCreativeFormatSchema = z.enum([
  "psd",
  "psb",
  "png",
  "jpeg",
  "webp",
  "tiff",
  "clip",
  "cmc",
  "ora",
  "svg",
  "gltf",
  "glb",
  "vrm",
  "obj",
  "fbx",
  "usd",
  "usdz",
  "dae",
  "stl",
  "hdr",
  "exr",
  "unknown",
]);
export type SourceCreativeFormat = z.infer<typeof sourceCreativeFormatSchema>;

export const compatibilityOutcomeSchema = z.enum([
  "preserved",
  "converted",
  "rasterized",
  "excluded",
  "unsupported",
]);
export type CompatibilityOutcome = z.infer<typeof compatibilityOutcomeSchema>;

export const compatibilityImpactSchema = z.enum([
  "none",
  "minor",
  "major",
  "blocking",
]);
export type CompatibilityImpact = z.infer<typeof compatibilityImpactSchema>;

export const compatibilityItemSchema = z
  .object({
    id: studioEntityIdSchema,
    path: z.string().trim().min(1).max(2_048),
    feature: z.string().trim().min(1).max(240),
    outcome: compatibilityOutcomeSchema,
    impact: compatibilityImpactSchema,
    message: z.string().trim().min(1).max(8_192),
    fallback: z.string().trim().min(1).max(8_192).optional(),
  })
  .strict();
export type CompatibilityItem = z.infer<typeof compatibilityItemSchema>;

export const compatibilitySummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    preserved: z.number().int().nonnegative(),
    converted: z.number().int().nonnegative(),
    rasterized: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
    blocking: z.number().int().nonnegative(),
  })
  .strict();
export type CompatibilitySummary = z.infer<typeof compatibilitySummarySchema>;

export const compatibilitySourceBlobSchema = z
  .object({
    id: studioEntityIdSchema,
    sha256: sha256Schema,
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mediaType: z.string().trim().min(1).max(160),
    role: z.literal("source"),
  })
  .strict();

export const compatibilitySourceSchema = z
  .object({
    sourceFileName: z.string().trim().min(1).max(1_024),
    sourceFormat: sourceCreativeFormatSchema,
    sourceHash: sha256Schema,
    sourceSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sourceBlob: compatibilitySourceBlobSchema,
    immutable: z.literal(true),
    importedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((source, context) => {
    if (source.sourceHash !== source.sourceBlob.sha256) {
      context.addIssue({
        code: "custom",
        path: ["sourceBlob", "sha256"],
        message: "source blob hash must match source hash",
      });
    }
    if (source.sourceSize !== source.sourceBlob.size) {
      context.addIssue({
        code: "custom",
        path: ["sourceBlob", "size"],
        message: "source blob size must match source size",
      });
    }
  });

export const compatibilityGradeSchema = z.enum(["A", "B", "C", "D"]);
export type CompatibilityGrade = z.infer<typeof compatibilityGradeSchema>;

export const compatibilityReportSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema.optional(),
    source: compatibilitySourceSchema,
    grade: compatibilityGradeSchema,
    summary: compatibilitySummarySchema,
    items: z.array(compatibilityItemSchema).max(1_000_000),
    requiresApproval: z.boolean(),
    approvedBy: studioEntityIdSchema.optional(),
    approvedAt: isoTimestampSchema.optional(),
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((report, context) => {
    if ((report.approvedBy === undefined) !== (report.approvedAt === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "approvedBy and approvedAt must be supplied together",
      });
    }
    if (report.approvedBy !== undefined && !report.requiresApproval) {
      context.addIssue({
        code: "custom",
        path: ["requiresApproval"],
        message: "approval metadata is only valid for reports requiring approval",
      });
    }
  });
export type CompatibilityReport = z.infer<typeof compatibilityReportSchema>;

export const createCompatibilityReportInputSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema.optional(),
    source: compatibilitySourceSchema,
    items: z.array(compatibilityItemSchema).max(1_000_000),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type CreateCompatibilityReportInput = z.infer<
  typeof createCompatibilityReportInputSchema
>;

function summarize(items: readonly CompatibilityItem[]): CompatibilitySummary {
  const summary: CompatibilitySummary = {
    total: items.length,
    preserved: 0,
    converted: 0,
    rasterized: 0,
    excluded: 0,
    unsupported: 0,
    blocking: 0,
  };
  for (const item of items) {
    summary[item.outcome] += 1;
    if (item.impact === "blocking") summary.blocking += 1;
  }
  return compatibilitySummarySchema.parse(summary);
}

function gradeCompatibility(
  items: readonly CompatibilityItem[],
): CompatibilityGrade {
  if (
    items.some(
      (item) =>
        item.impact === "blocking"
        || item.outcome === "unsupported"
        || item.outcome === "excluded",
    )
  ) {
    return "D";
  }
  if (
    items.some(
      (item) => item.impact === "major" || item.outcome === "rasterized",
    )
  ) {
    return "C";
  }
  if (
    items.some(
      (item) => item.impact === "minor" || item.outcome === "converted",
    )
  ) {
    return "B";
  }
  return "A";
}

export function createCompatibilityReport(
  rawInput: CreateCompatibilityReportInput,
): CompatibilityReport {
  const input = createCompatibilityReportInputSchema.parse(rawInput);
  const summary = summarize(input.items);
  const grade = gradeCompatibility(input.items);
  return compatibilityReportSchema.parse({
    ...input,
    grade,
    summary,
    requiresApproval: grade !== "A",
  });
}
