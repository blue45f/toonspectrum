import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * File-size ratchet for apps/web/src (2026-10-02 도입).
 *
 * 배경: StudioCuttoonEditorHost.tsx 29,642줄처럼 단일 파일이 비대해지면 리뷰·충돌·
 * 도구 타임아웃이 구조적으로 반복된다. 이 래칫은 "현 상태 동결 + 축소만 허용"으로
 * 재발을 막는다.
 *
 * 규칙:
 * - 신규 파일(베이스라인에 없는 파일)은 NEW_FILE_MAX_LINES 줄을 넘을 수 없다.
 * - 베이스라인에 있는 기존 거대 파일은 기록된 줄 수가 천장이라, 그 이상으로
 *   자랄 수 없다. 파일을 줄였으면 같은 변경에서 베이스라인 수치도 함께 낮춰
 *   천장이 다시 올라가지 않게 한다 (studio-host-architecture-ratchet의 관행과 동일).
 * - 테스트 파일(*.test.*, *.spec.*, __tests__/)과 생성 파일(파일명에 generated 포함)은
 *   측정 대상에서 제외한다. 줄 수는 host 래칫과 같은 split("\n").length 기준이다.
 */
const SRC_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const BASELINE_FILE = path.join(
  fileURLToPath(new URL(".", import.meta.url)),
  "file-size-ratchet-baseline.json",
);

const NEW_FILE_MAX_LINES = 1000;

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage", ".vite", "__tests__"]);

function isMeasuredFile(name: string): boolean {
  if (!/\.tsx?$/.test(name)) return false;
  if (/\.(test|spec)\.tsx?$/.test(name)) return false;
  if (name.includes("generated")) return false;
  return true;
}

function collectLineCounts(directory: string, output = new Map<string, number>()): Map<string, number> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectLineCounts(absolutePath, output);
    } else if (isMeasuredFile(entry.name)) {
      const relative = path.relative(SRC_DIR, absolutePath).split(path.sep).join("/");
      output.set(relative, readFileSync(absolutePath, "utf8").split("\n").length);
    }
  }
  return output;
}

describe("file size ratchet", () => {
  it("keeps new files small and freezes legacy giants at their recorded ceilings", () => {
    const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Record<string, number>;
    const violations: string[] = [];
    for (const [relative, lines] of collectLineCounts(SRC_DIR)) {
      const ceiling = baseline[relative] ?? NEW_FILE_MAX_LINES;
      if (lines > ceiling) {
        violations.push(
          baseline[relative] === undefined
            ? `${relative}: ${lines} lines > new-file ceiling ${ceiling}`
            : `${relative}: ${lines} lines > recorded ceiling ${ceiling} (shrink-only)`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("records a baseline ceiling for every currently oversized file", () => {
    const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Record<string, number>;
    const missing: string[] = [];
    for (const [relative, lines] of collectLineCounts(SRC_DIR)) {
      if (lines > NEW_FILE_MAX_LINES && baseline[relative] === undefined) {
        missing.push(`${relative}: ${lines} lines without a recorded ceiling`);
      }
    }
    expect(missing).toEqual([]);
  });
});
