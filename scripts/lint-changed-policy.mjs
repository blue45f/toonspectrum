import { existsSync } from "node:fs";

export const LINTABLE_EXTENSION = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/u;

const FULL_LINT_EXACT_PATHS = new Set([
  ".eslintignore",
  "eslint.config.mjs",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);

const FULL_LINT_PATH_PATTERNS = [
  /(?:^|\/)package\.json$/u,
  /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u,
  /(?:^|\/)\.eslintrc(?:\.[^/]+)?$/u,
  /^patches\//u,
  /^scripts\/lint-changed(?:-policy)?\.mjs$/u,
];

export function parseChangedFileList(source) {
  const separator = source.includes("\0") ? "\0" : /\r?\n/u;
  return source
    .split(separator)
    .map((file) => file.trim().replace(/^\.\//u, ""))
    .filter(Boolean);
}
export function findFullLintTrigger(files) {
  for (const file of files) {
    if (FULL_LINT_EXACT_PATHS.has(file)) return file;
    if (FULL_LINT_PATH_PATTERNS.some((pattern) => pattern.test(file))) return file;
  }
  return null;
}

export function selectLintableFiles(files, exists = existsSync) {
  return [...new Set(files)]
    .filter((file) => LINTABLE_EXTENSION.test(file) && exists(file))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function buildEslintArgs(
  files,
  {
    fix = false,
    cacheLocation = "node_modules/.cache/eslint/quick/",
  } = {},
) {
  return [
    "exec",
    "eslint",
    "--max-warnings=0",
    "--no-warn-ignored",
    "--cache",
    "--cache-strategy",
    "content",
    "--cache-location",
    cacheLocation,
    ...(fix ? ["--fix"] : []),
    "--",
    ...files,
  ];
}
