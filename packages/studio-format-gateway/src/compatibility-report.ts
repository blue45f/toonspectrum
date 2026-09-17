import {
  blobRefSchema,
  isoTimestampSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "@toonspectrum/studio-project-model";
import { z } from "zod";


import type {
  ArtifactId,
  BlobRef,
  CompatibilityReportId,
  Sha256,
  UserId,
} from "@toonspectrum/studio-project-model";

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

export const compatibilityGradeSchema = z.enum(["A", "B", "C", "D"]);
export type CompatibilityGrade = z.infer<typeof compatibilityGradeSchema>;

export const compatibilityDispositionSchema = z.enum([
  "preserved",
  "converted",
  "approximated",
  "rasterized",
  "ignored",
  "opaque-preserved",
  "blocked",
]);
export type CompatibilityDisposition = z.infer<typeof compatibilityDispositionSchema>;

export const compatibilitySeveritySchema = z.enum([
  "info",
  "warning",
  "error",
  "blocker",
]);
export type CompatibilitySeverity = z.infer<typeof compatibilitySeveritySchema>;

export interface CompatibilityItem {
  readonly id: string;
  readonly path: string;
  readonly sourceFeature: string;
  readonly sourceObjectId?: string;
  readonly disposition: CompatibilityDisposition;
  readonly severity: CompatibilitySeverity;
  readonly targetFeature?: string;
  readonly message: string;
  readonly sourceBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export const compatibilityItemSchema = z
  .object({
    id: studioEntityIdSchema,
    path: z.string().trim().min(1).max(4_096),
    sourceFeature: z.string().trim().min(1).max(240),
    sourceObjectId: z.string().trim().min(1).max(1_024).optional(),
    disposition: compatibilityDispositionSchema,
    severity: compatibilitySeveritySchema,
    targetFeature: z.string().trim().min(1).max(240).optional(),
    message: z.string().trim().min(1).max(4_096),
    sourceBounds: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((item, context) => {
    const hasTarget = item.targetFeature !== undefined;
    if (
      (item.disposition === "preserved"
        || item.disposition === "converted"
        || item.disposition === "approximated"
        || item.disposition === "rasterized")
      && !hasTarget
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetFeature"],
        message: `${item.disposition} item requires targetFeature`,
      });
    }
    if (item.disposition === "blocked" && item.severity !== "blocker") {
      context.addIssue({
        code: "custom",
        path: ["severity"],
        message: "blocked item must be a blocker",
      });
    }
    if (item.disposition === "ignored" && item.severity === "info") {
      context.addIssue({
        code: "custom",
        path: ["severity"],
        message: "ignored content must be at least a warning",
      });
    }
  });

export interface CompatibilitySummary {
  readonly total: number;
  readonly preserved: number;
  readonly converted: number;
  readonly approximated: number;
  readonly rasterized: number;
  readonly ignored: number;
  readonly opaquePreserved: number;
  readonly blocked: number;
}

export const compatibilitySummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    preserved: z.number().int().nonnegative(),
    converted: z.number().int().nonnegative(),
    approximated: z.number().int().nonnegative(),
    rasterized: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
    opaquePreserved: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  })
  .strict();

export interface SourcePreservationManifest {
  readonly sourceFileName: string;
  readonly sourceFormat: SourceCreativeFormat;
  readonly sourceHash: Sha256;
  readonly sourceSize: number;
  readonly sourceBlob: BlobRef;
  readonly immutable: true;
  readonly importedAt: string;
}

export const sourcePreservationManifestSchema = z
  .object({
    sourceFileName: z.string().trim().min(1).max(1_024),
    sourceFormat: sourceCreativeFormatSchema,
    sourceHash: sha256Schema,
    sourceSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sourceBlob: blobRefSchema,
    immutable: z.literal(true),
    importedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.sourceBlob.role !== "source") {
      context.addIssue({
        code: "custom",
        path: ["sourceBlob", "role"],
        message: "preserved original must use source blob role",
      });
    }
    if (manifest.sourceBlob.sha256 !== manifest.sourceHash) {
      context.addIssue({
        code: "custom",
        path: ["sourceBlob", "sha256"],
        message: "source blob hash must match sourceHash",
      });
    }
    if (manifest.sourceBlob.size !== manifest.sourceSize) {
      context.addIssue({
        code: "custom",
        path: ["sourceBlob", "size"],
        message: "source blob size must match sourceSize",
      });
    }
  });

export interface CompatibilityReport {
  readonly id: CompatibilityReportId;
  readonly artifactId?: ArtifactId;
  readonly source: SourcePreservationManifest;
  readonly grade: CompatibilityGrade;
  readonly items: readonly CompatibilityItem[];
  readonly summary: CompatibilitySummary;
  readonly requiresApproval: boolean;
  readonly approvedBy?: UserId;
  readonly approvedAt?: string;
  readonly createdAt: string;
}

export const compatibilityReportSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema.optional(),
    source: sourcePreservationManifestSchema,
    grade: compatibilityGradeSchema,
    items: z.array(compatibilityItemSchema).max(1_000_000),
    summary: compatibilitySummarySchema,
    requiresApproval: z.boolean(),
    approvedBy: studioEntityIdSchema.optional(),
    approvedAt: isoTimestampSchema.optional(),
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((report, context) => {
    const expectedSummary = summarizeCompatibilityItems(report.items);
    if (JSON.stringify(expectedSummary) !== JSON.stringify(report.summary)) {
      context.addIssue({
        code: "custom",
        path: ["summary"],
        message: "compatibility summary does not match item dispositions",
      });
    }
    const safestGrade = deriveCompatibilityGrade(report.items);
    if (gradeRisk(report.grade) < gradeRisk(safestGrade)) {
      context.addIssue({
        code: "custom",
        path: ["grade"],
        message: `grade ${report.grade} overclaims item fidelity; expected ${safestGrade}`,
      });
    }
    const requiresApproval = report.items.some((item) =>
      item.disposition !== "preserved" || item.severity === "blocker",
    );
    if (report.requiresApproval !== requiresApproval) {
      context.addIssue({
        code: "custom",
        path: ["requiresApproval"],
        message: "approval requirement must reflect all non-preserved items",
      });
    }
    const approved = report.approvedBy !== undefined || report.approvedAt !== undefined;
    if (approved && (report.approvedBy === undefined || report.approvedAt === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "approval actor and timestamp must be stored together",
      });
    }
    if (!report.requiresApproval && approved) {
      context.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "lossless report does not require an approval record",
      });
    }
  });

const DISPOSITIONS: readonly CompatibilityDisposition[] = [
  "preserved",
  "converted",
  "approximated",
  "rasterized",
  "ignored",
  "opaque-preserved",
  "blocked",
];

export function summarizeCompatibilityItems(
  items: readonly CompatibilityItem[],
): CompatibilitySummary {
  const count = new Map<CompatibilityDisposition, number>(
    DISPOSITIONS.map((disposition) => [disposition, 0]),
  );
  for (const item of items) count.set(item.disposition, (count.get(item.disposition) ?? 0) + 1);
  return {
    total: items.length,
    preserved: count.get("preserved") ?? 0,
    converted: count.get("converted") ?? 0,
    approximated: count.get("approximated") ?? 0,
    rasterized: count.get("rasterized") ?? 0,
    ignored: count.get("ignored") ?? 0,
    opaquePreserved: count.get("opaque-preserved") ?? 0,
    blocked: count.get("blocked") ?? 0,
  };
}

export function deriveCompatibilityGrade(
  items: readonly CompatibilityItem[],
): CompatibilityGrade {
  if (items.some((item) => item.disposition === "blocked" || item.disposition === "opaque-preserved")) return "D";
  if (items.some((item) => item.disposition === "rasterized" || item.disposition === "ignored")) return "C";
  if (items.some((item) => item.disposition === "converted" || item.disposition === "approximated")) return "B";
  return "A";
}

function gradeRisk(grade: CompatibilityGrade): number {
  return { A: 0, B: 1, C: 2, D: 3 }[grade];
}

export function createCompatibilityReport(
  input: Omit<CompatibilityReport, "grade" | "summary" | "requiresApproval">,
): CompatibilityReport {
  const grade = deriveCompatibilityGrade(input.items);
  const summary = summarizeCompatibilityItems(input.items);
  const requiresApproval = input.items.some((item) =>
    item.disposition !== "preserved" || item.severity === "blocker",
  );
  return compatibilityReportSchema.parse({
    ...input,
    grade,
    summary,
    requiresApproval,
  }) as unknown as CompatibilityReport;
}
