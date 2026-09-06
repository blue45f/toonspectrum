import { createHash } from "node:crypto";

export const REVIEW_QUEUE_SCHEMA = "toonstudio.dontdraw-review-queue.v1";
const ACTIONS = Object.freeze({
  "ready-for-review": "visual-review",
  "conversion-required": "convert-source",
  "invalid-file": "repair-source",
  "unsupported-format": "choose-supported-export",
});

/** Exit codes describe the whole provided batch, not merely whether JSON was produced. */
export function intakeExitCode(report) {
  if (report.counts.invalid > 0) return 1;
  if (!report.counts.ready || report.counts.conversionRequired > 0 || report.counts.unsupported > 0) return 2;
  return 0;
}

/** A work list only: no approval, publication, conversion or server access grant is inferred. */
export function buildIntakeReviewQueue(report, manifest) {
  const tasks = report.records.flatMap((record) => {
    const action = Object.hasOwn(ACTIONS, record.status) ? ACTIONS[record.status] : undefined;
    if (!action) return [];
    const reviewId = createHash("sha256")
      .update(JSON.stringify([record.productId, record.sourcePath, record.role]))
      .digest("hex");
    return [{
      reviewId,
      productId: record.productId,
      sourceUrl: record.sourceUrl,
      sourcePath: record.sourcePath,
      action,
      status: "pending",
      ...(record.id ? { assetId: record.id } : {}),
      ...(record.sha256 ? { sha256: record.sha256 } : {}),
      ...(record.outputPath ? { stagedPath: record.outputPath } : {}),
      ...(record.reason ? { reason: record.reason } : {}),
    }];
  });
  return {
    schema: REVIEW_QUEUE_SCHEMA,
    manifestSha256: createHash("sha256").update(`${JSON.stringify(manifest, null, 2)}\n`).digest("hex"),
    scope: report.authorization.scope,
    authorizationVerification: report.authorization.verification,
    counts: { pending: tasks.length, approved: 0, rejected: 0, published: 0 },
    tasks,
  };
}
