import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

import { stageApiWorkspaceRuntime } from "./stage-api-workspace-runtime.mjs";
import { verifyCompiledApiImports } from "./verify-api-runtime-imports.mjs";

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
    await compiledPackage(root, "packages/contracts/src/studio-live-auth-ticket.js",
      'module.exports = require("./studio-sha256.js");');
    await compiledPackage(root, "packages/contracts/src/studio-sha256.js",
      'module.exports = { ticket: "compiled-contract" };');
    await compiledPackage(root, "packages/contracts/src/creator-resource-workflow.js",
      'module.exports = { workflow: "compiled-contract" };');

    for (const name of ["studio-crdt-raster-ops", "studio-crdt-raster-compaction", "studio-ink-input-contract"]) {
      const source = await readFile(new URL(`../packages/contracts/src/${name}.ts`, import.meta.url), "utf8");
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      await compiledPackage(root, `packages/contracts/src/${name}.js`, outputText);
    }
    await compiledPackage(root, "packages/contracts/src/private-helper.js", "module.exports = {};\n");
    await compiledPackage(root, "packages/core/src/reference-query-language.js", "module.exports = { query: 'ready' };\n");
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
      '"use strict"; require("@toonstudio/contracts/avatar"); require("@toonstudio/contracts/studio-live-auth-ticket");\n',
    );
    await compiledPackage(root, "packages/contracts/src/avatar.js", 'module.exports = require("@toonstudio/contracts/affiliate");\n');
    await compiledPackage(root, "packages/contracts/src/affiliate.js", 'module.exports = { affiliate: "ready" };\n');
    // 위에서 만든 상대 의존성 fixture를 덮어쓰지 않아 실제 전이 의존성 해석도 검증한다.
    await compiledPackage(root, "packages/contracts/src/private-internal.js", "module.exports = {};\n");

    const optionalModelEntries = ["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"];
    for (const name of optionalModelEntries) {
      await compiledPackage(root, `packages/studio-project-model/src/graph/${name}.js`, `module.exports = { contract: ${JSON.stringify(name)} };`);
    }
    const compiler = JSON.parse(await readFile(new URL("../apps/api/tsconfig.json", import.meta.url), "utf8"));
    for (const name of optionalModelEntries) {
      assert.deepEqual(compiler.compilerOptions.paths[`@toonstudio/studio-project-model/${name}`], [`../../packages/studio-project-model/src/graph/${name}.ts`]);
    }
    const staged = await stageApiWorkspaceRuntime(root);
    assert.deepEqual(staged.map((entry) => entry.name), [
      "@toonstudio/contracts",
      "@toonstudio/core",
      "@toonstudio/studio-project-model",
      "@toonstudio/studio-format-gateway",
    ]);

    const requireFromApi = createRequire(caller);
    assert.deepEqual(requireFromApi("@toonstudio/contracts/avatar"), { affiliate: "ready" });
    assert.deepEqual(requireFromApi("@toonstudio/contracts/studio-live-auth-ticket"), { ticket: "compiled-contract" });
    assert.throws(() => requireFromApi("@toonstudio/contracts/private-internal"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    for (const name of ["production-workspace", "operation-policy", "creator-publication-integrity"]) {
      assert.deepEqual(requireFromApi(`@toonstudio/contracts/${name}`), { contract: name });
    }
    assert.deepEqual(requireFromApi("@toonstudio/contracts/studio-live-auth-ticket"), {
      ticket: "compiled-contract",
    });
    assert.deepEqual(requireFromApi("@toonstudio/contracts/creator-resource-workflow"), {
      workflow: "compiled-contract",
    });
    // 공개된 계약만 노출하며, private helper나 미컴파일 계약을 원본 TS로 우회하지 않는다.
    for (const name of ["studio-sha256", "studio-live-lock-resource"]) {
      assert.throws(() => requireFromApi(`@toonstudio/contracts/${name}`), {
        code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
      });
    }
    await writeFile(caller, 'require("@toonstudio/contracts/studio-live-auth-ticket");\nrequire("@toonstudio/contracts/creator-resource-workflow");\n');
    assert.ok(verifyCompiledApiImports(root).importsChecked > 2);
    const validCallerSource = await readFile(caller, "utf8");
    await writeFile(caller, 'require("@toonstudio/contracts/studio-live-lock-resource");\n');
    assert.throws(() => verifyCompiledApiImports(root), /studio-live-lock-resource cannot resolve/u);
    // 거절 검증의 손상 fixture를 복구한 뒤 나머지 정상 배포 경계를 검사한다.
    await writeFile(caller, validCallerSource);
    assert.deepEqual(requireFromApi("@toonstudio/contracts/security/csrf"), {
      csrf: "ready",
    });
    // 실제 이전 소스를 plain Node로 읽어 공개 subpath와 내부 상대 의존성을 함께 검증한다.
    const raster = requireFromApi("@toonstudio/contracts/studio-crdt-raster-ops");
    assert.equal(raster.canonicalStudioRasterJson({ z: 1, a: 2 }), '{"a":2,"z":1}');
    assert.equal(typeof requireFromApi("@toonstudio/contracts/studio-crdt-raster-compaction").compactStudioRasterOperationLog, "function");
    assert.equal(requireFromApi("@toonstudio/contracts/studio-ink-input-contract").isStudioInkInputContractV1(null), false);
    assert.deepEqual(requireFromApi("@toonstudio/core/reference-query-language"), { query: "ready" });
    assert.throws(() => requireFromApi("@toonstudio/contracts/private-helper"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    assert.throws(() => requireFromApi("@toonstudio/contracts/types"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    assert.deepEqual(requireFromApi("@toonstudio/core"), {
      core: "ready",
    });
    assert.deepEqual(requireFromApi("@toonstudio/core/production"), {
      production: "risk-v2",
    });
    assert.deepEqual(requireFromApi("@toonstudio/core/creator-resources"), {
      creatorResources: "shared",
    });
    assert.deepEqual(requireFromApi("@toonstudio/core/infrastructure-fabric"), {
      infrastructureFabric: "free-only",
    });
    assert.deepEqual(requireFromApi("@toonstudio/studio-project-model"), {
      model: "v3",
    });
    assert.deepEqual(requireFromApi("@toonstudio/studio-format-gateway"), {
      gateway: "compatibility",
    });

    for (const name of optionalModelEntries) {
      assert.deepEqual(requireFromApi(`@toonstudio/studio-project-model/${name}`), { contract: name });
    }
    const canonicalRoot = await realpath(root);
    for (const name of [
      "@toonstudio/core",
      "@toonstudio/studio-project-model",
      "@toonstudio/studio-format-gateway",
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
      resolve(root, "node_modules", "@toonstudio", "core", "package.json"),
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
      resolve(root, "node_modules", "@toonstudio", "contracts", "package.json"),
      "utf8",
    ));
    assert.equal(contractsPackageJson.exports["./security/csrf"], "./security/csrf.js");
    assert.equal(
      contractsPackageJson.exports["./creator-publication-integrity"],
      "./creator-publication-integrity.js",
    );
    assert.equal("main" in contractsPackageJson, false);
    assert.equal(contractsPackageJson.exports["./avatar"], "./avatar.js");
    assert.equal(contractsPackageJson.exports["./affiliate"], "./affiliate.js");
    assert.equal(contractsPackageJson.exports["./studio-live-auth-ticket"], "./studio-live-auth-ticket.js");
    assert.equal("./studio-ink-envelope-webcrypto-attestation" in contractsPackageJson.exports, false);
    assert.equal(contractsPackageJson.exports["./studio-crdt-raster-ops"], "./studio-crdt-raster-ops.js");
    assert.equal("./private-helper" in contractsPackageJson.exports, false);
    assert.equal("./types" in contractsPackageJson.exports, false);
    assert.ok(verifyCompiledApiImports(root).importsChecked > 0);
    await writeFile(caller, 'require("@toonstudio/contracts/studio-live-lock-resource");\n');
    assert.throws(
      () => verifyCompiledApiImports(root),
      /studio-live-lock-resource cannot resolve \(ERR_PACKAGE_PATH_NOT_EXPORTED\)/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("이관한 계약을 require하지만 컴파일 출력이 없으면 패키징을 거부한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-contract-missing-"));
  try {
    await compiledProductionContracts(root);
    await compiledPackage(root, "packages/contracts/src/security/csrf.js", "module.exports = {};\n");
    await compiledPackage(root, "apps/api/src/main.js", 'require("@toonstudio/contracts/avatar");\n');
    await assert.rejects(stageApiWorkspaceRuntime(root), /packages\/contracts\/src\/avatar\.js/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("컴파일된 파일이 있어도 정식 exports에 없는 계약을 공개하지 않는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-contract-private-"));
  try {
    await compiledPackage(root, "packages/contracts/src/private-internal.js", "module.exports = {};\n");
    await compiledPackage(root, "apps/api/src/main.js", 'require("@toonstudio/contracts/private-internal");\n');
    await assert.rejects(stageApiWorkspaceRuntime(root), /API 계약 내보내기를 확인할 수 없습니다: @toonstudio\/contracts\/private-internal/u);
  } finally { await rm(root, { recursive: true, force: true }); }
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
  assert.deepEqual(apiConfig.compilerOptions.paths["@toonstudio/studio-project-model/work-session-evidence"], [source]);
});

test("API graph subpaths compile from workspace sources instead of type-only package resolution", async () => {
  const config = JSON.parse(await readFile(new URL("../apps/api/tsconfig.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../packages/studio-project-model/package.json", import.meta.url), "utf8"));
  for (const name of ["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"]) {
    assert.deepEqual(config.compilerOptions.paths[`@toonstudio/studio-project-model/${name}`], [
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


test("API가 소비하지 않는 Web 포함 Core 루트는 강제 emit하지 않고 누락된 실제 루트 참조는 거부한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-api-core-subpaths-"));
  try {
    await compiledProductionContracts(root);
    const entries = [
      "packages/contracts/src/security/csrf.js",
      ...["creator-role", "creator-resources", "infrastructure-fabric", "production/index"].map((name) => `packages/core/src/${name}.js`),
      "packages/studio-project-model/src/index.js",
      "packages/studio-format-gateway/src/index.js",
      ...["work-session", "work-session-evidence", "pinned-review-share", "review-delivery", "review-voice-note", "world-publication", "world-acoustic", "world-conversation"].map((name) => `packages/studio-project-model/src/graph/${name}.js`),
    ];
    for (const entry of entries) await compiledPackage(root, entry, "module.exports = { ready: true };\n");
    const caller = await compiledPackage(root, "apps/api/src/main.js", 'module.exports = require("@toonstudio/core/creator-role");\n');
    await stageApiWorkspaceRuntime(root);
    const core = JSON.parse(await readFile(resolve(root, "node_modules/@toonstudio/core/package.json"), "utf8"));
    assert.equal("main" in core, false);
    assert.equal("." in core.exports, false);
    assert.equal(core.exports["./creator-role"], "./creator-role.js");
    assert.deepEqual(createRequire(caller)("@toonstudio/core/creator-role"), { ready: true });
    assert.ok(verifyCompiledApiImports(root).importsChecked > 0);
    await writeFile(caller, 'require("@toonstudio/core");\n');
    assert.throws(() => verifyCompiledApiImports(root), /@toonstudio\/core cannot resolve/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
