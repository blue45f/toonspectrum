#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^)]+)\)/gu;

function git(root, args, environment, input) {
  const result = spawnSync("git", args, {
    cwd: root, env: environment, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`문서 checkout Git 명령 실패: ${result.stderr.trim()}`);
  return result.stdout;
}

function restoreFiles(root, files, environment) {
  if (files.length === 0) return;
  const patterns = files.map((file) => `/${file.replace(/[\\*?[\]]/gu, "\\$&").replace(/ $/u, "\\ ")}`);
  git(root, ["sparse-checkout", "add", "--stdin"], environment, `${patterns.join("\n")}\n`);
}

function linkPath(root, source, raw) {
  let value = raw.trim();
  if (value.startsWith("<")) {
    const close = value.indexOf(">");
    if (close >= 0) value = value.slice(1, close);
  } else value = value.split(/\s+["']/u, 1)[0];
  value = value.trim();
  if (!value || value.startsWith("#") || /^(?:https?:|mailto:|tel:|data:|javascript:)/iu.test(value)) return null;
  const clean = value.split("#", 1)[0].split("?", 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
  const resolved = path.resolve(root, path.dirname(source), decoded);
  const relative = path.relative(root, resolved).split(path.sep).join("/");
  return relative && relative !== ".." && !relative.startsWith("../") && !path.isAbsolute(relative) ? relative : null;
}

export function restoreDocumentationCheckout(root = ROOT, { dryRun = false, environment = process.env } = {}) {
  root = path.resolve(root);
  const files = git(root, ["ls-files", "--cached", "-z"], environment).split("\0").filter(Boolean);
  const tracked = new Set(files);
  const markdown = files.filter((file) => /\.mdx?$/u.test(file)).sort();
  const config = JSON.parse(readFileSync(path.join(root, "config/documentation-authority.json"), "utf8"));

  // 먼저 모든 관리 대상 문서를 복원한다. 제외된 artwork 디렉터리 전체를 포함하지 않는다.
  if (!dryRun) restoreFiles(root, markdown, environment);
  const linkedFiles = new Set();
  const linkedDirectories = new Set();
  for (const source of markdown) {
    if (config.externalPrefixes.some((prefix) => source.startsWith(prefix))) continue;
    const absolute = path.join(root, source);
    const contents = existsSync(absolute) ? readFileSync(absolute, "utf8") : git(root, ["show", `:${source}`], environment);
    for (const match of contents.matchAll(MARKDOWN_LINK_PATTERN)) {
      const target = linkPath(root, source, match[1]);
      if (!target) continue;
      if (tracked.has(target)) linkedFiles.add(target);
      else if (files.some((file) => file.startsWith(`${target}/`))) linkedDirectories.add(target);
      // Git에도 없는 링크는 만들지 않는다. 기존 문서 검증이 실제 깨진 링크를 거부한다.
    }
  }
  const targets = [...linkedFiles].filter((file) => !markdown.includes(file)).sort();
  const directories = [...linkedDirectories].sort();
  if (!dryRun) {
    restoreFiles(root, targets, environment);
    // Git의 실제 tree 경로만 복원한다. 디렉터리 링크 때문에 하위 GLB/VRM을 hydrate하지 않는다.
    for (const directory of directories) mkdirSync(path.join(root, directory), { recursive: true });
  }
  return { markdown, linkedFiles: targets, linkedDirectories: directories };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) throw new Error("인자는 --dry-run만 지원합니다.");
    const dryRun = args[0] === "--dry-run";
    const plan = restoreDocumentationCheckout(ROOT, { dryRun });
    console.log(dryRun ? JSON.stringify(plan, null, 2)
      : `문서 checkout 복원: Markdown ${plan.markdown.length}개, 내부 링크 파일 ${plan.linkedFiles.length}개, 디렉터리 경로 ${plan.linkedDirectories.length}개`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "문서 checkout 복원에 실패했습니다.");
    process.exitCode = 1;
  }
}
