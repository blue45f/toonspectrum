import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { stageApiWorkspaceRuntime } from "./stage-api-workspace-runtime.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

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
      "packages/contracts/src/security/csrf.js",
      '"use strict"; module.exports = { csrf: "ready" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/index.js",
      '"use strict"; module.exports = { core: "ready" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/creator-role.js",
      '"use strict"; module.exports = { creatorRole: "artist" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/production/index.js",
      '"use strict"; module.exports = { production: "risk-v2" };\n',
    );
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

    const optionalModelEntries = ["work-session", "work-session-evidence", "world-publication", "world-acoustic", "world-conversation"];
    for (const name of optionalModelEntries) {
      await compiledPackage(root, `packages/studio-project-model/src/graph/${name}.js`, `module.exports = { contract: ${JSON.stringify(name)} };`);
    }
    const compiler = JSON.parse(await readFile(new URL("../apps/api/tsconfig.json", import.meta.url), "utf8"));
    for (const name of optionalModelEntries) {
      assert.deepEqual(compiler.compilerOptions.paths[`@toonspectrum/studio-project-model/${name}`], [`../../packages/studio-project-model/src/graph/${name}.ts`]);
    }
    const staged = await stageApiWorkspaceRuntime(root);
    assert.deepEqual(staged.map((entry) => entry.name), [
      "@toonspectrum/contracts",
      "@toonspectrum/core",
      "@toonspectrum/studio-project-model",
      "@toonspectrum/studio-format-gateway",
    ]);

    const requireFromApi = createRequire(caller);
    assert.deepEqual(requireFromApi("@toonspectrum/contracts/security/csrf"), {
      csrf: "ready",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core"), {
      core: "ready",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core/production"), {
      production: "risk-v2",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/studio-project-model"), {
      model: "v3",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/studio-format-gateway"), {
      gateway: "compatibility",
    });

    for (const name of optionalModelEntries) {
      assert.deepEqual(requireFromApi(`@toonspectrum/studio-project-model/${name}`), { contract: name });
    }
    const canonicalRoot = await realpath(root);
    for (const name of [
      "@toonspectrum/core",
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

    const corePackageJson = JSON.parse(await readFile(
      resolve(root, "node_modules", "@toonspectrum", "core", "package.json"),
      "utf8",
    ));
    assert.equal(corePackageJson.exports["./creator-role"], "./creator-role.js");
    assert.equal(corePackageJson.exports["./production"], "./production/index.js");
    const contractsPackageJson = JSON.parse(await readFile(
      resolve(root, "node_modules", "@toonspectrum", "contracts", "package.json"),
      "utf8",
    ));
    assert.equal(contractsPackageJson.exports["./security/csrf"], "./security/csrf.js");
    assert.equal("main" in contractsPackageJson, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails when an exported workspace subpath was not compiled", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-runtime-subpath-missing-"));
  try {
    await compiledPackage(
      root,
      "packages/contracts/src/security/csrf.js",
      '"use strict"; module.exports = { csrf: "ready" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/index.js",
      '"use strict"; module.exports = { core: "ready" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/creator-role.js",
      '"use strict"; module.exports = { creatorRole: "artist" };\n',
    );
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

    await assert.rejects(
      stageApiWorkspaceRuntime(root),
      /packages\/core\/src\/production\/index\.js/u,
    );
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