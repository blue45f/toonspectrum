import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  buildEslintArgs,
  findFullLintTrigger,
  parseChangedFileList,
  selectLintableFiles,
} from "./lint-changed-policy.mjs";

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const staged = args.includes("--staged");
const fullOnConfig = args.includes("--full-on-config");
const baseArgument = args.find((argument) => argument.startsWith("--base="));
const filesFromArgument = args.find((argument) => argument.startsWith("--files-from="));
const base = baseArgument?.slice("--base=".length).trim();
const filesFrom = filesFromArgument?.slice("--files-from=".length).trim();

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (staged && fix) {
  fail(
    "lint:quick — --staged와 --fix는 함께 사용할 수 없습니다. " +
    "작업 트리에 --fix를 실행한 뒤 변경을 다시 스테이징하세요.",
  );
}

const explicitSources = [staged, Boolean(base), Boolean(filesFrom)].filter(Boolean).length;
if (explicitSources > 1) {
  fail("lint:quick — --staged, --base, --files-from 중 하나만 사용할 수 있습니다.");
}
function gitLines(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.split("\0").filter(Boolean);
}

let candidates;
if (filesFrom) {
  if (!existsSync(filesFrom)) fail(`lint:quick — 변경 파일 목록이 없습니다: ${filesFrom}`);
  candidates = new Set(parseChangedFileList(readFileSync(filesFrom, "utf8")));
} else {
  let diffArgs;
  if (staged) {
    diffArgs = ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"];
  } else if (base) {
    diffArgs = ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`, "--"];
  } else {
    diffArgs = ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"];
  }
  candidates = new Set(gitLines(diffArgs));
}

if (staged) {
  const worktreeChanges = new Set(gitLines(["diff", "--name-only", "-z", "--"]));
  const partiallyStaged = [...candidates]
    .filter((file) => worktreeChanges.has(file))
    .sort((left, right) => left.localeCompare(right, "en"));
  if (partiallyStaged.length > 0) {
    fail(
      "lint:quick — 부분 스테이징 파일은 작업 트리와 인덱스 내용이 다릅니다:\n" +
      partiallyStaged.map((file) => `  ${file}`).join("\n") +
      "\n커밋 검증에는 lint-staged를 사용하거나 변경을 완전히 스테이징하세요.",
    );
  }
}

if (!staged && !filesFrom) {
  for (const file of gitLines(["ls-files", "--others", "--exclude-standard", "-z"])) {
    candidates.add(file);
  }
  if (base) {
    for (const file of gitLines([
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      "HEAD",
      "--",
    ])) {
      candidates.add(file);
    }
  }
}

const changedFiles = [...candidates].sort((left, right) => left.localeCompare(right, "en"));
const fullLintTrigger = fullOnConfig ? findFullLintTrigger(changedFiles) : null;

if (fullLintTrigger) {
  process.stdout.write(
    `lint:quick — ${fullLintTrigger} 변경으로 전체 strict lint를 실행합니다.\n`,
  );
  const fullArgs = fix
    ? buildEslintArgs(["."], {
        fix: true,
        cacheLocation: "node_modules/.cache/eslint/full/",
      })
    : ["run", "lint:strict"];
  const fullResult = spawnSync("pnpm", fullArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  process.exit(fullResult.status ?? 1);
}

const files = selectLintableFiles(changedFiles);
if (files.length === 0) {
  process.stdout.write("lint:quick — 검사할 변경 파일이 없습니다.\n");
  process.exit(0);
}

process.stdout.write(`lint:quick — 변경 파일 ${files.length}개를 검사합니다.\n`);
const result = spawnSync(
  "pnpm",
  buildEslintArgs(files, {
    fix,
    cacheLocation: process.env.LINT_CACHE_LOCATION || "node_modules/.cache/eslint/quick/",
  }),
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
