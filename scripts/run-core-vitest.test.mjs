import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildVitestArgs,
  loadRequiredTargets,
  parseRequiredTargets,
  resolveRequiredTargets,
} from "./run-core-vitest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("the committed core manifest is sorted, unique and substantial", () => {
  const targets = loadRequiredTargets();
  assert.deepEqual(targets, [...targets].sort());
  assert.equal(new Set(targets).size, targets.length);
  assert.ok(targets.length >= 160, "unexpected regression coverage shrink");
});

test("manifest parsing rejects duplicate, unordered and unsafe selectors", () => {
  assert.throws(
    () => parseRequiredTargets("apps/a.test.ts\napps/a.test.ts\n"),
    /duplicate/u,
  );
  assert.throws(
    () => parseRequiredTargets("scripts/z.test.ts\napps/a.test.ts\n"),
    /sorted/u,
  );
  assert.throws(
    () => parseRequiredTargets("apps/../outside.test.ts\n"),
    /unsafe/u,
  );
  assert.throws(
    () => parseRequiredTargets("e2e/outside.test.ts\n"),
    /unsafe/u,
  );
});

test("배포 Worker 테스트 루트를 허용하되 경로 탈출은 차단한다", () => {
  assert.deepEqual(parseRequiredTargets("deploy/cloudflare-analytics/src/index.test.ts\n"),
    ["deploy/cloudflare-analytics/src/index.test.ts"]);
  assert.throws(() => parseRequiredTargets("deploy/../outside.test.ts\n"), /unsafe/u);
});

test("glob expansion is deterministic and deduplicates overlapping selectors", () => {
  const fixture = mkdtempSync(join(tmpdir(), "toon-core-vitest-"));
  try {
    mkdirSync(join(fixture, "apps/web/src"), { recursive: true });
    mkdirSync(join(fixture, "scripts"), { recursive: true });
    writeFileSync(join(fixture, "apps/web/src/a.test.ts"), "export {};\n");
    writeFileSync(join(fixture, "apps/web/src/b.test.ts"), "export {};\n");
    writeFileSync(join(fixture, "scripts/exact.test.mjs"), "export {};\n");

    assert.deepEqual(
      resolveRequiredTargets([
        "apps/web/src/*.test.ts",
        "apps/web/src/a.test.ts",
        "scripts/exact.test.mjs",
      ], { cwd: fixture }),
      [
        "apps/web/src/a.test.ts",
        "apps/web/src/b.test.ts",
        "scripts/exact.test.mjs",
      ],
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("missing selectors fail before Vitest starts", () => {
  assert.throws(
    () => resolveRequiredTargets(["apps/missing.test.ts"], {
      cwd: "/tmp",
      exists: () => false,
    }),
    /selector matched no tests/u,
  );
  assert.throws(
    () => resolveRequiredTargets(["apps/**/*.test.ts"], {
      cwd: "/tmp",
      glob: () => [],
    }),
    /selector matched no tests/u,
  );
});

test("Vitest command construction uses one process for every resolved target", () => {
  assert.deepEqual(
    buildVitestArgs(["apps/a.test.ts", "scripts/b.test.mjs"]),
    ["exec", "vitest", "run", "apps/a.test.ts", "scripts/b.test.mjs"],
  );
});
