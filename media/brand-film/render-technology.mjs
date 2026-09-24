import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(cwd, "../..");
const output = resolve(repositoryRoot, "apps/web/public/technology");
const scriptPath = resolve(
  repositoryRoot,
  "apps/web/src/domains/legal/technology/technology-film-script.json",
);
const filmScript = JSON.parse(readFileSync(scriptPath, "utf8"));
const selection = process.argv[2] || "all";
const formats = {
  overview: {
    id: "TechnologyStoryLandscape",
    filename: "technology-overview.ko.landscape.mp4",
    width: 1280,
    height: 720,
    duration: filmScript.variants.overview.durationSeconds,
  },
  investor: {
    id: "TechnologyStoryInvestor",
    filename: "technology-investor.ko.landscape.mp4",
    width: 1280,
    height: 720,    duration: filmScript.variants.investor.durationSeconds,
  },
  portrait: {
    id: "TechnologyStoryPortrait",
    filename: "technology-overview.ko.portrait.mp4",
    width: 720,
    height: 1280,
    duration: filmScript.variants.portrait.durationSeconds,
  },
};

if (selection !== "all" && !Object.hasOwn(formats, selection)) {
  throw new Error("format must be overview, investor, portrait or all");
}

mkdirSync(output, { recursive: true });

const run = (args) => {
  const executable = resolve(cwd, "node_modules/.bin/remotion");
  const result = spawnSync(executable, args, {
    cwd,
    stdio: "inherit",
    timeout: 1_800_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Remotion exited with ${result.status}`);
};

const publicDirectory = `--public-dir=${resolve(repositoryRoot, "apps/web/public")}`;const manifest = {
  version: 3,
  scriptVersion: filmScript.version,
  fps: filmScript.fps,
  sourceCommit: process.env.GITHUB_SHA || "local",
  reviewed: false,
  publishing: "manual-after-human-review",
  sceneCounts: {
    overview: filmScript.variants.overview.scenes.length,
    investor: filmScript.variants.investor.scenes.length,
    portrait: filmScript.variants.portrait.sceneIds.length,
  },
  assets: {},
};

for (const [name, item] of Object.entries(formats)) {
  if (selection !== "all" && selection !== name) continue;
  const path = resolve(output, item.filename);
  run([
    "render",
    "src/index.tsx",
    item.id,
    path,
    "--codec=h264",
    "--crf=24",
    "--concurrency=2",
    "--log=error",
    publicDirectory,
  ]);  const bytes = readFileSync(path);
  if (bytes.byteLength < 10_000 || bytes.byteLength > 40 * 1024 * 1024) {
    throw new Error(`Unexpected technology film size: ${name} ${bytes.byteLength}`);
  }
  manifest.assets[name] = {
    src: `/technology/${item.filename}`,
    width: item.width,
    height: item.height,
    duration: item.duration,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

run([
  "still",
  "src/index.tsx",
  "TechnologyStoryLandscape",
  resolve(output, "technology-poster.jpg"),
  `--frame=${Math.min(
    150,
    filmScript.variants.overview.durationSeconds * filmScript.fps - 1,
  )}`,
  "--image-format=jpeg",
  "--log=error",
  publicDirectory,
]);

function vttTime(seconds) {  const milliseconds = Math.max(0, Math.round(seconds * 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1_000);
  const ms = milliseconds % 1_000;
  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, "0"))
    .join(":") + `.${String(ms).padStart(3, "0")}`;
}

function overviewCues(locale) {
  const { durationSeconds, scenes } = filmScript.variants.overview;
  const sceneDuration = durationSeconds / scenes.length;
  return scenes.map((scene, index) => [
    vttTime(index * sceneDuration),
    vttTime((index + 1) * sceneDuration),
    scene.narration[locale],
  ]);
}

const koCues = overviewCues("ko");
const enCues = overviewCues("en");
const toVtt = (cues) => `WEBVTT\n\n${cues
  .map(
    ([start, end, text], index) =>
      `${index + 1}\n${start} --> ${end}\n${text}\n`,
  )
  .join("\n")}`;writeFileSync(resolve(output, "technology-overview.ko.vtt"), toVtt(koCues));
writeFileSync(resolve(output, "technology-overview.en.vtt"), toVtt(enCues));
writeFileSync(
  resolve(output, "technology-transcript.ko.md"),
  `# ToonStudio 기술 스토리 영상 대본\n\n${koCues
    .map(([start, end, text]) => `- **${start}–${end}** ${text}`)
    .join("\n")}\n`,
);
writeFileSync(
  resolve(output, "technology-transcript.en.md"),
  `# ToonStudio engineering story transcript\n\n${enCues
    .map(([start, end, text]) => `- **${start}–${end}** ${text}`)
    .join("\n")}\n`,
);

const recordArtifact = (key, filename, metadata = {}) => {
  const bytes = readFileSync(resolve(output, filename));
  manifest.assets[key] = {
    src: `/technology/${filename}`,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...metadata,
  };
};
recordArtifact("poster", "technology-poster.jpg", { kind: "poster" });
recordArtifact("captionsKo", "technology-overview.ko.vtt", {
  kind: "captions",
  locale: "ko",});
recordArtifact("captionsEn", "technology-overview.en.vtt", {
  kind: "captions",
  locale: "en",
});
recordArtifact("transcriptKo", "technology-transcript.ko.md", {
  kind: "transcript",
  locale: "ko",
});
recordArtifact("transcriptEn", "technology-transcript.en.md", {
  kind: "transcript",
  locale: "en",
});
writeFileSync(
  resolve(output, "technology-film-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify(manifest, null, 2));
