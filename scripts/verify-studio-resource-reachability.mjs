#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const root = resolve(process.cwd());
const publicRoot = resolve(root, "apps/web/public");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function publicPath(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.includes("..")) return null;
  return resolve(publicRoot, `.${url}`);
}

function requirePublicFile(url, label) {
  const path = publicPath(url);
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    fail(`${label}: public resource is missing (${url})`);
    return null;
  }
  return path;
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const audioManifest = readJson("apps/web/public/audio/playlist.json");
const audioTracks = Array.isArray(audioManifest.tracks) ? audioManifest.tracks : [];
const audioSources = new Set();
const audioIds = new Set();
for (const track of audioTracks) {
  if (!track || typeof track !== "object") {
    fail("audio playlist contains a non-object track");
    continue;
  }
  if (audioIds.has(track.id)) fail(`audio playlist has duplicate id: ${track.id}`);
  audioIds.add(track.id);
  if (audioSources.has(track.src)) fail(`audio playlist has duplicate src: ${track.src}`);
  audioSources.add(track.src);
  requirePublicFile(track.src, `audio:${track.id}`);
}
const audioDir = resolve(publicRoot, "audio");
const audioFiles = readdirSync(audioDir)
  .filter((name) => [".mp3", ".ogg", ".wav", ".m4a"].includes(extname(name).toLowerCase()))
  .map((name) => `/audio/${name}`);
for (const url of audioFiles) {
  if (!audioSources.has(url)) fail(`unregistered site audio resource: ${url}`);
}
const siteMusicSource = readFileSync(
  resolve(root, "apps/web/src/shared/lib/site-background-music.ts"),
  "utf8",
);
if (!/fetch\(\s*["']\/audio\/playlist\.json(?:\?|["'])/.test(siteMusicSource)) {
  fail("site background music no longer consumes /audio/playlist.json");
}

const essentialsPublic = readJson("apps/web/public/creator-essentials/manifest.json");
const essentialsGenerated = readJson(
  "apps/web/src/domains/creator/studio-shell/creator-essentials/creator-essentials.generated.json",
);
if (JSON.stringify(essentialsPublic) !== JSON.stringify(essentialsGenerated)) {
  fail("creator essentials generated catalog is stale; regenerate it from the public manifest");
}
const essentialsAssets = Array.isArray(essentialsPublic.assets) ? essentialsPublic.assets : [];
const essentialsIds = new Set();
const registeredEssentialsFiles = new Set();
for (const asset of essentialsAssets) {
  if (essentialsIds.has(asset.id)) fail(`creator essentials has duplicate id: ${asset.id}`);
  essentialsIds.add(asset.id);
  for (const [field, url] of [["url", asset.url], ["preview", asset.preview]]) {
    const path = requirePublicFile(url, `creator-essential:${asset.id}:${field}`);
    if (path) registeredEssentialsFiles.add(basename(path));
  }
  const canonical = publicPath(asset.url);
  if (canonical && existsSync(canonical)) {
    const bytes = statSync(canonical).size;
    if (asset.bytes !== bytes) fail(`creator-essential:${asset.id}: byte count mismatch`);
    if (asset.sha256 !== sha256(canonical)) fail(`creator-essential:${asset.id}: sha256 mismatch`);
  }
}
const essentialsDir = resolve(publicRoot, "creator-essentials");
for (const name of readdirSync(essentialsDir)) {
  if (![".svg", ".glb"].includes(extname(name).toLowerCase())) continue;
  if (!registeredEssentialsFiles.has(name)) fail(`unregistered creator-essential resource: ${name}`);
}
const essentialsCatalogSource = readFileSync(
  resolve(root, "apps/web/src/domains/creator/studio-shell/creator-essentials/creator-essentials-catalog.ts"),
  "utf8",
);
if (!essentialsCatalogSource.includes('from "./creator-essentials.generated.json"')) {
  fail("Creator Essentials product catalog no longer consumes the generated manifest");
}

if (errors.length > 0) {
  console.error("Studio resource reachability verification failed.");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  `Studio resource reachability passed (${audioTracks.length} OST tracks, ${essentialsAssets.length} creator essentials).`,
);
