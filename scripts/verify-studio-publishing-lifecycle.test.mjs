import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  createPublishingLifecycleReceipt,
  loadPublishingLifecycleManifest,
  validatePublishingLifecycleManifest,
  verifyPublishingLifecycleEvidence,
} from "./verify-studio-publishing-lifecycle.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test("committed publishing certification is complete and claim-safe", async () => {
  const loaded = await loadPublishingLifecycleManifest(ROOT);
  const validation = validatePublishingLifecycleManifest(loaded.manifest);
  const evidence = await verifyPublishingLifecycleEvidence(ROOT, validation);

  assert.deepEqual(validation.lanes, [
    "release-governance",
    "reader-policy",
    "platform-packages",
    "series-lifecycle",
    "publication-analytics",
  ]);
  assert.equal(validation.evidencePaths.length, 16);
  assert.ok(evidence.every((entry) => entry.bytes > 0));
  assert.ok(evidence.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256)));
  assert.equal(
    loaded.manifest.claimPolicy.directExternalPlatformPublishingClaimAllowed,
    false,
  );
});

test("receipt distinguishes automated package readiness from direct platform publishing", async () => {
  const loaded = await loadPublishingLifecycleManifest(ROOT);
  const validation = validatePublishingLifecycleManifest(loaded.manifest);
  const evidence = await verifyPublishingLifecycleEvidence(ROOT, validation);
  const runs = loaded.manifest.lanes.map((lane) => ({
    laneId: lane.id,
    status: "passed",
    durationMs: 10,
  }));
  const receipt = createPublishingLifecycleReceipt({
    manifest: loaded.manifest,
    manifestRaw: loaded.raw,
    evidence,
    runs,
    generatedAt: "2026-09-17T00:00:00.000Z",
  });

  assert.equal(receipt.automatedSelfPublishingReadiness, true);
  assert.equal(receipt.externalPlatformPackageReadiness, true);
  assert.equal(receipt.directExternalPlatformPublishingClaimAllowed, false);
  assert.equal(receipt.lanes.length, 5);
  assert.ok(receipt.lanes.every((lane) => lane.status === "passed"));
});

test("validator rejects direct third-party publishing overclaims", async () => {
  const loaded = await loadPublishingLifecycleManifest(ROOT);
  const unsafe = structuredClone(loaded.manifest);
  unsafe.claimPolicy.directExternalPlatformPublishingClaimAllowed = true;
  assert.throws(
    () => validatePublishingLifecycleManifest(unsafe),
    /claims must remain blocked/u,
  );
});
