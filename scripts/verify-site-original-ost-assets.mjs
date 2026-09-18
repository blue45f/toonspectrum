#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_DIR = join(ROOT, "apps/web/public/audio");
const PLAYLIST = join(AUDIO_DIR, "playlist.json");
const EXPECTED_TRACKS = 9;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(await readFile(PLAYLIST, "utf8"));
assert(manifest?.version === 3, "Expected provenance-aware playlist schema version 3.");
assert(manifest?.collection === "ToonSpectrum Original OST", "Unexpected OST collection.");
assert(Array.isArray(manifest?.tracks), "playlist.json must contain tracks.");
assert(manifest.tracks.length === EXPECTED_TRACKS, `Expected ${EXPECTED_TRACKS} published masters, found ${manifest.tracks.length}.`);

const ids = new Set();
for (const track of manifest.tracks) {
  assert(typeof track.id === "string" && !ids.has(track.id), `Duplicate or invalid track id: ${track.id}`);
  ids.add(track.id);
  assert(/^\/audio\/original\/[a-z0-9._-]+\.mp3$/u.test(track.src), `Invalid same-origin audio path for ${track.id}.`);
  assert(track.origin === "original" && track.status === "published", `${track.id} is not a published original.`);
  assert(/^[a-f0-9]{64}$/u.test(track.sha256), `Invalid SHA-256 for ${track.id}.`);
  assert(track.provider === "ace-step" && track.model === "acestep-v15-turbo", `Unexpected provider/model for ${track.id}.`);
  assert(track.provenance === "local-generation-recorded" && /^[a-f0-9]{40}$/u.test(track.generatorRevision), `Invalid local provenance for ${track.id}.`);

  const audioName = track.src.slice("/audio/original/".length);
  const audioPath = join(AUDIO_DIR, "original", audioName);
  const sidecarPath = audioPath.replace(/\.mp3$/u, ".json");
  const audio = await readFile(audioPath);
  const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
  assert(sha256(audio) === track.sha256, `MP3 integrity mismatch for ${track.id}.`);
  assert(sidecar.sha256 === track.sha256 && sidecar.trackId === track.id.replace(/-(?:vocal|instrumental)$/u, ""), `Sidecar identity mismatch for ${track.id}.`);
  assert(sidecar.provider === "ace-step" && sidecar.model === "acestep-v15-turbo", `Sidecar provider mismatch for ${track.id}.`);
  assert(sidecar.generator?.sourceRevision === track.generatorRevision, `Generator revision mismatch for ${track.id}.`);
  assert(sidecar.quality?.automatedQcPassed === true, `Automated QC not approved for ${track.id}.`);
  assert(sidecar.quality?.sampleRate === 48_000 && sidecar.quality?.channels === 2, `Audio format QC failed for ${track.id}.`);
  assert(sidecar.quality?.bitRate >= 180_000, `Delivery bitrate too low for ${track.id}.`);
  assert(sidecar.quality?.integratedLufs >= -15.5 && sidecar.quality?.integratedLufs <= -12.5, `Loudness out of range for ${track.id}.`);
  assert(sidecar.quality?.truePeakDbfs <= -0.5, `True peak too high for ${track.id}.`);
  assert(sidecar.review?.approvedForSite === true, `Release approval missing for ${track.id}.`);
}

console.log(`Verified ${manifest.tracks.length} ToonSpectrum original OST masters and provenance sidecars.`);
