import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const all = args.includes("--all");
const staged = args.includes("--staged");
const baseArgument = args.find((argument) => argument.startsWith("--base="));
const base = baseArgument?.slice("--base=".length).trim();
const separator = args.indexOf("--");
const explicitFiles = separator >= 0 ? args.slice(separator + 1) : [];

if ([all, staged, Boolean(base), explicitFiles.length > 0].filter(Boolean).length > 1) {
  process.stderr.write("quality:secrets — --all, --staged, --base와 명시 파일은 함께 사용할 수 없습니다.\n");
  process.exit(2);
}

function gitFiles(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isTextFile(file) {
  if (!existsSync(file)) return false;
  const stat = statSync(file);
  if (!stat.isFile()) return false;
  if (stat.size === 0) return true;

  const fd = openSync(file, "r");
  try {
    const sample = Buffer.allocUnsafe(Math.min(stat.size, 8192));
    const bytesRead = readSync(fd, sample, 0, sample.length, 0);
    return !sample.subarray(0, bytesRead).includes(0);
  } finally {
    closeSync(fd);
  }
}

let candidates;
if (explicitFiles.length > 0) {
  candidates = explicitFiles;
} else if (all) {
  candidates = gitFiles(["ls-files", "-co", "--exclude-standard", "-z"]);
} else if (staged) {
  candidates = gitFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"]);
} else if (base) {
  candidates = gitFiles(["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`, "--"]);
} else {
  candidates = [
    ...gitFiles(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"]),
    ...gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
}

const files = [...new Set(candidates)]
  .filter(isTextFile)
  .sort((left, right) => left.localeCompare(right, "en"));

if (files.length === 0) {
  process.stdout.write("quality:secrets — 검사할 텍스트 파일이 없습니다.\n");
  process.exit(0);
}

process.stdout.write(`quality:secrets — 텍스트 파일 ${files.length}개를 검사합니다.\n`);

const batches = [];
let batch = [];
let batchCharacters = 0;
for (const file of files) {
  if (batch.length >= 500 || batchCharacters + file.length > 300_000) {
    batches.push(batch);
    batch = [];
    batchCharacters = 0;
  }
  batch.push(file);
  batchCharacters += file.length + 1;
}
if (batch.length > 0) batches.push(batch);

for (const [index, currentBatch] of batches.entries()) {
  if (batches.length > 1) {
    process.stdout.write(`quality:secrets — 배치 ${index + 1}/${batches.length}\n`);
  }
  const result = spawnSync(
    "pnpm",
    ["exec", "secretlint", "--no-glob", ...currentBatch],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
