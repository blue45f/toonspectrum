import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const sources = [
  "packages/core/src/studio-music.ts",
  "apps/api/src/server/studio-music-core.ts",
  "apps/api/src/modules/studio-music/studio-music.module.ts",
];
let artifact: string | undefined;

afterEach(() => {
  if (artifact) rmSync(artifact, { recursive: true, force: true });
  artifact = undefined;
});

describe("compiled Studio Music package boundary", () => {
  it("resolves both production consumers to the emitted shared contract without workspace sources", () => {
    artifact = mkdtempSync(resolve(tmpdir(), "studio-music-package-"));
    const sharedDependencies: Array<{ consumer: string; specifier: string }> = [];
    for (const source of sources) {
      const output = ts.transpileModule(readFileSync(resolve(ROOT, source), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const filename = resolve(artifact, source.replace(/\.ts$/u, ".js"));
      mkdirSync(dirname(filename), { recursive: true });
      writeFileSync(filename, output);
      if (source.startsWith("apps/api/")) {
        for (const match of output.matchAll(/require\("([^"\n]*studio-music)"\)/gu)) {
          sharedDependencies.push({ consumer: filename, specifier: match[1] });
        }
      }
    }
    expect(sharedDependencies).toHaveLength(2);
    // Plain Node resolution exposes the export-path failure hidden by Vitest's TS aliases.
    const result = execFileSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const { createRequire } = require('node:module');
      const fs = require('node:fs');
      const root = fs.realpathSync(process.argv[1]);
      for (const dependency of JSON.parse(process.argv[2])) {
        const fromConsumer = createRequire(dependency.consumer);
        assert.equal(fromConsumer.resolve(dependency.specifier), root + '/packages/core/src/studio-music.js');
        assert.equal(fromConsumer(dependency.specifier).MUSIC_MAX_BYTES, 1500000);
      }
      const api = require(root + '/apps/api/src/server/studio-music-core.js');
      assert.equal(api.musicStatus({}).reason, 'disabled');
      process.stdout.write('compiled-contract-pass');
    `, artifact, JSON.stringify(sharedDependencies)], {
      cwd: artifact,
      encoding: "utf8",
      env: {},
    });
    expect(result).toBe("compiled-contract-pass");
  });
});
