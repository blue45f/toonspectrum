import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeDrawnArtPng, DRAWN_ART_DIRECTORY, verifyDrawnArtFramePixels, verifyVirtualStudioDrawnArt } from "./verify-virtual-studio-drawn-art.mjs";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  validateVirtualStudioArtManifestContract,
  validateVirtualStudioLivingWorldArtManifestContract,
  verifyVirtualStudioLivingWorldArtManifest,
  verifyVirtualStudioLivingWorldBindings,
  verifyLosslessWebpEncoding,
  VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY,
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

test("verifies all 24 drawn sheets and 96 decoded frames against runtime bindings", async () => {
  const result = await verifyVirtualStudioDrawnArt();
  assert.equal(result.assetCount, 24);
  assert.equal(result.frameCount, 96);
  assert.equal(result.registryBindingsVerified, true);
});

test("rejects decoded drawn pixel drift and a false alpha/foot baseline", async () => {
  const manifest = JSON.parse(await readFile(path.join(DRAWN_ART_DIRECTORY, "art-manifest.json"), "utf8"));
  const asset = manifest.assets["pink/walk-down"];
  const decoded = decodeDrawnArtPng(await readFile(path.join(DRAWN_ART_DIRECTORY, "player-pink-walk-down.png")));
  const wrongBounds = structuredClone(asset); wrongBounds.alphaBounds[0][3]--;
  assert.throws(() => verifyDrawnArtFramePixels(decoded, wrongBounds), /alpha bounds drifted/u);
  const wrongFoot = structuredClone(asset); wrongFoot.frames[0].originY = .2;
  assert.throws(() => verifyDrawnArtFramePixels(decoded, wrongFoot), /feet origin/u);
  decoded.rgba[0] ^= 1;
  assert.throws(() => verifyDrawnArtFramePixels(decoded, asset), /decoded frame pixels drifted/u);
});

test("rejects unsupported drawn PNG decoding instead of trusting recorded dimensions", async () => {
  const bytes = await readFile(path.join(DRAWN_ART_DIRECTORY, "player-pink-walk-down.png"));
  const unsupported = Buffer.from(bytes); unsupported[28] = 1;
  assert.throws(() => decodeDrawnArtPng(unsupported), /non-interlaced 8-bit RGBA/u);
  assert.throws(() => decodeDrawnArtPng(bytes.subarray(0, 40)), /truncated/u);
});

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
  assert.equal(result.drawnArt.assetCount, 24);
  assert.equal(result.drawnArt.decodedPixelsVerified, true);
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


test("also verifies the generated clean plate without upgrading its provenance to pixel-identical original art", async () => {
  const { livingWorld } = await verifyVirtualStudioArtManifest();
  assert.equal(livingWorld.assetCount, 1);
  assert.equal(livingWorld.outputIntegrityVerified, true);
  assert.equal(livingWorld.losslessWebpVerified, true);
  assert.equal(livingWorld.referenceOutputIntegrityVerified, true);
  assert.equal(livingWorld.runtimeBindingsVerified, true);
  assert.equal(livingWorld.generatedPngPixelsReverifiedThisRun, false);
  assert.equal(livingWorld.privateApprovedMasterSourceReverified, false);
  assert.equal(livingWorld.manifest.background.referencePixelIdentity, false);
  assert.deepEqual(livingWorld.assets[0].dimensions, [1296, 1213]);
});

async function createLivingFixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonstudio-living-art-"));
  (context.onTestFinished ?? context.after.bind(context))(() => rm(directory, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(path.join(VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY, "art-manifest.json"), "utf8"));
  const image = await readFile(path.join(VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY, "master-clean-plate.webp"));
  await writeFile(path.join(directory, "master-clean-plate.webp"), image);
  await writeFile(path.join(directory, "art-manifest.json"), JSON.stringify(manifest));
  return { directory, image, manifest };
}

test("rejects a clean-plate mutation, incorrect recorded dimensions and a changed authored reference", async (context) => {
  const { directory, image, manifest } = await createLivingFixture(context);
  const changed = Buffer.from(image);
  changed[changed.length - 1] ^= 0xff;
  await writeFile(path.join(directory, "master-clean-plate.webp"), changed);
  await assert.rejects(verifyVirtualStudioLivingWorldArtManifest({ artDirectory: directory }), /SHA-256 mismatch/u);
  await writeFile(path.join(directory, "master-clean-plate.webp"), image);
  manifest.outputs["master-clean-plate.webp"].dimensions = [1296, 1216];
  await writeFile(path.join(directory, "art-manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyVirtualStudioLivingWorldArtManifest({ artDirectory: directory }), /actual 1296x1213/u);
  manifest.outputs["master-clean-plate.webp"].dimensions = [1296, 1213];
  manifest.provenance.reference.sha256 = "0".repeat(64);
  await writeFile(path.join(directory, "art-manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyVirtualStudioLivingWorldArtManifest({ artDirectory: directory }), /reference SHA-256/u);
});

test("requires honest generated-pixel, private-source and existing gait disclosures", async () => {
  const original = JSON.parse(await readFile(path.join(VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY, "art-manifest.json"), "utf8"));
  const pixelIdentityClaim = structuredClone(original);
  pixelIdentityClaim.background.referencePixelIdentity = true;
  assert.throws(() => validateVirtualStudioLivingWorldArtManifestContract(pixelIdentityClaim), /changed reference pixels/u);
  const privateSourceClaim = structuredClone(original);
  privateSourceClaim.provenance.originalAuthoredMaster.sourcePixelsReverified = true;
  assert.throws(() => validateVirtualStudioLivingWorldArtManifestContract(privateSourceClaim), /private authored master/u);
  const gaitClaim = structuredClone(original);
  gaitClaim.limitations = gaitClaim.limitations.filter((item) => !item.includes("cutout-rig"));
  assert.throws(() => validateVirtualStudioLivingWorldArtManifestContract(gaitClaim), /cutout-rig/u);
});

test("checks the WebP bitstream instead of accepting a lossless metadata claim", async () => {
  const image = await readFile(path.join(VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY, "master-clean-plate.webp"));
  assert.equal(verifyLosslessWebpEncoding(image), true);
  // A structurally valid lossy VP8 image header with the same declared dimensions.
  const lossy = Buffer.alloc(30);
  lossy.write("RIFF", 0, "ascii"); lossy.writeUInt32LE(22, 4); lossy.write("WEBP", 8, "ascii");
  lossy.write("VP8 ", 12, "ascii"); lossy.writeUInt32LE(10, 16);
  lossy[23] = 0x9d; lossy[24] = 0x01; lossy[25] = 0x2a;
  lossy.writeUInt16LE(1296, 26); lossy.writeUInt16LE(1213, 28);
  assert.throws(() => verifyLosslessWebpEncoding(lossy), /static lossless VP8L/u);
});

test("rejects generated-world asset or authoring dimension drift", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonstudio-living-binding-"));
  (context.onTestFinished ?? context.after.bind(context))(() => rm(directory, { recursive: true, force: true }));
  const world = {
    layers: [{ name: "background", type: "imagelayer", image: "../production-v2/master-central-lossless.webp", imagewidth: 1296, imageheight: 1213 }],
    properties: [{ name: "backgroundUrl", value: "/assets/virtual-studio/living-world/master-clean-plate.webp" }],
  };
  const worldPath = path.join(directory, "world.json");
  await writeFile(worldPath, JSON.stringify(world));
  await assert.rejects(verifyVirtualStudioLivingWorldBindings({ worldPath }), /generated default world/u);
  world.layers[0].image = "../living-world/master-clean-plate.webp";
  world.layers[0].imageheight = 1216;
  await writeFile(worldPath, JSON.stringify(world));
  await assert.rejects(verifyVirtualStudioLivingWorldBindings({ worldPath }), /actual dimensions/u);
});
