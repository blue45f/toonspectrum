import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
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

function fixtureEnvironment(environment = process.env) {
  // hook의 GIT_DIR 등은 cwd보다 우선한다. 임시 저장소가 호출자의 공통 config/index를 수정하지 않게 격리한다.
  return {
    ...Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
  };
}

function git(root, args, environment = process.env) {
  const result = spawnSync("git", args, {
    cwd: root, encoding: "utf8", env: fixtureEnvironment(environment),
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t, { config = baseConfig(), files = {}, environment = process.env } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "toonspectrum-documentation-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  git(root, ["init", "--quiet"], environment);
  write(root, "config/documentation-authority.json", `${JSON.stringify(config, null, 2)}\n`);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

function validate(root, environment = process.env) {
  return spawnSync(process.execPath, [VALIDATOR], {
    cwd: root,
    encoding: "utf8",
    env: fixtureEnvironment(environment),
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

for (const category of ["currentDocuments", "generatedDocuments", "pinnedEnglishDocuments", "historicalDocuments"]) {
  for (const installed of [false, true]) {
    test(`의존성 문서 원장 등록을 설치 여부와 관계없이 거부한다 (${category}, installed=${installed})`, (t) => {
      const dependencyPath = installed
        ? "apps/api/node_modules/example/LICENSES.md"
        : "node_modules/.pnpm/example@1.0.0/node_modules/example/LICENSES.md";
      const root = fixture(t, {
        config: baseConfig({ [category]: [dependencyPath] }),
        files: {
          "docs/current.md": `# 현재 문서\n\n${KOREAN_BODY}\n`,
          ".gitignore": "node_modules/\n",
          ...(installed ? { [dependencyPath]: `# 의존성 문서\n\n${KOREAN_BODY}\n` } : {}),
        },
      });

      const result = validate(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /문서 원장에는 의존성 설치 경로를 등록할 수 없습니다/u);
      assert.ok(result.stderr.includes(dependencyPath));
    });
  }
}

for (const fullHookContext of [false, true]) {
  test(`linked worktree hook 환경을 상속해도 호출자 config와 index를 보존한다 (${fullHookContext ? "전체 Git 환경" : "GIT_DIR"})`, (t) => {
    const caller = fixture(t, { files: { "docs/current.md": `# 호출자 문서\n\n${KOREAN_BODY}\n` } });
    git(caller, ["add", "."]);
    git(caller, ["-c", "user.name=Documentation Fixture", "-c", "user.email=fixture@example.invalid",
      "commit", "--quiet", "-m", "fixture"]);
    const linked = path.join(caller, "linked");
    git(caller, ["worktree", "add", "--detach", "--quiet", linked, "HEAD"]);
    const gitDirectory = git(linked, ["rev-parse", "--absolute-git-dir"]);
    const configPath = path.join(caller, ".git/config");
    const indexPath = path.join(gitDirectory, "index");
    const beforeConfig = readFileSync(configPath);
    const beforeIndex = readFileSync(indexPath);
    const hookEnvironment = {
      ...process.env,
      GIT_DIR: gitDirectory,
      ...(fullHookContext ? {
        GIT_COMMON_DIR: path.join(caller, ".git"),
        GIT_WORK_TREE: linked,
        GIT_INDEX_FILE: indexPath,
        GIT_OBJECT_DIRECTORY: path.join(caller, ".git/objects"),
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.bare",
        GIT_CONFIG_VALUE_0: "true",
        GIT_CONFIG_PARAMETERS: "'core.bare=true'",
      } : {}),
    };
    const root = fixture(t, {
      environment: hookEnvironment,
      files: {
        "docs/current.md": `# 임시 문서\n\n${KOREAN_BODY}\n\n[세부 문서](./detail.md)\n`,
        "docs/detail.md": "# 임시 세부 문서\n",
      },
    });
    const result = validate(root, hookEnvironment);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2개 관리 대상 문서/u);
    assert.equal(git(root, ["rev-parse", "--show-toplevel"]), realpathSync(root));
    assert.deepEqual(readFileSync(configPath), beforeConfig);
    assert.deepEqual(readFileSync(indexPath), beforeIndex);
    assert.equal(git(caller, ["config", "--local", "--get", "core.bare"]), "false");
  });
}
