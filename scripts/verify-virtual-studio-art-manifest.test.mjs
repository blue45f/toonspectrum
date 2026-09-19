import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  validateVirtualStudioArtManifestContract,
  verifyArtManifestDirectory,
  verifyVirtualStudioArtManifest,
} from "./verify-virtual-studio-art-manifest.mjs";

function syntheticPng(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function createFixture(context, { dimensions = [10, 12], sha256 } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonstudio-art-manifest-"));
  (context.onTestFinished ?? context.after.bind(context))(() => rm(directory, { recursive: true, force: true }));
  const image = syntheticPng(10, 12);
  const manifest = {
    outputs: {
      "fixture.png": {
        sha256: sha256 ?? createHash("sha256").update(image).digest("hex"),
        bytes: image.length,
        dimensions,
      },
    },
  };
  await writeFile(path.join(directory, "fixture.png"), image);
  await writeFile(path.join(directory, "art-manifest.json"), JSON.stringify(manifest));
  return { directory, image, manifest };
}

test("verifies every current production-v2 output without claiming source revalidation", async () => {
  const result = await verifyVirtualStudioArtManifest();
  const assets = new Map(result.assets.map((asset) => [asset.name, asset]));

  assert.equal(result.assetCount, 36);
  assert(result.totalBytes > 0);
  assert.equal(result.outputIntegrityVerified, true);
  assert.equal(result.privateApprovedMasterSourceReverified, false);
  assert.equal(result.backgroundProvenanceMode, "carried-forward");
  assert.equal(result.backgroundOutputIntegrityVerifiedThisBuild, true);
  assert(result.minimumPairwiseVisibleDifferencePixels >= 1024);
  assert.equal(result.generatorSha256, result.manifest.generator.sha256);
  assert.equal(result.bakedOccupants, true);
  assert.equal(
    result.animationTechnique,
    "cutout-rig mesh deformation of existing art; not redrawn poses",
  );
  assert.deepEqual(assets.get("master-central-lossless.webp")?.dimensions, [869, 813]);
  assert.deepEqual(assets.get("player-pink-direction-down.png")?.dimensions, [384, 512]);
  assert.deepEqual(assets.get("player-pink-walk-down.webp")?.dimensions, [1536, 1024]);
  assert.deepEqual(assets.get("player-pink-state-draw.png")?.dimensions, [384, 512]);
});

test("accepts a matching standalone image manifest", async (context) => {
  const { directory } = await createFixture(context);
  const result = await verifyArtManifestDirectory({ artDirectory: directory });

  assert.equal(result.assetCount, 1);
  assert.equal(result.assets[0].format, "png");
  assert.deepEqual(result.assets[0].dimensions, [10, 12]);
});

test("rejects byte-length changes", async (context) => {
  const { directory, image } = await createFixture(context);
  await writeFile(path.join(directory, "fixture.png"), Buffer.concat([image, Buffer.from([0])]));

  await assert.rejects(
    verifyArtManifestDirectory({ artDirectory: directory }),
    /byte length mismatch/u,
  );
});

test("rejects same-length SHA-256 changes", async (context) => {
  const { directory, image } = await createFixture(context);
  const changedImage = Buffer.from(image);
  changedImage[changedImage.length - 1] ^= 0xff;
  await writeFile(path.join(directory, "fixture.png"), changedImage);

  await assert.rejects(
    verifyArtManifestDirectory({ artDirectory: directory }),
    /SHA-256 mismatch/u,
  );
});

test("rejects image dimensions that disagree with the manifest", async (context) => {
  const { directory } = await createFixture(context, { dimensions: [11, 12] });

  await assert.rejects(
    verifyArtManifestDirectory({ artDirectory: directory }),
    /dimension mismatch/u,
  );
});

test("rejects undeclared production directory entries", async (context) => {
  const { directory } = await createFixture(context);
  await writeFile(path.join(directory, "undeclared.png"), syntheticPng(1, 1));

  await assert.rejects(
    verifyArtManifestDirectory({ artDirectory: directory }),
    /undeclared entry undeclared\.png/u,
  );
});

test("keeps the baked-occupant and cutout-rig limitations in the manifest contract", async () => {
  const result = await verifyVirtualStudioArtManifest();
  const withoutBakedOccupantDisclosure = structuredClone(result.manifest);
  withoutBakedOccupantDisclosure.background.bakedOccupants = false;
  assert.throws(
    () => validateVirtualStudioArtManifestContract(withoutBakedOccupantDisclosure),
    /bakedOccupants limitation/u,
  );

  const pretendingToUseRedrawnPoses = structuredClone(result.manifest);
  pretendingToUseRedrawnPoses.animationTechnique = "redrawn poses";
  assert.throws(
    () => validateVirtualStudioArtManifestContract(pretendingToUseRedrawnPoses),
    /cutout-rig deformation, not redrawn poses/u,
  );
});

test("rejects misleading background provenance and weakened decoded gait gates", async () => {
  const result = await verifyVirtualStudioArtManifest();

  const misleadingSourceVerification = structuredClone(result.manifest);
  misleadingSourceVerification.background.sourcePixelsComparedThisBuild = true;
  assert.throws(
    () => validateVirtualStudioArtManifestContract(misleadingSourceVerification),
    /provenanceMode must be source-verified/u,
  );

  const unverifiedCarriedOutput = structuredClone(result.manifest);
  unverifiedCarriedOutput.background.outputIntegrityVerifiedThisBuild = false;
  assert.throws(
    () => validateVirtualStudioArtManifestContract(unverifiedCarriedOutput),
    /outputIntegrityVerifiedThisBuild must be true/u,
  );

  const duplicateLikeGait = structuredClone(result.manifest);
  duplicateLikeGait.skins.pink.directions.down.minimumPairwiseVisibleDifferencePixels = 1023;
  assert.throws(
    () => validateVirtualStudioArtManifestContract(duplicateLikeGait),
    /at least 1024 visible pixels/u,
  );

  const hiddenRgbArtifact = structuredClone(result.manifest);
  hiddenRgbArtifact.skins.pink.directions.down
    .decodedVisualIntegrity.transparentRgbPixels[0] = 1;
  assert.throws(
    () => validateVirtualStudioArtManifestContract(hiddenRgbArtifact),
    /transparentRgbPixels\[0\] must be zero/u,
  );
});
