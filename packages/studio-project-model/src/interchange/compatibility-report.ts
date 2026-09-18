export const STUDIO_COMPATIBILITY_OUTCOMES = [
  "preserved",
  "converted",
  "approximated",
  "rasterized",
  "ignored",
  "opaque-preserved",
  "blocked",
] as const;

export type StudioCompatibilityOutcome =
  (typeof STUDIO_COMPATIBILITY_OUTCOMES)[number];

export interface StudioCompatibilityItemV1 {
  readonly version: 1;
  readonly id: string;
  readonly category: string;
  readonly sourcePath: string;
  readonly outcome: StudioCompatibilityOutcome;
  readonly targetObjectType: string | null;
  readonly reason: string;
}

export interface StudioCompatibilityReportV1 {
  readonly version: 1;
  readonly id: string;
  readonly sourceFormat: string;
  readonly sourceDigest: string;
  readonly preservedOriginalBlobDigest: string;
  readonly parserId: string;
  readonly parserVersion: string;
  readonly createdAt: string;
  readonly items: readonly StudioCompatibilityItemV1[];
  readonly committed: boolean;
}

export interface StudioCompatibilitySummary {
  readonly total: number;
  readonly byOutcome: Readonly<Record<StudioCompatibilityOutcome, number>>;
  readonly lossyCount: number;
  readonly blockingCount: number;
  readonly canCommit: boolean;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const DIGEST = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const LOSSY_OUTCOMES = new Set<StudioCompatibilityOutcome>([
  "approximated",
  "rasterized",
  "ignored",
]);

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function summarizeStudioCompatibilityReport(
  report: StudioCompatibilityReportV1,
): StudioCompatibilitySummary {
  const byOutcome = Object.fromEntries(
    STUDIO_COMPATIBILITY_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<StudioCompatibilityOutcome, number>;
  for (const item of report.items) byOutcome[item.outcome] += 1;
  const blockingCount = byOutcome.blocked;
  const lossyCount = report.items.filter((item) => LOSSY_OUTCOMES.has(item.outcome)).length;
  return Object.freeze({
    total: report.items.length,
    byOutcome: Object.freeze(byOutcome),
    lossyCount,
    blockingCount,
    canCommit: blockingCount === 0,
  });
}

export function validateStudioCompatibilityReport(
  report: StudioCompatibilityReportV1,
): readonly string[] {
  const issues: string[] = [];
  if (
    report.version !== 1
    || !SAFE_ID.test(report.id)
    || !report.sourceFormat.trim()
    || !DIGEST.test(report.sourceDigest)
    || !DIGEST.test(report.preservedOriginalBlobDigest)
    || !SAFE_ID.test(report.parserId)
    || !report.parserVersion.trim()
    || !validTimestamp(report.createdAt)
  ) {
    issues.push("invalid-report-metadata");
  }
  if (report.sourceDigest !== report.preservedOriginalBlobDigest) {
    issues.push("original-source-not-preserved");
  }
  const itemIds = new Set<string>();
  for (const item of report.items) {
    if (
      item.version !== 1
      || !SAFE_ID.test(item.id)
      || !item.category.trim()
      || !item.sourcePath.trim()
      || !item.reason.trim()
    ) {
      issues.push(`invalid-item:${item.id}`);
    }
    if (itemIds.has(item.id)) issues.push(`duplicate-item:${item.id}`);
    itemIds.add(item.id);
  }
  const summary = summarizeStudioCompatibilityReport(report);
  if (report.committed && !summary.canCommit) issues.push("blocked-report-committed");
  return Object.freeze(issues);
}

export function assertStudioCompatibilityCommitAllowed(
  report: StudioCompatibilityReportV1,
): void {
  const issues = validateStudioCompatibilityReport(report);
  if (issues.length > 0) {
    throw new Error(`Compatibility report cannot be committed: ${issues.join(", ")}`);
  }
}
