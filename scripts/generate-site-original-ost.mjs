#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CONFIG_PATH = join(ROOT, "config/site-original-ost.production.json");
const OUTPUT_DIR = join(ROOT, "apps/web/public/audio/original");
const PLAYLIST_PATH = join(ROOT, "apps/web/public/audio/playlist.json");
const TERMS_URL = "https://elevenlabs.io/eleven-music-model-specific-terms";
const ENDPOINT = "https://api.elevenlabs.io/v1/music?output_format=auto";
const MAX_DURATION_MS = 300_000;
const MIN_DURATION_MS = 3_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const VALID_PROFILES = new Set(["animation", "webtoon", "lofi", "cinematic", "fantasy", "citypop"]);
const VALID_INTENSITIES = new Set(["chill", "normal", "epic"]);
const VALID_ROLES = new Set(["opening", "creator", "story", "action", "romance", "ending"]);
const VALID_VARIANTS = new Set(["vocal", "instrumental"]);

function usage() {
  console.log(`ToonSpectrum site OST production\n\nUsage:\n  node scripts/generate-site-original-ost.mjs [options]\n\nOptions:\n  --dry-run              Print provider requests without spending credits (default)\n  --generate             Call Eleven Music v2.5 and write audio + provenance sidecars\n  --track <id>           Generate one track (defaults to all tracks in dry-run)\n  --variant <name>       vocal | instrumental; defaults to each track's primaryVariant\n  --with-variants        Generate every declared variant instead of only primary variants\n  --confirm-batch        Required when --generate would create more than one audio file\n  --force                Replace an existing generated audio file\n  --publish              Rebuild playlist.json from reviewed/generated sidecars on disk\n  --help                 Show this help\n\nExamples:\n  node scripts/generate-site-original-ost.mjs --track draw-your-world --dry-run\n  ELEVENLABS_API_KEY=... node scripts/generate-site-original-ost.mjs --track draw-your-world --generate --publish\n  ELEVENLABS_API_KEY=... node scripts/generate-site-original-ost.mjs --all --generate --confirm-batch --publish\n`);
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    generate: false,
    all: false,
    withVariants: false,
    confirmBatch: false,
    force: false,
    publish: false,
    track: "",
    variant: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") { usage(); process.exit(0); }
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--generate") { options.generate = true; options.dryRun = false; }
    else if (arg === "--all") options.all = true;
    else if (arg === "--with-variants") options.withVariants = true;
    else if (arg === "--confirm-batch") options.confirmBatch = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--publish") options.publish = true;
    else if (arg === "--track") options.track = argv[++index] ?? "";
    else if (arg === "--variant") options.variant = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.track && options.all) throw new Error("Use either --track or --all, not both.");
  if (options.variant && !VALID_VARIANTS.has(options.variant)) throw new Error("--variant must be vocal or instrumental.");
  return options;
}

function assertString(value, name, max = 4_100) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} must be a non-empty string <= ${max} characters.`);
}

function validateConfig(config) {
  if (!config || typeof config !== "object" || !Array.isArray(config.tracks)) throw new Error("Invalid OST production config.");
  assertString(config.collection, "collection", 120);
  assertString(config.artist, "artist", 120);
  if (config.model !== "music_v2_5") throw new Error("Site OST production must use music_v2_5.");
  if (!config.sonicIdentity || !Array.isArray(config.sonicIdentity.principles) || !Array.isArray(config.sonicIdentity.negativeStyles)) throw new Error("sonicIdentity is required.");
  const ids = new Set();
  for (const track of config.tracks) {
    assertString(track.id, "track.id", 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(track.id)) throw new Error(`Invalid track id: ${track.id}`);
    if (ids.has(track.id)) throw new Error(`Duplicate track id: ${track.id}`);
    ids.add(track.id);
    assertString(track.title, `${track.id}.title`, 120);
    assertString(track.summary, `${track.id}.summary`, 260);
    assertString(track.direction, `${track.id}.direction`);
    if (!VALID_ROLES.has(track.role)) throw new Error(`Invalid role for ${track.id}`);
    if (!VALID_INTENSITIES.has(track.intensity)) throw new Error(`Invalid intensity for ${track.id}`);
    if (!Array.isArray(track.profiles) || track.profiles.length === 0 || track.profiles.some((value) => !VALID_PROFILES.has(value))) throw new Error(`Invalid profiles for ${track.id}`);
    if (!Number.isInteger(track.bpm) || track.bpm < 50 || track.bpm > 220) throw new Error(`Invalid BPM for ${track.id}`);
    if (!Number.isInteger(track.durationMs) || track.durationMs < MIN_DURATION_MS || track.durationMs > MAX_DURATION_MS) throw new Error(`Invalid duration for ${track.id}`);
    if (!VALID_VARIANTS.has(track.primaryVariant) || !Array.isArray(track.variants) || !track.variants.includes(track.primaryVariant) || track.variants.some((value) => !VALID_VARIANTS.has(value))) throw new Error(`Invalid variants for ${track.id}`);
    if (track.primaryVariant === "vocal") {
      if (!Array.isArray(track.sections) || track.sections.length < 4) throw new Error(`Vocal track ${track.id} requires structured sections.`);
      const total = track.sections.reduce((sum, section) => sum + Number(section.durationMs || 0), 0);
      if (total !== track.durationMs) throw new Error(`Section durations for ${track.id} total ${total}, expected ${track.durationMs}.`);
      for (const section of track.sections) {
        assertString(section.name, `${track.id}.section.name`, 60);
        if (!Number.isInteger(section.durationMs) || section.durationMs < MIN_DURATION_MS) throw new Error(`Invalid section duration in ${track.id}`);
        if (section.lyrics && (!Array.isArray(section.lyrics) || section.lyrics.some((line) => typeof line !== "string" || !line.trim()))) throw new Error(`Invalid lyrics in ${track.id}`);
      }
    }
  }
}

function globalPositive(config, track) {
  return [
    ...config.sonicIdentity.principles,
    track.direction,
    `${track.bpm} BPM`,
    `ToonSpectrum sonic identity; recurring creation motif should feel related across the album while this composition remains fully original`,
    "high-fidelity studio-grade production, wide but mono-compatible image, controlled sub bass, natural transients, clear midrange, expressive dynamics",
  ];
}

function sectionPositive(section) {
  const name = section.name.toLowerCase();
  const base = Array.isArray(section.styles) ? section.styles : [];
  if (name.includes("final chorus")) return [...base, "largest emotional payoff", "full arrangement", "layered backing harmonies", "decisive original hook"];
  if (name.includes("chorus")) return [...base, "memorable original chorus", "clear melodic lift", "fuller arrangement", "singable hook"];
  if (name.includes("pre-chorus")) return [...base, "rising harmony", "building rhythmic energy"];
  if (name.includes("bridge")) return [...base, "contrasting harmonic color", "fresh emotional perspective"];
  if (name.includes("verse")) return [...base, "story-forward phrasing", "clear diction", "lighter arrangement than chorus"];
  if (name.includes("intro")) return [...base, "recognizable opening motif", "strong first five seconds"];
  if (name.includes("outro")) return [...base, "resolved final cadence", "natural tail"];
  return base;
}

function buildCompositionPlan(config, track) {
  const negatives = [...config.sonicIdentity.negativeStyles, "new improvised lyrics not written in the section"];
  return {
    chunks: track.sections.map((section, index) => {
      const lyrics = Array.isArray(section.lyrics) ? section.lyrics : [];
      const instrumental = lyrics.length === 0;
      return {
        text: `[${section.name}]\n${instrumental ? "{instrumental passage; no vocal}" : lyrics.join("\n")}`,
        duration_ms: section.durationMs,
        positive_styles: [
          ...(index === 0 ? globalPositive(config, track) : [track.direction, `${track.bpm} BPM`]),
          ...sectionPositive(section),
        ],
        negative_styles: instrumental ? [...config.sonicIdentity.negativeStyles, "vocals", "spoken narration"] : negatives,
        context_adherence: "high",
      };
    }),
  };
}

function buildInstrumentalPrompt(config, track) {
  const positives = globalPositive(config, track).join("; ");
  const negatives = config.sonicIdentity.negativeStyles.join(", ");
  return `${positives}. Instrumental only: absolutely no singing, chant, speech or vocal chops. Build a complete long-form composition with intro, development, contrast, climax and resolved ending. Preserve negative space for reading and interface sounds when intensity is ${track.intensity}. Avoid: ${negatives}.`;
}

function requestFor(config, track, variant) {
  if (variant === "vocal") {
    if (!track.sections) throw new Error(`${track.id} has no vocal section plan.`);
    return {
      composition_plan: buildCompositionPlan(config, track),
      model_id: config.model,
      store_for_inpainting: true,
      sign_with_c2pa: true,
    };
  }
  return {
    prompt: buildInstrumentalPrompt(config, track),
    music_length_ms: track.durationMs,
    model_id: config.model,
    force_instrumental: true,
    store_for_inpainting: true,
    sign_with_c2pa: true,
  };
}

function isMp3(bytes) {
  return bytes.length > 10 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function configDigest(config) {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function generateOne(config, track, variant, options) {
  if (!track.variants.includes(variant)) throw new Error(`${track.id} does not declare the ${variant} variant.`);
  const body = requestFor(config, track, variant);
  const outputPath = join(OUTPUT_DIR, `${track.id}-${variant}.mp3`);
  const sidecarPath = join(OUTPUT_DIR, `${track.id}-${variant}.json`);

  if (options.dryRun) {
    console.log(JSON.stringify({ track: track.id, variant, outputPath: outputPath.slice(ROOT.length + 1), providerRequest: body }, null, 2));
    return;
  }

  if (await exists(outputPath) && !options.force) throw new Error(`${outputPath.slice(ROOT.length + 1)} already exists. Use --force to replace it.`);
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required for --generate. The key is never written to disk or logs.");

  console.log(`Generating ${track.id} (${variant}, ${Math.round(track.durationMs / 1000)}s) with ${config.model}...`);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Eleven Music returned HTTP ${response.status}; response body intentionally not logged.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^audio\/(?:mpeg|mp3)(?:;|$)/iu.test(contentType) && !/^application\/octet-stream(?:;|$)/iu.test(contentType)) throw new Error(`Unexpected content type: ${contentType || "missing"}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isMp3(bytes)) throw new Error("Provider response is not a valid MP3 payload.");

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(outputPath, bytes, { flag: options.force ? "w" : "wx" });
  const generatedAt = new Date().toISOString();
  const songId = response.headers.get("song-id")?.match(/^[A-Za-z0-9_-]{1,160}$/u)?.[0] ?? null;
  const provenance = {
    schemaVersion: 1,
    trackId: track.id,
    variant,
    provider: "elevenlabs",
    model: config.model,
    outputFormatRequested: config.outputFormat,
    generatedAt,
    durationMs: track.durationMs,
    bpm: track.bpm,
    songId,
    sha256: sha256(bytes),
    configSha256: configDigest(config),
    c2paRequested: true,
    storeForInpainting: true,
    termsUrl: TERMS_URL,
    review: { creative: false, clipping: false, lyrics: variant === "instrumental", rights: false, approvedForSite: false },
  };
  await writeFile(sidecarPath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath.slice(ROOT.length + 1)} and provenance sidecar.`);
}

async function readSidecars() {
  if (!(await exists(OUTPUT_DIR))) return [];
  const names = (await readdir(OUTPUT_DIR)).filter((name) => name.endsWith(".json")).sort();
  const values = [];
  for (const name of names) {
    const value = JSON.parse(await readFile(join(OUTPUT_DIR, name), "utf8"));
    values.push(value);
  }
  return values;
}

async function publishManifest(config) {
  const byId = new Map(config.tracks.map((track) => [track.id, track]));
  const sidecars = await readSidecars();
  const tracks = [];
  for (const metadata of sidecars) {
    const track = byId.get(metadata.trackId);
    if (!track || !VALID_VARIANTS.has(metadata.variant)) continue;
    const audioName = `${track.id}-${metadata.variant}.mp3`;
    const audioPath = join(OUTPUT_DIR, audioName);
    if (!(await exists(audioPath))) continue;
    const bytes = new Uint8Array(await readFile(audioPath));
    if (!isMp3(bytes) || sha256(bytes) !== metadata.sha256) throw new Error(`Integrity check failed for ${audioName}`);
    if (metadata.provider !== "elevenlabs" || metadata.model !== "music_v2_5" || metadata.c2paRequested !== true) throw new Error(`Provenance check failed for ${audioName}`);
    if (metadata.review?.approvedForSite !== true) {
      console.warn(`Skipping ${audioName}: review.approvedForSite is not true.`);
      continue;
    }
    tracks.push({
      id: `${track.id}-${metadata.variant}`,
      src: `/audio/original/${audioName}`,
      title: track.title,
      artist: config.artist,
      role: track.role,
      origin: "original",
      vocalMode: metadata.variant,
      language: metadata.variant === "vocal" ? track.language : "none",
      summary: track.summary,
      license: "Eleven Music original generation; commercial use subject to the active ToonSpectrum subscription and Music Terms review",
      creditUrl: TERMS_URL,
      profiles: track.profiles,
      intensity: track.intensity,
      durationMs: track.durationMs,
      bpm: track.bpm,
      provider: metadata.provider,
      model: metadata.model,
      songId: metadata.songId,
      sha256: metadata.sha256,
      generatedAt: metadata.generatedAt,
      c2paRequested: metadata.c2paRequested,
      status: "published"
    });
  }
  tracks.sort((a, b) => {
    const aTrack = byId.get(a.id.replace(/-(?:vocal|instrumental)$/u, ""));
    const bTrack = byId.get(b.id.replace(/-(?:vocal|instrumental)$/u, ""));
    const ai = config.tracks.indexOf(aTrack);
    const bi = config.tracks.indexOf(bTrack);
    return ai - bi || a.vocalMode.localeCompare(b.vocalMode);
  });
  const manifest = { version: 2, collection: config.collection, publishedAt: new Date().toISOString(), tracks };
  await writeFile(PLAYLIST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Published ${tracks.length} approved original track variants to ${PLAYLIST_PATH.slice(ROOT.length + 1)}.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  validateConfig(config);

  const selectedTracks = options.track
    ? config.tracks.filter((track) => track.id === options.track)
    : config.tracks;
  if (options.track && selectedTracks.length === 0) throw new Error(`Unknown track: ${options.track}`);

  const jobs = [];
  for (const track of selectedTracks) {
    const variants = options.variant ? [options.variant] : options.withVariants ? track.variants : [track.primaryVariant];
    for (const variant of variants) jobs.push({ track, variant });
  }
  if (options.generate && jobs.length > 1 && !options.confirmBatch) throw new Error(`This would generate ${jobs.length} paid audio files. Re-run with --confirm-batch after reviewing the dry-run output.`);

  for (const job of jobs) await generateOne(config, job.track, job.variant, options);
  if (options.publish) await publishManifest(config);
  if (!options.generate && !options.publish) console.log(`Dry-run complete: ${jobs.length} planned generation job(s); no credits spent and no audio written.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
