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
