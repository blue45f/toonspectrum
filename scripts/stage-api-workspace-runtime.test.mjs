import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { stageApiWorkspaceRuntime } from "./stage-api-workspace-runtime.mjs";

async function compiledPackage(root, path, source) {
  const filename = resolve(root, path);
  await mkdir(resolve(filename, ".."), { recursive: true });
  await writeFile(filename, source, "utf8");
  return filename;
}

test("stages workspace packages inside the emitted API boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-runtime-"));
  try {
    await compiledPackage(
      root,
      "packages/studio-project-model/src/index.js",
      '"use strict"; module.exports = { model: "v3" };\n',
    );
    await compiledPackage(
      root,
      "packages/studio-format-gateway/src/index.js",
      '"use strict"; module.exports = { gateway: "compatibility" };\n',
    );
    const caller = await compiledPackage(
      root,
      "apps/api/src/main.js",
      '"use strict";\n',
    );

    const staged = await stageApiWorkspaceRuntime(root);
    assert.deepEqual(staged.map((entry) => entry.name), [
      "@toonspectrum/studio-project-model",
      "@toonspectrum/studio-format-gateway",
    ]);

    const requireFromApi = createRequire(caller);
    assert.deepEqual(requireFromApi("@toonspectrum/studio-project-model"), {
      model: "v3",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/studio-format-gateway"), {
      gateway: "compatibility",
    });

    const canonicalRoot = await realpath(root);
    for (const name of [
      "@toonspectrum/studio-project-model",
      "@toonspectrum/studio-format-gateway",
    ]) {
      const resolved = await realpath(requireFromApi.resolve(name));
      assert.ok(resolved.startsWith(`${canonicalRoot}/`));
      const packageJson = JSON.parse(await readFile(
        resolve(root, "node_modules", ...name.split("/"), "package.json"),
        "utf8",
      ));
      assert.equal(packageJson.main, "./index.js");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails instead of staging a missing compiled package", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-runtime-missing-"));
  try {
    await assert.rejects(stageApiWorkspaceRuntime(root), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
