import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const VALIDATOR = fileURLToPath(new URL("./validate-documentation.mjs", import.meta.url));

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

function baseConfig(overrides = {}) {
  return {
    version: 1,
    currentDocuments: ["docs/current.md"],
    generatedDocuments: [],
    pinnedEnglishDocuments: [],
    historicalDocuments: [],
    externalPrefixes: [],
    historicalPrefixes: [],
    forbiddenPaths: [],
    forbiddenCurrentText: [],
    forbiddenAllText: [],
    ...overrides,
  };
}

function fixture(t, { config = baseConfig(), files = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "toonspectrum-documentation-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const initialized = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);
  write(root, "config/documentation-authority.json", `${JSON.stringify(config, null, 2)}\n`);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

function validate(root) {
  return spawnSync(process.execPath, [VALIDATOR], {
    cwd: root,
    encoding: "utf8",
  });
}

const KOREAN_BODY = "현재 아키텍처와 저장소 경계를 설명하는 한국어 본문입니다. 변경 책임과 검증 기준을 함께 기록합니다.";

test("커밋 전 신규 문서까지 검사하고 정상 링크를 허용한다", (t) => {
  const root = fixture(t, {
    files: {
      "docs/current.md": `# 현재 문서\n\n${KOREAN_BODY}\n\n[세부 문서](./detail.md)\n`,
      "docs/detail.md": "# 세부 문서\n\n추가 설명입니다.\n",
    },
  });

  const result = validate(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /문서 검증 통과/u);
  assert.match(result.stdout, /2개 관리 대상 문서/u);
});

test("깨진 상대 링크를 파일과 줄 번호로 거부한다", (t) => {
  const root = fixture(t, {
    files: {
      "docs/current.md": `# 현재 문서\n\n${KOREAN_BODY}\n\n[누락](./missing.md)\n`,
    },
  });

  const result = validate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /깨진 내부 링크: docs\/current\.md:5 -> \.\/missing\.md/u);
});

test("폐기 경로가 다시 생기면 실패한다", (t) => {
  const root = fixture(t, {
    config: baseConfig({ forbiddenPaths: ["docs/obsolete.md"] }),
    files: {
      "docs/current.md": `# 현재 문서\n\n${KOREAN_BODY}\n`,
      "docs/obsolete.md": "# 폐기 문서\n",
    },
  });

  const result = validate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /폐기 경로가 다시 생겼습니다: docs\/obsolete\.md/u);
});

test("현재 문서의 한국어 본문과 폐기 표현을 함께 검사한다", (t) => {
  const root = fixture(t, {
    config: baseConfig({ forbiddenCurrentText: ["vercel.json"] }),
    files: {
      "docs/current.md": "# Current architecture\n\nUse vercel.json for deployment.\n",
    },
  });

  const result = validate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /현재 문서의 한국어 본문이 부족합니다/u);
  assert.match(result.stderr, /현재 문서에 폐기된 표현이 남았습니다/u);
});

test("역사 문서에도 폐기된 전역 표현을 허용하지 않는다", (t) => {
  const root = fixture(t, {
    config: baseConfig({
      historicalDocuments: ["docs/history.md"],
      forbiddenAllText: ["docs/obsolete-boundary.md"],
    }),
    files: {
      "docs/current.md": `# 현재 문서\n\n${KOREAN_BODY}\n`,
      "docs/history.md": "# History\n\nSee docs/obsolete-boundary.md for the current design.\n",
    },
  });

  const result = validate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /문서 전체에 폐기된 표현이 남았습니다/u);
});

