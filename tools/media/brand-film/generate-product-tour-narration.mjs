import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const root = resolve(cwd, "../../..");
const specPath = resolve(cwd, "audio/product-tour-narration.json");
const audioPath = resolve(cwd, "audio/toonstudio-product-tour-narration.ko.m4a");
const metadataPath = resolve(cwd, "audio/toonstudio-product-tour-narration.ko.json");
const captionsKoPath = resolve(root, "apps/web/public/brand/toonstudio-product-tour.ko.vtt");
const captionsEnPath = resolve(root, "apps/web/public/brand/toonstudio-product-tour.en.vtt");
const checkOnly = process.argv.includes("--check");

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const cues = spec.cues;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: options.capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}${result.stderr ? `\n${result.stderr}` : ""}`);
  return result.stdout ?? "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function probeDuration(path) {
  const raw = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", path], { capture: true });
  const duration = Number(JSON.parse(raw).format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Could not probe duration: ${path}`);
  return duration;
}

function formatTime(totalSeconds) {
  const milliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

function wrapCaption(text, width) {
  const words = text.split(/\s+/u);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > width) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function validateSpec() {
  if (spec.duration !== 504 || !Array.isArray(cues) || cues.length < 20) throw new Error("Invalid product-tour narration specification");
  for (const [index, cue] of cues.entries()) {
    if (!Number.isFinite(cue.start) || cue.start < 0 || cue.start >= spec.duration) throw new Error(`Invalid start at cue ${index + 1}`);
    if (index > 0 && cue.start <= cues[index - 1].start) throw new Error(`Cue ${index + 1} is not ordered`);
    if (typeof cue.ko !== "string" || !cue.ko.trim() || typeof cue.en !== "string" || !cue.en.trim()) throw new Error(`Cue ${index + 1} is missing text`);
  }
}

function buildVtt(locale, durations) {
  const width = locale === "ko" ? 34 : 48;
  const body = cues.map((cue, index) => {
    const nextStart = cues[index + 1]?.start ?? spec.duration;
    const spoken = durations[index] ?? Math.max(2.5, cue.ko.length / 7);
    const reading = locale === "ko" ? cue.ko.length / 7 : cue.en.length / 16;
    const end = Math.min(nextStart - 0.35, cue.start + Math.max(spoken + 0.8, reading, 2.5));
    return `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(end)}\n${wrapCaption(cue[locale], width)}`;
  }).join("\n\n");
  return `WEBVTT\n\nNOTE ToonStudio product tour narration captions.\n\n${body}\n`;
}

validateSpec();

if (checkOnly) {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const duration = probeDuration(audioPath);
  if (Math.abs(duration - spec.duration) > 0.1) throw new Error(`Narration duration drifted: ${duration}`);
  if (metadata.audioSha256 !== sha256(audioPath) || metadata.specSha256 !== sha256(specPath)) throw new Error("Narration hashes are stale");
  const expectedKo = buildVtt("ko", metadata.cues.map((cue) => cue.duration));
  const expectedEn = buildVtt("en", metadata.cues.map((cue) => cue.duration));
  if (readFileSync(captionsKoPath, "utf8") !== expectedKo || readFileSync(captionsEnPath, "utf8") !== expectedEn) throw new Error("Generated captions are stale");
  console.log(JSON.stringify({ ok: true, duration, cues: cues.length, audioSha256: metadata.audioSha256 }, null, 2));
  process.exit(0);
}

if (process.platform !== "darwin") throw new Error("Generating the reviewed Yuna narration requires macOS; use --check elsewhere");

const temporary = mkdtempSync(resolve(tmpdir(), "toonstudio-product-tour-narration-"));
const renderedCues = [];
try {
  for (const [index, cue] of cues.entries()) {
    const nextStart = cues[index + 1]?.start ?? spec.duration;
    const available = nextStart - cue.start - 0.7;
    let rate = spec.voice.rate;
    let path = "";
    let duration = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      path = resolve(temporary, `cue-${String(index + 1).padStart(2, "0")}-${rate}.aiff`);
      run("/usr/bin/say", ["-v", spec.voice.name, "-r", String(rate), "-o", path, cue.ko]);
      duration = probeDuration(path);
      if (duration <= available) break;
      rate += 10;
    }
    if (duration > available) throw new Error(`Cue ${index + 1} is ${duration.toFixed(2)}s but only ${available.toFixed(2)}s is available`);
    renderedCues.push({ ...cue, path, duration, rate });
  }

  const inputs = renderedCues.flatMap((cue) => ["-i", cue.path]);
  const delayed = renderedCues.map((cue, index) => `[${index}:a]aresample=48000,pan=mono|c0=c0,adelay=${Math.round(cue.start * 1000)}:all=1[a${index}]`);
  const labels = renderedCues.map((_, index) => `[a${index}]`).join("");
  const filter = `${delayed.join(";")};${labels}amix=inputs=${renderedCues.length}:normalize=0:dropout_transition=0,apad=whole_dur=${spec.duration},atrim=duration=${spec.duration},highpass=f=70,lowpass=f=15000,loudnorm=I=-16:TP=-1.5:LRA=6[out]`;
  run("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-c:a", "aac", "-b:a", "80k", "-ar", "48000", "-ac", "1", audioPath]);

  const durations = renderedCues.map((cue) => cue.duration);
  writeFileSync(captionsKoPath, buildVtt("ko", durations));
  writeFileSync(captionsEnPath, buildVtt("en", durations));
  const metadata = {
    version: spec.version,
    duration: spec.duration,
    locale: spec.voice.locale,
    voice: spec.voice,
    disclosure: spec.disclosure,
    generatedAt: new Date().toISOString(),
    specSha256: sha256(specPath),
    audioSha256: sha256(audioPath),
    cues: renderedCues.map(({ start, duration, rate, ko, en }) => ({ start, duration, rate, ko, en })),
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify({ audioPath, metadataPath, captionsKoPath, captionsEnPath, cues: cues.length, duration: probeDuration(audioPath), audioSha256: metadata.audioSha256 }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
