import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const output = resolve(cwd, "../../../apps/web/public/brand");
const publicDirectory = `--public-dir=${resolve(cwd, "../../../apps/web/public")}`;
const executable = resolve(cwd, "node_modules/.bin/remotion");
const visualPath = resolve(output, "toonstudio-product-tour.visual.mp4");
const videoPath = resolve(output, "toonstudio-product-tour.mp4");
const posterPath = resolve(output, "toonstudio-product-tour-poster.jpg");
mkdirSync(output, { recursive: true });

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", timeout: 1_800_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
};

run(process.execPath, ["generate-product-tour-narration.mjs", "--check"]);
run(process.execPath, ["generate-product-tour-runtime-audio.mjs"]);
try {
  run(executable, [
    "render",
    "src/index.tsx",
    "ToonStudioProductTour",
    visualPath,
    "--codec=h264",
    "--crf=28",
    "--concurrency=2",
    "--log=error",
    publicDirectory,
  ]);
  run(executable, [
    "still",
    "src/index.tsx",
    "ToonStudioProductTour",
    posterPath,
    "--frame=72",
    "--image-format=jpeg",
    "--log=error",
    publicDirectory,
  ]);
  run(process.execPath, [
    "mix-product-tour-audio.mjs",
    "--input",
    visualPath,
    "--output",
    videoPath,
  ]);
} finally {
  rmSync(visualPath, { force: true });
}

run(process.execPath, ["generate-product-tour-runtime-audio.mjs", "--check"]);
run(process.execPath, ["mix-product-tour-audio.mjs", "--check"]);
