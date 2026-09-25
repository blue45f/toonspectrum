import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { restoreDocumentationCheckout } from "./restore-documentation-checkout.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const shardRunner = readFileSync(new URL("./ci-core-regression-shards-impl.mjs", import.meta.url), "utf8");
const required = JSON.parse(readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"));
const requiredPortfolio = new Set(
  readFileSync(new URL("./ci-required-vitest-targets.txt", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean),
);

test("runtime follow-up tests and the long-running API artifact remain mandatory", () => {
  assert.match(
    workflow,
    /node scripts\/ci-core-regression-shards\.mjs "\$\{\{ matrix\.shard \}\}"/,
  );
  assert.ok(shardRunner.includes("API follow-up and repository contracts"));
  assert.ok(shardRunner.includes("scripts/api-followup-unit.test.mjs"));
  assert.ok(shardRunner.includes("scripts/api-followup-ci-policy.test.mjs"));
  assert.ok(shardRunner.includes("pnpm run validate:architecture"));
  assert.ok(shardRunner.includes("pnpm run verify:csp"));
  assert.ok(shardRunner.includes("pnpm run verify:toolchain-coverage"));
  assert.doesNotMatch(shardRunner, /continue-on-error|\|\| true/);
  for (const file of required) {
    assert.ok(requiredPortfolio.has(file), `Missing regression from required portfolio: ${file}`);
  }
  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});

test("product 문서 계약 전에 추적 문서와 내부 링크 입력을 복원한다", () => {
  const restoration = workflow.indexOf("      - name: Restore documentation inputs for product contracts\n");
  const execution = workflow.indexOf("      - name: Run semantic regression shard\n");
  assert.ok(restoration >= 0 && execution > restoration);
  assert.match(workflow.slice(restoration, execution), /if: matrix\.shard == 'product'\n\s+run: node scripts\/restore-documentation-checkout\.mjs/u);
});

test("실제 sparse checkout에서 문서 링크만 복원하고 무관한 대형 자산과 깨진 링크는 보존한다", () => {
  const root = mkdtempSync(join(tmpdir(), "documentation-checkout-"));
  const environment = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull,
  };
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env: environment, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const write = (file, contents) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  };
  try {
    git("init", "--quiet");
    write("config/documentation-authority.json", JSON.stringify({
      version: 1, currentDocuments: ["docs/current.md"], generatedDocuments: [], pinnedEnglishDocuments: [],
      externalPrefixes: ["vendor/"], historicalPrefixes: [], forbiddenPaths: [], forbiddenCurrentText: [], forbiddenAllText: [],
    }));
    const assetRoot = "apps/web/public/assets/audit";
    write("docs/current.md", `# 현재 문서\n\n현재 저장소의 문서와 자산 경계를 확인하고 링크 대상 및 검사 입력을 유지하는 한국어 본문입니다.\n\n[상세](./detail.mdx)\n[이미지](<../${assetRoot}/document image.png> "그림")\n[보고서](../${assetRoot}/report.json?download=1#part)\n[디렉터리](../${assetRoot}/models/)\n`);
    write("docs/detail.mdx", "# 상세 문서\n");
    write(`${assetRoot}/README.md`, "# 자산 설명\n");
    write(`${assetRoot}/document image.png`, "linked image");
    write(`${assetRoot}/report.json`, "{}");
    write(`${assetRoot}/unrelated.glb`, Buffer.alloc(1_048_576));
    write(`${assetRoot}/models/large.glb`, Buffer.alloc(1_048_576));
    write("vendor/README.md", `[외부 패키지 자체 링크](../${assetRoot}/vendor-only.glb)\n`);
    write(`${assetRoot}/vendor-only.glb`, Buffer.alloc(1_048_576));
    git("add", ".");
    git("-c", "user.name=Documentation Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
    const staticJob = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
    const sparse = staticJob.match(/ {10}sparse-checkout: \|\n((?: {12}.+\n)+)/u);
    assert.ok(sparse, "static shard sparse-checkout patterns must exist");
    git("sparse-checkout", "set", "--no-cone", ...sparse[1].trim().split("\n").map((line) => line.trim()));
    const preview = restoreDocumentationCheckout(root, { dryRun: true, environment });
    assert.deepEqual(preview.markdown, [`${assetRoot}/README.md`, "docs/current.md", "docs/detail.mdx", "vendor/README.md"]);
    assert.deepEqual(preview.linkedFiles, [`${assetRoot}/document image.png`, `${assetRoot}/report.json`]);
    assert.deepEqual(preview.linkedDirectories, [`${assetRoot}/models`]);
    assert.equal(existsSync(join(root, "docs/current.md")), false, "dry-run must not change checkout");
    assert.deepEqual(restoreDocumentationCheckout(root, { environment }), preview);
    for (const file of [...preview.markdown, ...preview.linkedFiles, ...preview.linkedDirectories]) {
      assert.equal(existsSync(join(root, file)), true, file);
    }
    for (const file of [`${assetRoot}/unrelated.glb`, `${assetRoot}/models/large.glb`, `${assetRoot}/vendor-only.glb`]) {
      assert.equal(existsSync(join(root, file)), false, file);
    }
    const validator = fileURLToPath(new URL("./validate-documentation.mjs", import.meta.url));
    const validate = () => spawnSync(process.execPath, [validator], { cwd: root, env: environment, encoding: "utf8" });
    const valid = validate();
    assert.equal(valid.status, 0, valid.stderr);
    write("docs/broken.md", `[진짜 누락](../${assetRoot}/not-tracked.png)\n`);
    const invalid = validate();
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /깨진 내부 링크: docs\/broken\.md:1/u);
    assert.equal(existsSync(join(root, assetRoot, "not-tracked.png")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
