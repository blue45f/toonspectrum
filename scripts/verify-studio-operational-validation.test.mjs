import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  createOperationalValidationReceipt,
  loadOperationalValidationManifest,
  validateOperationalValidationManifest,
  verifyOperationalEvidence,
} from "./verify-studio-operational-validation.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test("committed operational manifest is complete and claim-safe", async () => {
  const loaded = await loadOperationalValidationManifest(ROOT);
  const validation = validateOperationalValidationManifest(loaded.manifest);
  const evidence = await verifyOperationalEvidence(ROOT, validation);

  assert.deepEqual(validation.laneIds, [
    "performance-and-soak",
    "drawing-engine-integrity",
    "file-roundtrip-integrity",
    "fault-and-collaboration-recovery",
    "accessibility-and-security",
  ]);
  assert.equal(validation.testPaths.length, 30);
  assert.equal(validation.artifacts.length, 3);
  assert.equal(evidence.tests.length, 30);
  assert.equal(evidence.artifacts.length, 3);
  assert.ok(evidence.tests.every((entry) => entry.bytes > 0));
  assert.ok(evidence.tests.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256)));
  assert.ok(evidence.artifacts.every((entry) => entry.bytes > 0));
  assert.equal(
    loaded.manifest.claimPolicy.currentCommitEightHourSoakCertified,
    false,
  );
  assert.equal(
    loaded.manifest.claimPolicy.realHardwareBrowserCertificationAllowed,
    false,
  );
  assert.equal(
    loaded.manifest.claimPolicy.professionalReplacementClaimAllowed,
    false,
  );
});

test("historical soak evidence preserves both pass and negative-control boundaries", async () => {
  const loaded = await loadOperationalValidationManifest(ROOT);
  const validation = validateOperationalValidationManifest(loaded.manifest);
  const evidence = await verifyOperationalEvidence(ROOT, validation);
  const pass = evidence.artifacts.find((entry) => entry.kind === "soak-pass");
  const leak = evidence.artifacts.find(
    (entry) => entry.kind === "soak-leak-regression",
  );

  assert.equal(pass?.validation.classification, "historical-eight-hour-pass");
  assert.equal(pass?.validation.soakMinutes, 480);
  assert.equal(pass?.validation.totals.errors, 0);
  assert.ok(pass?.validation.rss.samples >= 100_000);
  assert.ok(pass?.validation.rss.maximumGrowthMiB < 192);

  assert.equal(leak?.validation.classification, "known-leak-negative-control");
  assert.equal(leak?.validation.soakMinutes, 480);
  assert.ok(leak?.validation.totals.errors > 0);
  assert.ok(leak?.validation.rss.maximumGrowthMiB > 1_000);
});

test("runtime fault evidence passes automation while retaining external gates", async () => {
  const loaded = await loadOperationalValidationManifest(ROOT);
  const validation = validateOperationalValidationManifest(loaded.manifest);
  const evidence = await verifyOperationalEvidence(ROOT, validation);
  const fault = evidence.artifacts.find(
    (entry) => entry.kind === "runtime-fault-matrix",
  );

  assert.equal(
    fault?.validation.classification,
    "automated-fault-matrix-pass-external-gates-pending",
  );
  assert.equal(fault?.validation.simulatedFaults, 7);
  assert.equal(fault?.validation.externalRequired, 6);
});

test("receipt never upgrades bounded automation into external certification", async () => {
  const loaded = await loadOperationalValidationManifest(ROOT);
  const validation = validateOperationalValidationManifest(loaded.manifest);
  const evidence = await verifyOperationalEvidence(ROOT, validation);
  const runs = loaded.manifest.lanes.map((lane) => ({
    laneId: lane.id,
    status: "passed",
    durationMs: 10,
  }));
  const receipt = createOperationalValidationReceipt({
    manifest: loaded.manifest,
    manifestRaw: loaded.raw,
    evidence,
    runs,
    generatedAt: "2026-09-17T00:00:00.000Z",
  });

  assert.equal(receipt.automatedOperationalContractReadiness, true);
  assert.equal(receipt.historicalEightHourSoakEvidence, true);
  assert.equal(receipt.currentCommitEightHourSoakCertified, false);
  assert.equal(receipt.realHardwareBrowserCertificationAllowed, false);
  assert.equal(receipt.professionalReplacementClaimAllowed, false);
  assert.equal(receipt.externalReleaseGates.length, 7);
  assert.ok(receipt.lanes.every((lane) => lane.status === "passed"));
});

test("validator rejects current-commit, hardware, or professional overclaims", async () => {
  const loaded = await loadOperationalValidationManifest(ROOT);
  for (const patch of [
    { currentCommitEightHourSoakCertified: true },
    { realHardwareBrowserCertificationAllowed: true },
    { professionalReplacementClaimAllowed: true },
  ]) {
    const unsafe = structuredClone(loaded.manifest);
    Object.assign(unsafe.claimPolicy, patch);
    assert.throws(
      () => validateOperationalValidationManifest(unsafe),
      /must remain (?:false|blocked)/u,
    );
  }
});
