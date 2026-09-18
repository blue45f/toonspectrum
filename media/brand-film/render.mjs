import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
// The web app owns public/ since the apps/web move. Writing to the repository root would
// also recreate the legacy public/ directory that scripts/validate-architecture.mjs forbids.
const output = resolve(cwd, "../../apps/web/public/brand");
const format = process.argv[2] || "all";
const formats = {
  landscape: { id: "ToonStudioLandscape", filename: "toonstudio-intro.mp4", width: 1280, height: 720 },
  portrait: { id: "ToonStudioPortrait", filename: "toonstudio-intro-portrait.mp4", width: 720, height: 1280 },
  square: { id: "ToonStudioSquare", filename: "toonstudio-intro-square.mp4", width: 1080, height: 1080 },
  header: { id: "ToonStudioRouteHeader", filename: "toonstudio-route-header.mp4", width: 1920, height: 768 },
};
if (format !== "all" && !Object.hasOwn(formats, format)) throw new Error("format must be landscape, portrait, square, header or all");
mkdirSync(output, { recursive: true });
const run = (args) => {
  const executable = resolve(cwd, "node_modules/.bin/remotion");
  const result = spawnSync(executable, args, { cwd, stdio: "inherit", timeout: 900000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Remotion exited with ${result.status}`);
};
const publicDirectory = `--public-dir=${resolve(cwd, "../../apps/web/public")}`;
const manifestPath = resolve(output, "film-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { version: 1, duration: 24, fps: 30, assets: {} };
for (const [name, item] of Object.entries(formats)) {
  if (format !== "all" && format !== name) continue;
  const path = resolve(output, item.filename);
  run(["render", "src/index.tsx", item.id, path, "--codec=h264", "--crf=18", "--x264-preset=slow", "--pixel-format=yuv420p", "--muted", "--concurrency=2", "--log=error", publicDirectory]);
  const bytes = readFileSync(path);
  if (bytes.byteLength < 10000 || bytes.byteLength > 24 * 1024 * 1024) throw new Error(`Unexpected film size: ${name} ${bytes.byteLength}`);
  const entry = { src: `/brand/${item.filename}`, width: item.width, height: item.height, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
  if (name === "header") manifest.routeHeader = entry;
  else manifest.assets[name] = entry;
}
if (format === "all" || format === "header") {
  manifest.routeHeaderPosters = {};
  for (const startSeconds of [0, 6, 12, 18]) {
    const filename = `toonstudio-route-header-${startSeconds}.jpg`;
    const path = resolve(output, filename);
    run(["still", "src/index.tsx", "ToonStudioRouteHeader", path, `--frame=${startSeconds * 30}`, "--image-format=jpeg", "--jpeg-quality=95", "--log=error", publicDirectory]);
    const bytes = readFileSync(path);
    manifest.routeHeaderPosters[String(startSeconds)] = {
      src: `/brand/${filename}`,
      width: 1920,
      height: 768,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}
if (format === "all" || format === "landscape") {
  run(["still", "src/index.tsx", "ToonStudioLandscape", resolve(output, "toonstudio-film-poster.jpg"), "--frame=50", "--image-format=jpeg", "--jpeg-quality=95", "--log=error", publicDirectory]);
  run(["still", "src/index.tsx", "ToonStudioShare", resolve(output, "toonstudio-og.png"), "--frame=50", "--log=error", publicDirectory]);
}
manifest.sourceCommit = process.env.GITHUB_SHA || "local";
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
