import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function readReport(path) {
  if (!existsSync(path) || statSync(path).size === 0) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function buildCleanupSummary({ branchReport, actionsReport }) {
  const lines = [];
  if (!branchReport) {
    lines.push("### Merged branch cleanup", "", "No branch cleanup report was produced.");
  } else {
    lines.push(
      "### Merged branch cleanup",
      "",
      `- Deleted: ${branchReport.deleted.length}`,
      `- Closed duplicate PRs: ${branchReport.closedPullRequests.length}`,
      `- Preserved or skipped: ${branchReport.skipped.length}`,
    );
    if (branchReport.deleted.length > 0) {
      lines.push("", "#### Deleted branches");
      for (const item of branchReport.deleted) {
        lines.push(`- \`${item.branch}\` (${item.proof})`);
      }
    }
  }

  if (actionsReport) {
    lines.push(
      "",
      "### Actions queue cleanup",
      "",
      `- Active push/PR runs scanned: ${actionsReport.activeRunsScanned}`,
      `- Open PR heads protected: ${actionsReport.openPullHeads ?? 0}`,
      `- Superseded/closed-PR candidates: ${actionsReport.candidateRuns}`,
      `- Cancellation requests accepted: ${actionsReport.cancelled.length}`,
      `- Already terminal while cleaning: ${actionsReport.skipped.length}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const temp = process.env.RUNNER_TEMP;
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!temp || !summary) throw new Error("Cleanup summary environment is unavailable.");
  const branchReport = readReport(join(temp, "cleanup-report.json"));
  const actionsReport = readReport(join(temp, "actions-queue-cleanup.json"));
  appendFileSync(summary, buildCleanupSummary({ branchReport, actionsReport }));
}

if (process.argv[1]?.endsWith("publish-cleanup-summary.mjs")) main();
