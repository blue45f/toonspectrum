import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const LINTABLE_EXTENSION = /\.(?:[cm]?js|tsx?)$/u;
const args = process.argv.slice(2);
const fix = args.includes("--fix");
const staged = args.includes("--staged");
const baseArgument = args.find((argument) => argument.startsWith("--base="));
const base = baseArgument?.slice("--base=".length).trim();

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

const diffArgs = staged
  ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"]
  : base
    ? ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`, "--"]
    : ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"];

const candidates = new Set(gitLines(diffArgs));
if (!staged) {
  for (const file of gitLines(["ls-files", "--others", "--exclude-standard", "-z"])) {
    candidates.add(file);
  }
  if (base) {
    // A branch comparison does not include the developer's current unstaged edits.
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

const files = [...candidates]
  .filter((file) => LINTABLE_EXTENSION.test(file) && existsSync(file))
  .sort((left, right) => left.localeCompare(right, "en"));

if (files.length === 0) {
  process.stdout.write("lint:quick — 검사할 변경 파일이 없습니다.\n");
  process.exit(0);
}

process.stdout.write(`lint:quick — 변경 파일 ${files.length}개를 검사합니다.\n`);
const eslintArgs = [
  "exec",
  "eslint",
  "--max-warnings=0",
  "--cache",
  "--cache-strategy",
  "content",
  "--cache-location",
  "node_modules/.cache/eslint/quick/",
  ...(fix ? ["--fix"] : []),
  "--",
  ...files,
];
const result = spawnSync("pnpm", eslintArgs, {
  cwd: process.cwd(),
  stdio: "inherit",
});
process.exit(result.status ?? 1);
