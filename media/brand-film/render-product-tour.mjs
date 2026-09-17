import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const output = resolve(cwd, "../../apps/web/public/brand");
const publicDirectory = `--public-dir=${resolve(cwd, "../../apps/web/public")}`;
const executable = resolve(cwd, "node_modules/.bin/remotion");
mkdirSync(output, { recursive: true });

const run = (args) => {
  const result = spawnSync(executable, args, { cwd, stdio: "inherit", timeout: 1_800_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Remotion exited with ${result.status}`);
};

const videoPath = resolve(output, "toonstudio-product-tour.mp4");
const posterPath = resolve(output, "toonstudio-product-tour-poster.jpg");
run([
  "render",
  "src/index.tsx",
  "ToonStudioProductTour",
  videoPath,
  "--codec=h264",
  "--crf=28",
  "--concurrency=2",  "--log=error",
  publicDirectory,
]);
run([
  "still",
  "src/index.tsx",
  "ToonStudioProductTour",
  posterPath,
  "--frame=72",
  "--image-format=jpeg",
  "--log=error",
  publicDirectory,
]);

const bytes = readFileSync(videoPath);
if (bytes.byteLength < 500_000 || bytes.byteLength > 96 * 1024 * 1024) {
  throw new Error(`Unexpected product tour size: ${bytes.byteLength}`);
}
const manifest = {
  version: 1,
  composition: "ToonStudioProductTour",
  duration: 504,
  fps: 30,
  src: "/brand/toonstudio-product-tour.mp4",
  poster: "/brand/toonstudio-product-tour-poster.jpg",
  bytes: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sourceCommit: process.env.GITHUB_SHA || "local",
};
writeFileSync(resolve(output, "product-tour-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
