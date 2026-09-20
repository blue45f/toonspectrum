import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STUDIO_AMBIENT_TRACKS } from "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-ambient-tracks.ts";

export const VIRTUAL_STUDIO_AMBIENT_DIRECTORY = fileURLToPath(new URL("../apps/web/public/assets/virtual-studio/ambient-audio", import.meta.url));
const CC0_TEXT_SHA256 = "a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Verifies original bytes against preparation evidence; does not claim a new listening review. */
export function verifyVirtualStudioAmbientAudio({ directory = VIRTUAL_STUDIO_AMBIENT_DIRECTORY } = {}) {
  const provenance = JSON.parse(readFileSync(resolve(directory, "provenance.json"), "utf8"));
  assert.equal(provenance.license, "CC0-1.0", "ambient license must remain CC0");
  assert.equal(provenance.author, "Ylmir");
  assert.equal(provenance.sourcePage, "https://opengameart.org/content/rain-loopable");
  assert.equal(provenance.sourceArchiveSha256, "e68f3e1c77493cf43bec84cebff5043bff6be9ce16d59b24caa988cd460aa75b");
  assert.equal(provenance.processing.startsWith("None."), true, "original recording bytes must be unchanged");
  assert.equal(provenance.licenseTextSha256, CC0_TEXT_SHA256);
  assert.equal(sha(readFileSync(resolve(directory, "CC0-1.0.txt"))), CC0_TEXT_SHA256, "official CC0 legal text integrity");
  assert.equal(provenance.files.length, STUDIO_AMBIENT_TRACKS.length);
  for (const track of STUDIO_AMBIENT_TRACKS) {
    const bytes = readFileSync(resolve(directory, basename(track.src)));
    assert.equal(bytes.subarray(0, 4).toString(), "OggS", `${track.id}: OGG container`);
    assert.equal(bytes.length, track.bytes, `${track.id}: byte length`);
    assert.equal(sha(bytes), track.sha256, `${track.id}: original SHA-256`);
    const recorded = provenance.files.find((item) => track.src.endsWith(`/${item.deliveredFile}`));
    assert.equal(recorded?.sha256, track.sha256, `${track.id}: provenance SHA-256`);
    assert.equal(recorded?.bytes, track.bytes);
    assert.equal(recorded?.duration, track.duration);
    assert.equal(recorded?.channels, 2);
    assert.equal(recorded?.sampleRate, 44100);
    assert.equal(recorded?.clippedSamples, 0);
    assert(recorded.peak < .9 && Math.abs(recorded.dc) < .001, `${track.id}: recorded peak/DC`);
    assert(recorded.seamJump < recorded.differenceP99, `${track.id}: recorded seam discontinuity`);
    assert(Math.abs(recorded.startEndRmsDeltaDb) < 1, `${track.id}: recorded seam level`);
  }
  return { assetCount: STUDIO_AMBIENT_TRACKS.length, totalBytes: STUDIO_AMBIENT_TRACKS.reduce((sum, track) => sum + track.bytes, 0),
    originalBytesVerified: true, license: "CC0-1.0", subjectiveListeningReverified: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyVirtualStudioAmbientAudio();
  console.log(`Virtual Studio ambient integrity OK: ${result.assetCount} unchanged CC0 recordings, ${result.totalBytes} bytes. Original SHA-256, license text and recorded PCM preparation checks verified; subjective listening was not reverified.`);
}
