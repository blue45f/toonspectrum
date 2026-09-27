import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { isolatedMarketApiEntryArguments } from "./isolated-market-api.mjs";
import { studioReviewHostWebLaunch, withStudioReviewHostQaRuntime } from "./studio-review-host-qa-runtime.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));

test("기존 source API와 개발 웹 실행을 기본값으로 보존한다", () => {
  assert.deepEqual(isolatedMarketApiEntryArguments(), ["--import", "tsx", "src/main.ts"]);
  const launch = studioReviewHostWebLaunch({});
  assert.equal(launch.mode, "development");
  assert.equal(launch.web.origin, "http://127.0.0.1:5181");
  assert.equal(launch.outDir, null);
  assert.deepEqual(launch.args, ["exec", "vite", "--config", "apps/web/vite.config.ts",
    "--host", "127.0.0.1", "--port", "5181", "--strictPort"]);
});

test("명시적인 preview는 해당 production 빌드와 기존 실제 인증 origin만 선택한다", () => {
  const launch = studioReviewHostWebLaunch({ STUDIO_QA_BASE_URL: "http://127.0.0.1:5173" },
    { webMode: "preview", webOutDir: ".qa/studio-filter-canonical/dist" });
  assert.equal(launch.outDir, resolve(root, ".qa/studio-filter-canonical/dist"));
  assert.deepEqual(launch.args, ["exec", "vite", "preview", "--config", "apps/web/vite.config.ts",
    "--host", "127.0.0.1", "--port", "5173", "--strictPort", "--outDir", launch.outDir]);
  assert.deepEqual(isolatedMarketApiEntryArguments("compiled"), ["dist/apps/api/src/main.js"]);
});

test("임의 origin·실행 방식·모호한 빌드 입력을 거절한다", () => {
  for (const origin of ["https://example.test", "http://127.0.0.1:9999", "http://localhost:5173",
    "http://127.0.0.1:5173/studio", "http://127.0.0.1:5173/?token=value"]) {
    assert.throws(() => studioReviewHostWebLaunch({ STUDIO_QA_BASE_URL: origin }));
  }
  assert.throws(() => studioReviewHostWebLaunch({}, { webMode: "preview" }), /webOutDir/u);
  assert.throws(() => studioReviewHostWebLaunch({}, { webOutDir: "dist" }), /preview/u);
  assert.throws(() => studioReviewHostWebLaunch({}, { webMode: "external" }), /development/u);
  assert.throws(() => isolatedMarketApiEntryArguments("arbitrary.js"), /source/u);
});

test("빌드가 없으면 API나 DB를 시작하기 전에 실패한다", async () => {
  let ran = false;
  await assert.rejects(withStudioReviewHostQaRuntime({}, async () => { ran = true; },
    { webMode: "preview", webOutDir: `.qa/nonexistent-filter-build-${process.pid}` }), /index\.html/u);
  assert.equal(ran, false);
});

test("필터 CI는 정적 거절과 임시 정본 production 검증을 모두 실행한다", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/studio-brush-filter-stability.yml", import.meta.url), "utf8"));
  const browser = workflow.jobs.browser;
  assert.deepEqual(browser.strategy.matrix.suite, ["filters", "desktop", "long", "shapes", "mobile", "durability", "source"]);
  assert.equal(browser.services.postgres.image, "${{ matrix.suite == 'filters' && 'postgres:16-alpine' || '' }}");
  assert.equal(browser.services.postgres.env.POSTGRES_DB, "studio_filter_test");
  const denial = browser.steps.find((step) => step.env?.TOONSPECTRUM_FILTER_DIALOG_EXPECT_DENIAL === "1");
  const canonical = browser.steps.find((step) => step.env?.TOONSPECTRUM_FILTER_DIALOG_AUTHENTICATED === "1");
  const preparation = browser.steps.find((step) => step.env?.VITE_STUDIO_LIVE_ORIGIN);
  for (const step of [denial, canonical, preparation]) {
    assert.equal(step?.if, "matrix.suite == 'filters'");
    assert.notEqual(step["continue-on-error"], true);
  }
  assert.equal(denial.run, "pnpm run verify:studio-filter-dialog");
  assert.equal(canonical.run, "pnpm run verify:studio-filter-dialog");
  assert.equal(canonical.env.TOONSPECTRUM_FILTER_DIALOG_SURVEY, "1");
  assert.equal(canonical.env.TOONSPECTRUM_FILTER_DIALOG_ROUNDS, "3");
  assert.equal(canonical.env.STUDIO_QA_BASE_URL, preparation.env.VITE_STUDIO_LIVE_ORIGIN);
  assert.equal(canonical.env.TEST_DATABASE_URL, preparation.env.TEST_DATABASE_URL);
  assert.match(preparation.run, /pnpm --filter @webtoon-nest\/api build/u);
  assert.match(preparation.run, /node scripts\/prepare-studio-review-test-db\.mjs/u);
  assert.match(preparation.run, /pnpm run prebuild/u);
  assert.equal(canonical.env.STUDIO_QA_WEB_OUT_DIR, ".qa/studio-filter-canonical/dist");
  assert.notEqual(canonical.env.TOONSPECTRUM_FILTER_DIALOG_VERIFY_DIR, denial.env.TOONSPECTRUM_FILTER_DIALOG_VERIFY_DIR);
  assert(browser.steps.indexOf(denial) < browser.steps.indexOf(preparation));
  assert(browser.steps.indexOf(preparation) < browser.steps.indexOf(canonical));
  assert(workflow.jobs.build.steps.some((step) => step.run === "pnpm run build:bundle" && !step.env?.VITE_STUDIO_LIVE_ORIGIN));
});

test("CI 셸은 Vite·license·CSP·manifest를 같은 절대 QA 빌드 경로로 해석한다", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/studio-brush-filter-stability.yml", import.meta.url), "utf8"));
  const command = workflow.jobs.browser.steps.find((step) => step.env?.VITE_STUDIO_LIVE_ORIGIN).run;
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "studio-filter-ci-paths-")));
  const bin = join(directory, "bin"), calls = join(directory, "calls.jsonl");
  mkdirSync(bin);
  const stub = `#!${process.execPath}\nconst fs = require('node:fs'); const path = require('node:path');
    const args = process.argv.slice(2);
    fs.appendFileSync(process.env.QA_CALLS, JSON.stringify({ name: path.basename(process.argv[1]), args }) + '\\n');
    const at = args.indexOf('--outDir');
    if (at >= 0) { fs.mkdirSync(path.join(args[at + 1], '.vite'), { recursive: true });
      fs.writeFileSync(path.join(args[at + 1], '.vite/manifest.json'), '{}'); }
  `;
  try {
    for (const name of ["pnpm", "node"]) writeFileSync(join(bin, name), stub, { mode: 0o755 });
    const result = spawnSync("bash", ["-c", command], {
      cwd: directory, env: { PATH: `${bin}:${process.env.PATH}`, QA_CALLS: calls }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const invocations = readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const build = invocations.find(({ args }) => args[0] === "exec" && args[1] === "vite");
    const outDir = build.args[build.args.indexOf("--outDir") + 1];
    assert(isAbsolute(outDir));
    assert.equal(outDir, join(directory, ".qa/studio-filter-canonical/dist"));
    assert.deepEqual(invocations.find(({ args }) => args[0] === "scripts/generate-third-party-notices.mjs").args,
      ["scripts/generate-third-party-notices.mjs", "--output", join(outDir, "legal/THIRD_PARTY_NOTICES.generated.md")]);
    assert.deepEqual(invocations.find(({ args }) => args[0] === "scripts/verify-static-csp.mjs").args,
      ["scripts/verify-static-csp.mjs", join(outDir, "index.html")]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("실제 API·하네스·정본 연결 변경도 PR와 main 필터 검증을 재실행한다", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/studio-brush-filter-stability.yml", import.meta.url), "utf8"));
  for (const event of ["pull_request", "push"]) {
    for (const file of ["scripts/studio-review-host-qa-runtime.mjs", "scripts/studio-review-host-qa-runtime.test.mjs",
      "scripts/studio-review-host-steps.ts", "scripts/isolated-market-api.mjs", "scripts/isolated-market-api.test.ts",
      "scripts/prepare-studio-review-test-db.mjs", "apps/api/src/main.ts", "apps/api/src/config/cors.ts",
      "apps/web/src/domains/creator/live/studio-live-socket-endpoint.ts", "apps/web/vite.config.ts"]) {
      assert(workflow.on[event].paths.some((pattern) => matchesGlob(file, pattern)), `${event}: ${file}`);
    }
  }
});
