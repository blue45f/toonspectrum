import { z } from "zod";

import { isoTimestampSchema, sha256Schema, studioEntityIdSchema } from "./ids";

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
export type CapabilityCheck = z.infer<typeof capabilityCheckSchema>;

export const capabilityEvidenceSchema = z
  .object({
    kind: z.enum(["source", "test", "benchmark", "artifact", "audit", "expert-report"]),
    path: z.string().trim().min(1).max(1_024),
    sha256: sha256Schema.optional(),
    verifiedAt: isoTimestampSchema.optional(),
  })
  .strict();
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;

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
  .strict()
  .superRefine((entry, context) => {
    if (new Set(entry.requiredChecks).size !== entry.requiredChecks.length) {
      context.addIssue({ code: "custom", path: ["requiredChecks"], message: "duplicate required check" });
    }
    if (new Set(entry.passedChecks).size !== entry.passedChecks.length) {
      context.addIssue({ code: "custom", path: ["passedChecks"], message: "duplicate passed check" });
    }
  });
export type CapabilityLedgerEntry = z.infer<typeof capabilityLedgerEntrySchema>;

export interface CapabilityGateResult {
  readonly allowed: boolean;
  readonly missingChecks: readonly CapabilityCheck[];
  readonly reasons: readonly string[];
}

const CLAIMABLE_STATUSES = new Set<CapabilityStatus>(["equivalent", "differentiated"]);

export function evaluateCapabilityClaim(value: unknown): CapabilityGateResult {
  const entry = capabilityLedgerEntrySchema.parse(value);
  const passed = new Set(entry.passedChecks);
  const missingChecks = entry.requiredChecks.filter((check) => !passed.has(check));
  const reasons: string[] = [];
  if (!CLAIMABLE_STATUSES.has(entry.status)) {
    reasons.push(`status ${entry.status} is not claimable`);
  }
  if (missingChecks.length > 0) {
    reasons.push(`missing checks: ${missingChecks.join(", ")}`);
  }
  if (entry.evidence.length === 0) reasons.push("no evidence artifact");
  if (entry.remainingGaps.length > 0) reasons.push("remaining gaps are not empty");
  return { allowed: reasons.length === 0, missingChecks, reasons };
}

export function assertReplacementClaimAllowed(entries: readonly unknown[]): void {
  const blocked = entries.flatMap((entry) => {
    const parsed = capabilityLedgerEntrySchema.parse(entry);
    const result = evaluateCapabilityClaim(parsed);
    return result.allowed ? [] : [`${parsed.id}: ${result.reasons.join("; ")}`];
  });
  if (blocked.length > 0) {
    throw new Error(`replacement claim blocked: ${blocked.join(" | ")}`);
  }
}
