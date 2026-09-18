#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_VITEST_MANIFEST_URL = new URL(
  "./ci-required-vitest-targets.txt",
  import.meta.url,
);

const root = fileURLToPath(new URL("../", import.meta.url));
const SAFE_TARGET_PREFIX = /^(?:apps|packages|scripts)\//u;
const GLOB_META = /[*?[\]{}]/u;
const TEST_EXTENSIONS = "{js,jsx,mjs,cjs,ts,tsx,mts,cts}";

export function parseRequiredTargets(source) {
  const targets = source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (targets.length === 0) throw new Error("core Vitest manifest must not be empty");
  if (new Set(targets).size !== targets.length) {
    throw new Error("core Vitest manifest contains duplicate targets");
  }
  if (targets.some((target, index) => target !== [...targets].sort()[index])) {
    throw new Error("core Vitest manifest must remain sorted");
  }
  for (const target of targets) {
    if (
      !SAFE_TARGET_PREFIX.test(target) ||
      target.startsWith("/") ||
      target.includes("\\") ||
      target.split("/").includes("..") ||
      /\s/u.test(target)
    ) {
      throw new Error(`unsafe core Vitest target: ${target}`);
    }
  }
  return targets;
}

export function resolveRequiredTargets(
  targets,
  {
    cwd = root,
    exists = existsSync,
    glob = globSync,
    stat = statSync,
  } = {},
) {
  const resolvedTargets = [];
  const appendMatches = (selector, patterns) => {
    const matches = patterns
      .flatMap((pattern) => glob(pattern, { cwd }))
      .sort((left, right) => left.localeCompare(right, "en"));
    if (matches.length === 0) {
      throw new Error(`core Vitest selector matched no tests: ${selector}`);
    }
    resolvedTargets.push(...matches);
  };

  for (const target of targets) {
    if (GLOB_META.test(target)) {
      appendMatches(target, [target]);
      continue;
    }

    const absoluteTarget = resolve(cwd, target);
    if (!exists(absoluteTarget)) {
      appendMatches(target, [
        `${target}*.test.${TEST_EXTENSIONS}`,
        `${target}*.spec.${TEST_EXTENSIONS}`,
      ]);
      continue;
    }
    if (stat(absoluteTarget).isDirectory()) {
      appendMatches(target, [
        `${target}/**/*.test.${TEST_EXTENSIONS}`,
        `${target}/**/*.spec.${TEST_EXTENSIONS}`,
      ]);
      continue;
    }
    resolvedTargets.push(target);
  }
  return [...new Set(resolvedTargets)]
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function loadRequiredTargets(manifestUrl = CORE_VITEST_MANIFEST_URL) {
  return parseRequiredTargets(readFileSync(manifestUrl, "utf8"));
}

export function buildVitestArgs(targets) {
  return ["exec", "vitest", "run", ...targets];
}

export function runCoreVitest({ cwd = root, manifestUrl = CORE_VITEST_MANIFEST_URL } = {}) {
  const selectors = loadRequiredTargets(manifestUrl);
  const targets = resolveRequiredTargets(selectors, { cwd });
  process.stdout.write(
    `core Vitest — ${selectors.length}개 필수 선택자를 ${targets.length}개 실행 인자로 통합합니다.\n`,
  );
  return spawnSync("pnpm", buildVitestArgs(targets), {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "1" },
    stdio: "inherit",
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runCoreVitest();
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "core Vitest 실행 실패"}\n`,
    );
    process.exitCode = 1;
  }
}
