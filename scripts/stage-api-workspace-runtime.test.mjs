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

async function compiledProductionContracts(root) {
  for (const name of ["production-workspace", "operation-policy", "creator-publication-integrity"]) {
    await compiledPackage(root, `packages/contracts/src/${name}.js`, `module.exports = { contract: ${JSON.stringify(name)} };`);
  }
}

test("stages workspace packages inside the emitted API boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-runtime-"));
  try {
    await compiledProductionContracts(root);
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
      "packages/core/src/infrastructure-fabric.js",
      '"use strict"; module.exports = { fabric: "federated" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/creator-role.js",
      '"use strict"; module.exports = { creatorRole: "artist" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/creator-resources.js",
      '"use strict"; module.exports = { creatorResources: "shared" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/production/index.js",
      '"use strict"; module.exports = { production: "risk-v2" };\n',
    );
    await compiledPackage(
      root,
      "packages/core/src/infrastructure-fabric.js",
      '"use strict"; module.exports = { infrastructureFabric: "free-only" };\n',
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

    const optionalModelEntries = ["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"];
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
    for (const name of ["production-workspace", "operation-policy", "creator-publication-integrity"]) {
      assert.deepEqual(requireFromApi(`@toonspectrum/contracts/${name}`), { contract: name });
    }
    assert.deepEqual(requireFromApi("@toonspectrum/contracts/security/csrf"), {
      csrf: "ready",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core"), {
      core: "ready",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core/infrastructure-fabric"), {
      fabric: "federated",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core/production"), {
      production: "risk-v2",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core/creator-resources"), {
      creatorResources: "shared",
    });
    assert.deepEqual(requireFromApi("@toonspectrum/core/infrastructure-fabric"), {
      infrastructureFabric: "free-only",
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
    assert.equal(
      corePackageJson.exports["./infrastructure-fabric"],
      "./infrastructure-fabric.js",
    );
    assert.equal(corePackageJson.exports["./creator-role"], "./creator-role.js");
    assert.equal(corePackageJson.exports["./creator-resources"], "./creator-resources.js");
    assert.equal(corePackageJson.exports["./production"], "./production/index.js");
    assert.equal(corePackageJson.exports["./infrastructure-fabric"], "./infrastructure-fabric.js");
    const contractsPackageJson = JSON.parse(await readFile(
      resolve(root, "node_modules", "@toonspectrum", "contracts", "package.json"),
      "utf8",
    ));
    assert.equal(contractsPackageJson.exports["./security/csrf"], "./security/csrf.js");
    assert.equal(
      contractsPackageJson.exports["./creator-publication-integrity"],
      "./creator-publication-integrity.js",
    );
    assert.equal("main" in contractsPackageJson, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails when an exported workspace subpath was not compiled", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-runtime-subpath-missing-"));
  try {
    await compiledProductionContracts(root);
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
      "packages/core/src/infrastructure-fabric.js",
      '"use strict"; module.exports = { fabric: "federated" };\n',
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

test("분산 라우팅의 컴파일된 runtime 계약이 없으면 배포 패키징을 거부한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-fabric-missing-"));
  try {
    await compiledProductionContracts(root);
    await compiledPackage(root, "packages/contracts/src/security/csrf.js", "module.exports = {};\n");
    for (const name of ["index", "creator-role", "production/index", "creator-resources"]) {
      await compiledPackage(root, `packages/core/src/${name}.js`, "module.exports = {};\n");
    }
    await assert.rejects(
      stageApiWorkspaceRuntime(root),
      /packages\/core\/src\/infrastructure-fabric\.js/u,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("session evidence is an explicitly emitted API contract, not an external type-only resolution", async () => {
  const apiConfig = JSON.parse(await readFile(new URL("../apps/api/tsconfig.json", import.meta.url), "utf8"));
  const source = "../../packages/studio-project-model/src/graph/work-session-evidence.ts";
  assert.deepEqual(apiConfig.compilerOptions.paths["@toonspectrum/studio-project-model/work-session-evidence"], [source]);
});

test("API graph subpaths compile from workspace sources instead of type-only package resolution", async () => {
  const config = JSON.parse(await readFile(new URL("../apps/api/tsconfig.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../packages/studio-project-model/package.json", import.meta.url), "utf8"));
  for (const name of ["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"]) {
    assert.deepEqual(config.compilerOptions.paths[`@toonspectrum/studio-project-model/${name}`], [
      `../../packages/studio-project-model/src/graph/${name}.ts`,
    ]);
    assert.equal(manifest.exports[`./${name}`].types, `./src/graph/${name}.ts`);
  }
});

test("fails when a production operating contract was not emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-policy-missing-"));
  try {
    await compiledPackage(root, "packages/contracts/src/security/csrf.js", "module.exports = {};\n");
    await assert.rejects(stageApiWorkspaceRuntime(root), /packages\/contracts\/src\/production-workspace\.js/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
