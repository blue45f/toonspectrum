#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  "AGENTS.md",
  "apps/web/AGENTS.md",
  "apps/api/AGENTS.md",
  "apps/admin-web/AGENTS.md",
  "apps/mobile/AGENTS.md",
  "docs/AGENTS.md",
  "scripts/AGENTS.md",
  "crates/AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/toonspectrum.mdc",
  ".opencode/agent/toonspectrum.md",
  ".gitmessage.ko",
  ".husky/prepare-commit-msg",
  ".github/pull_request_template.md",
  "docs/operations/agent-harness.md",
];

const ADAPTER_FILES = [
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/toonspectrum.mdc",
  ".opencode/agent/toonspectrum.md",
];

const REQUIRED_PACKAGE_SCRIPTS = {
  "harness:doctor": "node scripts/agent-harness.mjs doctor",
  "harness:check": "node scripts/agent-harness.mjs check",
  "harness:verify": "node scripts/agent-harness.mjs verify",
  "test:agent-harness": "node --test scripts/agent-harness.test.mjs",
};

function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error) {
    if (allowFailure) return result;
    throw result.error;
  }
  if ((result.status ?? 1) !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function gitLines(args, { allowFailure = false } = {}) {
  const result = run("git", args, { capture: true, allowFailure });
  if ((result.status ?? 1) !== 0) return [];
  return result.stdout.split("\0").filter(Boolean);
}

function hasAnyPrefix(path, prefixes) {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

export function classifyChangedFiles(files) {
  const extensions = new Set(files.map((file) => extname(file).toLowerCase()));
  const manifest = files.some((file) =>
    /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json)$/u.test(file),
  );
  const source = files.some((file) =>
    [".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".rs"].includes(extname(file)),
  );
  const docsOnly = files.length > 0 && files.every((file) =>
    file.endsWith(".md")
    || file.endsWith(".mdc")
    || file === ".gitmessage.ko"
    || file.startsWith("docs/"),
  );
  const needsArchitecture = manifest || files.some((file) =>
    hasAnyPrefix(file, ["apps/", "packages/", "crates/", "config/architecture-"])
    || file.startsWith("scripts/validate-")
    || file === "ARCHITECTURE.md",
  );
  const needsTypecheck = manifest
    || [".ts", ".tsx", ".mts", ".cts"].some((extension) => extensions.has(extension));
  const needsDependencyAudit = files.some((file) =>
    file === "package.json" || file === "pnpm-lock.yaml" || file.endsWith("/package.json"),
  );
  const ui = files.some((file) =>
    file.startsWith("apps/web/") && [".tsx", ".css", ".scss"].includes(extname(file)),
  );
  const api = files.some((file) => file.startsWith("apps/api/"));
  return { api, docsOnly, needsArchitecture, needsDependencyAudit, needsTypecheck, source, ui };
}

export function inspectHarness(root = ROOT) {
  const problems = [];
  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(root, path))) problems.push(`필수 하네스 파일 누락: ${path}`);
  }

  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    for (const [name, expected] of Object.entries(REQUIRED_PACKAGE_SCRIPTS)) {
      if (packageJson.scripts?.[name] !== expected) {
        problems.push(`package.json script 불일치: ${name}`);
      }
    }
  }

  const agentsPath = join(root, "AGENTS.md");
  if (existsSync(agentsPath)) {
    const agents = read(root, "AGENTS.md");
    for (const marker of [
      "<!-- agent-harness:canonical -->",
      "## 2. 언어 및 기록 정책",
      "pnpm harness:verify",
      "## 8. 운영 및 배포 정책",
    ]) {
      if (!agents.includes(marker)) problems.push(`AGENTS.md 기준 누락: ${marker}`);
    }
  }

  for (const path of ADAPTER_FILES) {
    if (existsSync(join(root, path)) && !read(root, path).includes("AGENTS.md")) {
      problems.push(`도구 어댑터가 AGENTS.md를 참조하지 않음: ${path}`);
    }
  }

  const commitlintPath = join(root, "commitlint.config.cjs");
  if (!existsSync(commitlintPath) || !read(root, "commitlint.config.cjs").includes("subject-korean")) {
    problems.push("commitlint 한글 제목 규칙이 연결되지 않음");
  }

  const hookPath = join(root, ".husky/prepare-commit-msg");
  if (existsSync(hookPath) && process.platform !== "win32" && !(statSync(hookPath).mode & 0o111)) {
    problems.push(".husky/prepare-commit-msg 실행 권한 누락");
  }

  const ciPath = join(root, ".github/workflows/ci.yml");
  if (!existsSync(ciPath) || !read(root, ".github/workflows/ci.yml").includes("scripts/agent-harness.test.mjs")) {
    problems.push("CI 사전 검증에 agent-harness 테스트가 연결되지 않음");
  }

  const preCommitPath = join(root, ".husky/pre-commit");
  if (!existsSync(preCommitPath) || !read(root, ".husky/pre-commit").includes("agent-harness.mjs check")) {
    problems.push("pre-commit에 하네스 무결성 검사가 연결되지 않음");
  }

  return problems;
}

export function parseCli(argv) {
  const command = argv[0] ?? "doctor";
  if (!["doctor", "check", "verify"].includes(command)) {
    throw new Error(`알 수 없는 하네스 명령: ${command}`);
  }
  const staged = argv.includes("--staged");
  const full = argv.includes("--full");
  const baseOption = argv.find((argument) => argument.startsWith("--base="));
  if (staged && baseOption) throw new Error("--staged와 --base는 함께 사용할 수 없습니다.");
  return {
    command,
    staged,
    full,
    base: baseOption?.slice("--base=".length) || process.env.HARNESS_BASE || "origin/main",
  };
}

function printProblems(problems) {
  if (problems.length === 0) {
    console.log("에이전트 하네스 무결성 검사 통과");
    return;
  }
  console.error("에이전트 하네스 무결성 검사 실패:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}

function check() {
  const problems = inspectHarness();
  printProblems(problems);
  return problems.length === 0;
}

function doctor() {
  const problems = inspectHarness();
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 24) problems.push(`Node 24 이상이 필요합니다: 현재 ${process.version}`);

  const pnpm = run("pnpm", ["--version"], { capture: true, allowFailure: true });
  if ((pnpm.status ?? 1) !== 0) {
    problems.push("pnpm을 찾지 못했습니다. corepack enable 후 다시 실행하세요.");
  } else {
    const pnpmMajor = Number.parseInt(pnpm.stdout.trim().split(".")[0], 10);
    if (pnpmMajor < 11) problems.push(`pnpm 11 이상이 필요합니다: 현재 ${pnpm.stdout.trim()}`);
  }

  const branch = run("git", ["branch", "--show-current"], { capture: true, allowFailure: true });
  const hooks = run("git", ["config", "--get", "core.hooksPath"], {
    capture: true,
    allowFailure: true,
  });
  const status = gitLines(["status", "--porcelain=v1", "-z"]);

  console.log(`Node: ${process.version}`);
  console.log(`pnpm: ${pnpm.stdout?.trim() || "없음"}`);
  console.log(`브랜치: ${branch.stdout?.trim() || "확인 실패"}`);
  console.log(`작업 트리 변경: ${status.length}개`);
  console.log(`Git hooks: ${hooks.stdout?.trim() || "미설정"}`);
  if (hooks.stdout?.trim() !== ".husky") {
    console.warn("경고: core.hooksPath가 .husky가 아닙니다. pnpm install 또는 pnpm prepare를 실행하세요.");
  }
  printProblems(problems);
}

function collectChangedFiles({ base, staged }) {
  const files = new Set();
  if (staged) {
    for (const file of gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"])) {
      files.add(file);
    }
    return [...files].sort((left, right) => left.localeCompare(right, "en"));
  }

  const baseExists = run("git", ["rev-parse", "--verify", "--quiet", base], {
    capture: true,
    allowFailure: true,
  });
  if ((baseExists.status ?? 1) === 0) {
    for (const file of gitLines(["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`, "--"])) {
      files.add(file);
    }
  }
  for (const file of gitLines(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"])) {
    files.add(file);
  }
  for (const file of gitLines(["ls-files", "--others", "--exclude-standard", "-z"])) {
    files.add(file);
  }
  return [...files].sort((left, right) => left.localeCompare(right, "en"));
}

function verify(options) {
  if (!check()) return;
  run(process.execPath, ["--test", "scripts/agent-harness.test.mjs"]);
  run(process.execPath, ["scripts/verify-pnpm-lockfile.mjs"]);

  const files = collectChangedFiles(options);
  if (files.length === 0) {
    console.log("검사할 변경 파일이 없습니다.");
    return;
  }

  console.log(`변경 파일 ${files.length}개를 기준으로 검증합니다.`);
  const sourceArgument = options.staged ? "--staged" : `--base=${options.base}`;
  run(process.execPath, ["scripts/lint-changed.mjs", sourceArgument]);
  run(process.execPath, ["scripts/secretlint-files.mjs", sourceArgument]);

  const classification = classifyChangedFiles(files);
  if (classification.needsArchitecture) run("pnpm", ["run", "validate:architecture"]);
  if (classification.needsTypecheck) run("pnpm", ["run", "typecheck"]);

  if (options.full) {
    if (classification.source) run("pnpm", ["run", "test:root"]);
    if (classification.needsDependencyAudit) {
      run("pnpm", ["run", "audit:security"]);
      run("pnpm", ["run", "audit:licenses"]);
    }
  }

  if (classification.ui) {
    console.log("추가 확인 필요: UI 변경에 맞는 브라우저·접근성·반응형 검증을 실행하세요.");
  }
  if (classification.api) {
    console.log("추가 확인 필요: API 변경에 맞는 인증·권한·DB 통합 테스트를 실행하세요.");
  }
  if (classification.docsOnly) console.log("문서 전용 변경으로 코드 typecheck를 생략했습니다.");
  console.log("변경 범위 기반 하네스 검증 통과");
}

function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  if (options.command === "doctor") doctor();
  if (options.command === "check") check();
  if (options.command === "verify") verify(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
