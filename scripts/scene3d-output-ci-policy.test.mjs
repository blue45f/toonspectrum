import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, matchesGlob } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = new URL("../", import.meta.url);
const workflow = (name) => parse(readFileSync(new URL(`.github/workflows/${name}`, repoRoot), "utf8"));
const manifests = [
  "apps/web/public/assets/3d/environments/refined-v6/manifest.json",
  "apps/web/public/assets/3d/environments/expansion-v1/manifest.json",
  "apps/web/public/assets/3d/environments/webtoon-v7/manifest.json",
  "apps/web/public/assets/3d/environments/mcp-free-v1/manifest.json",
];

describe("Scene3D output CI inputs", () => {
  it("keeps imported environment manifests in the real sparse checkout without downloading model binaries", () => {
    const lint = workflow("ci.yml").jobs.lint;
    const checkout = lint.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    const scratch = mkdtempSync(join(tmpdir(), "scene3d-sparse-regression-"));
    const git = (...args) => {
      const result = spawnSync("git", args, { cwd: scratch, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    try {
      git("init", "--quiet");
      for (const file of [...manifests, "apps/web/public/assets/3d/environments/refined-v6/large-model.glb", "package.json"]) {
        const path = join(scratch, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, "{}\n");
      }
      git("add", ".");
      git("-c", "user.name=Scene3D Test", "-c", "user.email=scene3d@example.invalid", "commit", "--quiet", "-m", "fixture");
      git("config", "core.sparseCheckout", "true");
      git("config", "core.sparseCheckoutCone", "false");
      writeFileSync(join(scratch, ".git/info/sparse-checkout"), checkout.with["sparse-checkout"]);
      git("read-tree", "-mu", "HEAD");
      for (const manifest of manifests) expect(existsSync(join(scratch, manifest)), manifest).toBe(true);
      expect(existsSync(join(scratch, "apps/web/public/assets/3d/environments/refined-v6/large-model.glb"))).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("runs normal/Worker/capture regressions when their source changes", () => {
    const scene = workflow("studio-scene3d-next.yml");
    const watched = scene.on.pull_request.paths;
    const commands = scene.jobs["scene3d-contracts"].steps.map((step) => step.run ?? "").join("\n");
    for (const file of [
      "studio-bg3d-lt-normal-edges.test.ts",
      "studio-bg3d-capture-adapter.test.ts",
      "studio-bg3d-lt-render-worker-client.test.ts",
      "studio-bg3d-lt-insert-worker-boundary.test.ts",
      "studio-bg3d-shot-artifact-pipeline.test.ts",
    ]) {
      const path = `apps/web/src/domains/creator/bg3d/${file}`;
      expect(watched.some((pattern) => matchesGlob(path, pattern)), path).toBe(true);
      expect(commands).toContain(path);
    }
    expect(commands).toContain("scripts/scene3d-output-ci-policy.test.mjs");
  });
});


it("runs the real specialist CSP lane when pinned dependencies or compatibility patches change", () => {
  const scene = workflow("studio-scene3d-next.yml"); const paths = scene.on.pull_request.paths;
  for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "patches/manifold-3d@3.5.1.patch", "patches/@gltf-transform__functions@4.4.2.patch"]) {
    expect(paths.some((pattern) => matchesGlob(file, pattern)), file).toBe(true);
  }
  expect(scene.jobs["scene3d-specialists-browser"].env.SCENE3D_SPECIALISTS_PRODUCTION_WORKER).toBe("1");
});


it("keeps all current environment manifests for related tests, without admitting unrelated asset trees", () => {
  const lane = workflow("toonstudio-session-goals.yml").jobs["focused-validation"];
  const checkout = lane.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  const wanted = [
    ...manifests,
    "apps/web/public/assets/3d/environments/refined-v6/hospital_reception.glb",
    "apps/web/public/assets/3d/environments/expansion-v1/library_reading_room.glb",
    "apps/web/public/assets/3d/environments/expansion-v1/thumbnails/library_reading_room.png",
    "apps/web/public/assets/3d/environments/mcp-free-v1/webtoon_neighborhood_bus_stop.glb",
    "apps/web/public/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_neighborhood_bus_stop.png",
    "apps/web/public/assets/3d/characters/thumbnails/refined-v2/manifest.json",
    "apps/web/src/domains/creator/bg3d/studio-bg3d-inplace-storage.test.ts",
  ];
  const excluded = ["apps/web/public/assets/unrelated/large.glb", "apps/web/public/vrm/large.vrm", "artifacts/huge.bin"];
  const scratch = mkdtempSync(join(tmpdir(), "scene3d-related-checkout-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };
  try {
    git("init", "--quiet");
    for (const file of [...wanted, ...excluded]) { const path = join(scratch, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, "fixture"); }
    git("add", ".");
    git("-c", "user.name=Scene3D Test", "-c", "user.email=scene3d@example.invalid", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true"); git("config", "core.sparseCheckoutCone", "false");
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), checkout.with["sparse-checkout"]);
    git("read-tree", "-mu", "HEAD");
    for (const file of wanted) expect(existsSync(join(scratch, file)), file).toBe(true);
    for (const file of excluded) expect(existsSync(join(scratch, file)), file).toBe(false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const commands = lane.steps.map((step) => step.run ?? "").join("\n");
  expect(commands).toContain('vitest related "${files[@]}" --run');
});


it("keeps the real source/result comparison proof in the Scene3D CI dependency boundary", () => {
  const scene = workflow("studio-scene3d-next.yml");
  for (const file of ["scripts/lib/scene3d-review-browser-proof.mjs", "apps/web/src/domains/creator/scene3d/specialists/artifact-review-runtime.ts", "apps/web/src/domains/creator/scene3d/specialists/StudioScene3dArtifactPreview.test.tsx"]) {
    expect(scene.on.pull_request.paths.some((pattern) => matchesGlob(file, pattern)), file).toBe(true);
  }
  const script = readFileSync(new URL("scripts/verify-studio-scene3d-specialists.mjs", repoRoot), "utf8");
  expect(script).toContain('verifyScene3dReview(page, scratch, "lod-comparison"');
  expect(script).toContain('verifyScene3dReview(page, scratch, "texture-comparison"');
  expect(scene.jobs["scene3d-specialists-browser"].steps.some((step) => step.run === "pnpm run verify:studio-3d-specialists:browser")).toBe(true);
});
