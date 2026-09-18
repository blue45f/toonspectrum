import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDIO_COMPETITOR_CAPABILITY_EVALUATION,
  STUDIO_COMPETITOR_CAPABILITY_RECORDS,
} from "../apps/web/src/domains/creator/studio-platform/studio-competitor-capability-evidence";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const writeAudit = process.argv.includes("--write");

async function exists(reference: string): Promise<boolean> {
  try {
    await access(path.resolve(repositoryRoot, reference));
    return true;
  } catch {
    return false;
  }
}

const missingVerifiedReferences: Array<{
  readonly capabilityId: string;
  readonly dimension: string;
  readonly reference: string;
}> = [];

for (const record of STUDIO_COMPETITOR_CAPABILITY_RECORDS) {
  for (const evidence of record.evidence) {
    if (evidence.status !== "verified") continue;
    if (!await exists(evidence.reference)) {
      missingVerifiedReferences.push({
        capabilityId: record.id,
        dimension: evidence.dimension,
        reference: evidence.reference,
      });
    }
  }
}

const evaluationById = new Map(
  STUDIO_COMPETITOR_CAPABILITY_EVALUATION.capabilities.map((item) => [item.id, item]),
);

const audit = {
  schemaVersion: 1,
  targetCapabilityCount: 57,
  summary: {
    verified: STUDIO_COMPETITOR_CAPABILITY_EVALUATION.verifiedCount,
    externalValidationPending:
      STUDIO_COMPETITOR_CAPABILITY_EVALUATION.externalValidationPendingCount,
    incomplete: STUDIO_COMPETITOR_CAPABILITY_EVALUATION.incompleteCount,
    repositoryImplementationComplete:
      STUDIO_COMPETITOR_CAPABILITY_EVALUATION.repositoryImplementationComplete,
    replacementClaimAllowed:
      STUDIO_COMPETITOR_CAPABILITY_EVALUATION.replacementClaimAllowed,
  },
  capabilities: STUDIO_COMPETITOR_CAPABILITY_RECORDS.map((record) => ({
    id: record.id,
    sequence: record.sequence,
    title: record.title,
    state: evaluationById.get(record.id)?.state ?? "incomplete",
    externalValidationRequired: record.externalValidationRequired,
    evidence: record.evidence.map((item) => ({
      dimension: item.dimension,
      status: item.status,
      reference: item.reference,
      ...(item.note ? { note: item.note } : {}),
    })),
  })),
} as const;

if (STUDIO_COMPETITOR_CAPABILITY_RECORDS.length !== 57) {
  throw new Error(
    `Expected 57 competitor replacement capabilities, found ${STUDIO_COMPETITOR_CAPABILITY_RECORDS.length}.`,
  );
}

if (STUDIO_COMPETITOR_CAPABILITY_EVALUATION.incompleteCount > 0) {
  const incomplete = STUDIO_COMPETITOR_CAPABILITY_EVALUATION.capabilities
    .filter((item) => item.state === "incomplete")
    .map((item) => `${item.id} (${item.missingDimensions.join(", ")})`);
  throw new Error(`Repository capability gaps remain: ${incomplete.join("; ")}`);
}

if (missingVerifiedReferences.length > 0) {
  throw new Error(
    `Verified capability references are missing:\n${missingVerifiedReferences
      .map((item) => `- ${item.capabilityId}/${item.dimension}: ${item.reference}`)
      .join("\n")}`,
  );
}

if (writeAudit) {
  const outputPath = path.join(
    repositoryRoot,
    "docs/evidence/studio-competitor-capability-audit.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}`);
}

console.log(JSON.stringify(audit.summary));

if (!audit.summary.replacementClaimAllowed) {
  console.log(
    "Repository implementation evidence is complete, but replacement marketing claims remain blocked until pending external validations are attached.",
  );
}
