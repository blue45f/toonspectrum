import assert from "node:assert/strict";
import test from "node:test";

import {
  ROOT,
  classifyChangedFiles,
  inspectHarness,
  parseCli,
} from "./agent-harness.mjs";

test("저장소 하네스 필수 파일과 연결이 완전하다", () => {
  assert.deepEqual(inspectHarness(ROOT), []);
});

test("문서 전용 변경은 무거운 코드 검증 대상으로 분류하지 않는다", () => {
  const result = classifyChangedFiles(["AGENTS.md", "docs/operations/agent-harness.md"]);
  assert.equal(result.docsOnly, true);
  assert.equal(result.needsTypecheck, false);
  assert.equal(result.ui, false);
});

test("웹 TypeScript 변경은 typecheck와 UI 후속 검증 대상으로 분류한다", () => {
  const result = classifyChangedFiles(["apps/web/src/domains/home/HomePage.tsx"]);
  assert.equal(result.needsArchitecture, true);
  assert.equal(result.needsTypecheck, true);
  assert.equal(result.ui, true);
});

test("의존성 변경은 architecture, typecheck, audit 대상으로 분류한다", () => {
  const result = classifyChangedFiles(["package.json", "pnpm-lock.yaml"]);
  assert.equal(result.needsArchitecture, true);
  assert.equal(result.needsTypecheck, true);
  assert.equal(result.needsDependencyAudit, true);
});

test("CLI 기본값과 상호 배타 옵션을 검증한다", () => {
  assert.deepEqual(parseCli(["verify"]), {
    command: "verify",
    staged: false,
    full: false,
    base: process.env.HARNESS_BASE || "origin/main",
  });
  assert.throws(
    () => parseCli(["verify", "--staged", "--base=origin/main"]),
    /함께 사용할 수 없습니다/u,
  );
});
