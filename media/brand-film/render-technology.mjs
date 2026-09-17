import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const output = resolve(cwd, "../../apps/web/public/technology");
const selection = process.argv[2] || "all";
const formats = {
  overview: {
    id: "TechnologyStoryLandscape",
    filename: "technology-overview.ko.landscape.mp4",
    width: 1280,
    height: 720,
    duration: 90,
  },
  investor: {
    id: "TechnologyStoryInvestor",
    filename: "technology-investor.ko.landscape.mp4",
    width: 1280,
    height: 720,
    duration: 45,
  },
  portrait: {
    id: "TechnologyStoryPortrait",
    filename: "technology-overview.ko.portrait.mp4",
    width: 720,
    height: 1280,
    duration: 60,
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

const publicDirectory = `--public-dir=${resolve(cwd, "../../apps/web/public")}`;
const manifest = {
  version: 1,
  fps: 30,
  sourceCommit: process.env.GITHUB_SHA || "local",
  reviewed: false,
  publishing: "manual-after-human-review",
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
  ]);
  const bytes = readFileSync(path);
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
  "--frame=150",
  "--image-format=jpeg",
  "--log=error",
  publicDirectory,
]);

const koCues = [
  ["00:00:00.000", "00:00:12.000", "기획부터 연재까지 흩어진 제작 맥락을 하나의 프로젝트 흐름으로 연결합니다."],
  ["00:00:12.000", "00:00:25.000", "Workspace, Project, Episode, Cut, Asset와 Approval을 제품 경계로 정렬합니다."],
  ["00:00:25.000", "00:00:40.000", "브러시 반응성과 최종 문서 기록을 분리하고 OPFS와 복구 저널로 작업을 지킵니다."],
  ["00:00:40.000", "00:00:55.000", "OAuth, 개인 클라우드와 AI를 제품 계약 뒤에 두고 동의와 권리를 보존합니다."],
  ["00:00:55.000", "00:01:10.000", "운영, 설정, 실험과 문서 상태를 코드, 테스트와 workflow 근거에 연결합니다."],
  ["00:01:10.000", "00:01:30.000", "다른 프로젝트에는 패키지 목록보다 데이터 권위, 실패, 대체 경로와 검증 순서를 재사용합니다."],
];

const enCues = [
  ["00:00:00.000", "00:00:12.000", "Connect fragmented production context from planning through serialization into one project flow."],
  ["00:00:12.000", "00:00:25.000", "Align Workspace, Project, Episode, Cut, Asset and Approval as product boundaries."],
  ["00:00:25.000", "00:00:40.000", "Separate responsive brush presentation from durable document recording, protected by OPFS and recovery journals."],
  ["00:00:40.000", "00:00:55.000", "Place OAuth, personal cloud and AI behind product contracts that preserve consent and rights."],
  ["00:00:55.000", "00:01:10.000", "Connect live, configured, experimental and documented status to code, tests and workflow evidence."],
  ["00:01:10.000", "00:01:30.000", "Reuse data authority, failure, fallback and verification order rather than a package list."],
];

const toVtt = (cues) => `WEBVTT\n\n${cues.map(([start, end, text], index) => `${index + 1}\n${start} --> ${end}\n${text}\n`).join("\n")}`;
writeFileSync(resolve(output, "technology-overview.ko.vtt"), toVtt(koCues));
writeFileSync(resolve(output, "technology-overview.en.vtt"), toVtt(enCues));
writeFileSync(
  resolve(output, "technology-transcript.ko.md"),
  `# ToonStudio 기술 스토리 영상 대본\n\n${koCues.map(([start, end, text]) => `- **${start}–${end}** ${text}`).join("\n")}\n`,
);
writeFileSync(
  resolve(output, "technology-transcript.en.md"),
  `# ToonStudio engineering story transcript\n\n${enCues.map(([start, end, text]) => `- **${start}–${end}** ${text}`).join("\n")}\n`,
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
recordArtifact("captionsKo", "technology-overview.ko.vtt", { kind: "captions", locale: "ko" });
recordArtifact("captionsEn", "technology-overview.en.vtt", { kind: "captions", locale: "en" });
recordArtifact("transcriptKo", "technology-transcript.ko.md", { kind: "transcript", locale: "ko" });
recordArtifact("transcriptEn", "technology-transcript.en.md", { kind: "transcript", locale: "en" });
writeFileSync(resolve(output, "technology-film-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
