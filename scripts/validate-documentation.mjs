#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config/documentation-authority.json");
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const HANGUL_PATTERN = /[가-힣]/gu;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^)]+)\)/gu;

function normalize(value) {
  return value.split(path.sep).join("/").replace(/^\.\//u, "");
}

function trackedMarkdownFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map(normalize)
    .filter((file) => MARKDOWN_EXTENSIONS.has(path.extname(file)) && existsSync(path.join(ROOT, file)));
}

function markdownTarget(raw) {
  let value = raw.trim();
  if (value.startsWith("<")) {
    const close = value.indexOf(">");
    if (close >= 0) value = value.slice(1, close);
  } else {
    value = value.split(/\s+["']/u, 1)[0];
  }
  return value.trim();
}

function isExternalTarget(value) {
  return value === ""
    || value.startsWith("#")
    || /^(?:https?:|mailto:|tel:|data:|javascript:)/iu.test(value);
}

function relativeTargetExists(sourceFile, target) {
  const clean = target.split("#", 1)[0].split("?", 1)[0];
  if (!clean) return true;
  let decoded;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  const resolved = path.resolve(ROOT, path.dirname(sourceFile), decoded);
  if (!resolved.startsWith(`${ROOT}${path.sep}`) && resolved !== ROOT) return true;
  return existsSync(resolved);
}

function categoryOf(file, config, currentSet, generatedSet, pinnedSet, historicalSet) {
  if (currentSet.has(file)) return "current";
  if (generatedSet.has(file)) return "generated";
  if (pinnedSet.has(file)) return "pinned";
  if (historicalSet.has(file)) return "historical";
  if (config.externalPrefixes.some((prefix) => file.startsWith(prefix))) return "external";
  if (config.historicalPrefixes.some((prefix) => file.startsWith(prefix))) return "historical";
  return "reference";
}

export function validateDocumentation() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (config.version !== 1) throw new Error("documentation authority config version must be 1");

  const failures = [];
  const currentSet = new Set(config.currentDocuments.map(normalize));
  const generatedSet = new Set(config.generatedDocuments.map(normalize));
  const pinnedSet = new Set(config.pinnedEnglishDocuments.map(normalize));
  const historicalSet = new Set((config.historicalDocuments ?? []).map(normalize));

  for (const forbidden of config.forbiddenPaths) {
    if (existsSync(path.join(ROOT, forbidden))) failures.push(`폐기 경로가 다시 생겼습니다: ${forbidden}`);
  }

  for (const file of [...currentSet, ...generatedSet, ...pinnedSet]) {
    const absolute = path.join(ROOT, file);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      failures.push(`문서 원장 파일이 없습니다: ${file}`);
    }
  }

  for (const file of currentSet) {
    const absolute = path.join(ROOT, file);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, "utf8");
    const hangulCount = source.match(HANGUL_PATTERN)?.length ?? 0;
    if (hangulCount < 20) failures.push(`현재 문서의 한국어 본문이 부족합니다: ${file}`);
    for (const stale of config.forbiddenCurrentText) {
      if (source.includes(stale)) failures.push(`현재 문서에 폐기된 표현이 남았습니다: ${file} -> ${stale}`);
    }
  }

  const markdownFiles = trackedMarkdownFiles();
  const inventory = new Map([
    ["current", 0], ["generated", 0], ["pinned", 0],
    ["external", 0], ["historical", 0], ["reference", 0],
  ]);

  for (const file of markdownFiles) {
    const category = categoryOf(file, config, currentSet, generatedSet, pinnedSet, historicalSet);
    inventory.set(category, (inventory.get(category) ?? 0) + 1);
    if (category === "external") continue;
    const source = readFileSync(path.join(ROOT, file), "utf8");
    for (const stale of config.forbiddenAllText ?? []) {
      if (source.includes(stale)) failures.push(`문서 전체에 폐기된 표현이 남았습니다: ${file} -> ${stale}`);
    }
    for (const match of source.matchAll(MARKDOWN_LINK_PATTERN)) {
      const target = markdownTarget(match[1]);
      if (isExternalTarget(target)) continue;
      if (!relativeTargetExists(file, target)) {
        const line = source.slice(0, match.index).split("\n").length;
        failures.push(`깨진 내부 링크: ${file}:${line} -> ${target}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`문서 검증 실패: ${failures.length}건`);
    for (const failure of failures) console.error(` - ${failure}`);
    return { failures, inventory, total: markdownFiles.length };
  }

  const summary = [...inventory.entries()].map(([key, value]) => `${key}=${value}`).join(", ");
  console.log(`문서 검증 통과: ${markdownFiles.length}개 관리 대상 문서 검사 (${summary})`);
  return { failures, inventory, total: markdownFiles.length };
}

const { failures } = validateDocumentation();
if (failures.length > 0) process.exitCode = 1;
