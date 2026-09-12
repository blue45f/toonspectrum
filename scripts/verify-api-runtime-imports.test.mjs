import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { runtimeSpecifiers, smokeCompiledCreatorResources, verifyCompiledApiImports } from "./verify-api-runtime-imports.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "api-runtime-imports-"));
  const dist = join(root, "dist");
  mkdirSync(dist);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, source) => {
    const filename = join(root, name);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, source);
    return filename;
  };
  return { root, dist, write };
}

test("finds emitted require calls, including lazy calls, without matching comments or strings", () => {
  assert.deepEqual(runtimeSpecifiers(`
    // require("@toonspectrum/not-executed")
    const example = 'require("@toonspectrum/example")';
    const first = require("./shared");
    const second = require("./shared");
    const lazy = () => require('@toonspectrum/core/server');
    object.require("./unrelated-method");
    require(variable);
  `), ["./shared", "@toonspectrum/core/server"]);
});

test("accepts emitted relative shared modules and ignores third-party tracing", (t) => {
  const { dist, write } = fixture(t);
  write("dist/apps/api/module.js", 'require("../../packages/core/query"); require("@nestjs/common");');
  write("dist/packages/core/query.js", "exports.query = () => 'ok';");
  assert.deepEqual(verifyCompiledApiImports(dist), { filesChecked: 2, importsChecked: 1 });
});

test("rejects an empty build rather than reporting success", (t) => {
  const { dist } = fixture(t);
  assert.throws(() => verifyCompiledApiImports(dist), /no compiled JavaScript/);
});

test("rejects a missing emitted relative module", (t) => {
  const { dist, write } = fixture(t);
  write("dist/module.js", 'require("./missing");');
  assert.throws(() => verifyCompiledApiImports(dist), /cannot resolve \(MODULE_NOT_FOUND\)/);
});

test("rejects the incident alias even when the original TypeScript source exists in CI", (t) => {
  const { dist, write } = fixture(t);
  write("dist/module.js", 'require("@toonspectrum/core/reference-query-language");');
  write("node_modules/@toonspectrum/core/package.json", JSON.stringify({
    name: "@toonspectrum/core",
    exports: { "./reference-query-language": "./src/reference-query-language.ts" },
  }));
  write("node_modules/@toonspectrum/core/src/reference-query-language.ts", "export const query = 1;");
  assert.throws(() => verifyCompiledApiImports(dist), /outside compiled output/);
});

test("rejects the production alias when its exported source was not packaged", (t) => {
  const { dist, write } = fixture(t);
  write("dist/module.js", 'require("@toonspectrum/core/reference-query-language");');
  write("node_modules/@toonspectrum/core/package.json", JSON.stringify({
    name: "@toonspectrum/core",
    exports: { "./reference-query-language": "./src/reference-query-language.ts" },
  }));
  assert.throws(() => verifyCompiledApiImports(dist), /cannot resolve \(MODULE_NOT_FOUND\)/);
});

test("rejects a relative source escape outside Vercel includeFiles", (t) => {
  const { dist, write } = fixture(t);
  write("dist/module.js", 'require("../source/query.js");');
  write("source/query.js", "module.exports = {};");
  assert.throws(() => verifyCompiledApiImports(dist), /outside compiled output/);
});

test("rejects a symlink escape even if its lexical path is inside dist", (t) => {
  const { root, dist, write } = fixture(t);
  write("dist/module.js", 'require("./query.js");');
  const target = write("source/query.js", "module.exports = {};");
  symlinkSync(target, join(root, "dist/query.js"), "file");
  assert.throws(() => verifyCompiledApiImports(dist), /outside compiled output/);
});

test("rejects TypeScript source inside dist too", (t) => {
  const { dist, write } = fixture(t);
  write("dist/module.js", 'require("./query.ts");');
  write("dist/query.ts", "export const query = 1;");
  assert.throws(() => verifyCompiledApiImports(dist), /outside compiled output/);
});

test("native module smoke loads compiled exports without invoking constructors", (t) => {
  const { dist, write } = fixture(t);
  write("dist/apps/api/src/modules/creator-resources/creator-resources.module.js", `
    exports.CreatorResourcesModule = class { constructor() { throw new Error("must not bootstrap"); } };
    exports.CreatorResourcesController = class {};
  `);
  assert.doesNotThrow(() => smokeCompiledCreatorResources(dist));
});

test("native module smoke fails if the runtime dependency cannot load", (t) => {
  const { dist, write } = fixture(t);
  write("dist/apps/api/src/modules/creator-resources/creator-resources.module.js", 'require("./missing");');
  assert.throws(() => smokeCompiledCreatorResources(dist), /Cannot find module/);
});
