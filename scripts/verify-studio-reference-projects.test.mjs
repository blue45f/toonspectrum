import assert from "node:assert/strict";
import { resolve } from "node:path";

import {
  createReferenceProjectReceipt,
  loadReferenceProjectManifest,
  validateReferenceProjectManifest,
  verifyReferenceProjectEvidence,
} from "./verify-studio-reference-projects.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");

test("the committed A-D certification manifest is complete and claim-safe", async () => {
  const loaded = await loadReferenceProjectManifest(REPOSITORY_ROOT);
  const validation = validateReferenceProjectManifest(loaded.manifest);
  const evidence = await verifyReferenceProjectEvidence(
    REPOSITORY_ROOT,
    validation,
  );

  assert.deepEqual(validation.projectIds, ["A", "B", "C", "D"]);
  assert.equal(validation.criterionCount, 18);
  assert.equal(validation.evidencePaths.length, 20);
  assert.ok(evidence.every((entry) => entry.bytes > 0));
  assert.ok(evidence.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256)));
  assert.equal(
    loaded.manifest.claimPolicy.professionalReplacementClaimAllowed,
    false,
  );
});
test("receipt separates automated readiness from professional validation", async () => {
  const loaded = await loadReferenceProjectManifest(REPOSITORY_ROOT);
  const validation = validateReferenceProjectManifest(loaded.manifest);
  const evidence = await verifyReferenceProjectEvidence(
    REPOSITORY_ROOT,
    validation,
  );
  const runs = loaded.manifest.projects.map((project) => ({
    projectId: project.id,
    status: "passed",
    durationMs: 25,
  }));
  const receipt = createReferenceProjectReceipt({
    manifest: loaded.manifest,
    manifestRaw: loaded.raw,
    evidence,
    runs,
    generatedAt: "2026-09-17T00:00:00.000Z",
  });

  assert.equal(receipt.automatedReadiness, true);
  assert.equal(receipt.professionalReplacementClaimAllowed, false);
  assert.equal(receipt.externalValidationRequired, true);
  assert.equal(receipt.projects.length, 4);
  assert.equal(receipt.projects[0].status, "passed");
  assert.equal(receipt.projects[0].evidence.length, 5);
});

test("validator rejects a manifest that overclaims professional replacement", async () => {
  const loaded = await loadReferenceProjectManifest(REPOSITORY_ROOT);
  const unsafeManifest = structuredClone(loaded.manifest);
  unsafeManifest.claimPolicy.professionalReplacementClaimAllowed = true;

  assert.throws(
    () => validateReferenceProjectManifest(unsafeManifest),
    /replacement claims must remain blocked/u,
  );
});
