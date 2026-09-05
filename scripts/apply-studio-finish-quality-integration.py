#!/usr/bin/env python3
"""Integrate additive finishing checks into the hardened quality center atomically."""
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
# Legacy queued workflows must not publish their own substitute `core` status.
if os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_WORKFLOW") != "Prepare and validate Studio quality inspection":
    raise RuntimeError("Use the reviewed quality preparation workflow; legacy landing is disabled")

pending: dict[Path, str] = {}

def source(relative: str) -> str:
    p = ROOT / relative
    return pending.get(p, p.read_text(encoding="utf-8"))

def replace(relative: str, old: str, new: str) -> None:
    text = source(relative)
    if new in text:
        return
    if text.count(old) != 1:
        raise RuntimeError(f"{relative}: expected one current-source anchor: {old[:100]!r}")
    pending[ROOT / relative] = text.replace(old, new, 1)

base = "src/domains/creator/"
panel = base + "StudioContinuityPanel.tsx"
core = base + "studio-quality-inspection.ts"
stack = base + "StudioLazyPanelStack.tsx"
finish = base + "studio-finish-quality.ts"
replace(core, '  | "CONTINUITY_ISSUE"', '  | "FINISH_QUALITY_FINDING"\n  | "CONTINUITY_ISSUE"')
replace(core, '"pages" | "continuityIssues" | "openCommentCount"', '"pages" | "continuityIssues" | "openCommentCount" | "supplementalIssues"')
replace(core, '      openCommentCount: input.openCommentCount ?? 0,', '      openCommentCount: input.openCommentCount ?? 0,\n      supplementalIssues: input.supplementalIssues ?? [],')
replace(panel, 'import type { StudioContinuityIssue }', '''import { inspectStudioQualityFinishSupplement } from "./studio-quality-finish-bridge";
import { StudioFinishQualityView } from "./StudioFinishQualityView";

import type { StudioCommentsDocument } from "./studio-comments";
import type { StudioContinuityIssue }''')
replace(panel, '  pages?: readonly PageState[];', '''  pages?: readonly PageState[];
  /** Host-owned metadata enables additive rules without replacing legacy inspection. */
  finishDocumentTitle?: string;
  finishComments?: StudioCommentsDocument;''')
replace(panel, '  pages = EMPTY_PAGES,', '  pages = EMPTY_PAGES,\n  finishDocumentTitle,\n  finishComments,')
replace(panel, '  const report = useMemo(', '''  const finishSupplement = useMemo(() =>
    finishDocumentTitle === undefined && finishComments === undefined ? null :
      inspectStudioQualityFinishSupplement({
        pages: scanInput.pages, documentTitle: finishDocumentTitle, comments: finishComments,
      }),
    [finishComments, finishDocumentTitle, scanInput]
  );
  const report = useMemo(''')
replace(panel, '''        supplementalIssues:
          rasterInspection?.status === "complete" ? rasterInspection.issues : [],''', '''        supplementalIssues: [
          ...(finishSupplement?.issues ?? []),
          ...(rasterInspection?.status === "complete" ? rasterInspection.issues : []),
        ],''')
replace(panel, '[issues, openCommentCount, scanInput, rasterInspection]', '[issues, openCommentCount, scanInput, rasterInspection, finishSupplement]')
replace(panel, '        <div className="min-h-0 flex-1 overflow-y-auto">', '''        <div className="min-h-0 flex-1 overflow-y-auto">
          {finishSupplement?.detail ? (
            <details className="border-b border-line px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-fg">
                추가 마감 검사 상세 · 통합 판정은 검사 요약 기준
              </summary>
              <StudioFinishQualityView
                result={finishSupplement.detail}
                onSelectIssue={onSelectTarget ? (issue) => onSelectTarget({
                  pageId: issue.pageId, elementId: issue.elementId,
                }) : undefined}
                onDownloadReport={() => downloadReport(report, acknowledgedIssueIds, completedManualChecks, documentKey)}
              />
            </details>
          ) : null}''')
replace(stack, '            issues={continuityIssues}', '            issues={continuityIssues}\n            finishDocumentTitle={title}\n            finishComments={studioComments}')
if 'if (target.pageId && !setCurrentPageId(target.pageId)) return;' not in source(stack):
    raise RuntimeError("Guarded navigation prerequisite missing")
replace(finish, r'const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;', '''function hasControlCharacter(text: string): boolean {
  return Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}''')
replace(finish, 'CONTROL_CHARACTER_PATTERN.test(text)', 'hasControlCharacter(text)')

PAYLOADS = {
"studio-quality-finish-bridge.ts": '''/** Additional finishing rules join the canonical issue and review-receipt model. */
import { inspectStudioFinishQuality } from "./studio-finish-quality";
import { createStudioQualityIssue } from "./studio-quality-inspection";

import type { StudioFinishQualityInput, StudioFinishQualityResult, StudioFinishQualityIssueCode } from "./studio-finish-quality";
import type { StudioQualityCategory, StudioQualityIssue } from "./studio-quality-inspection";

// Preserve canonical IDs/severity for geometry, fitting, decoding and approval checks.
const ADDITIONAL_CODES: ReadonlySet<StudioFinishQualityIssueCode> = new Set([
  "DOCUMENT_TITLE_MISSING", "PAGE_LOCKED_BEFORE_APPROVAL", "PAGE_REVIEW_ASSIGNEE_MISSING",
  "GROUP_ID_MISSING", "ELEMENT_OPACITY_INVALID", "VISIBLE_PRODUCTION_GUIDE",
  "DIALOGUE_PLACEHOLDER", "DIALOGUE_CONTROL_CHARACTER", "ANIMATION_FRAMES_EMPTY",
  "ANIMATION_SOURCE_MISMATCH", "ANIMATION_MODEL_CONFLICT", "STROKE_WIDTH_INVALID",
  "STROKE_SAMPLE_COUNT_MISMATCH", "COMMENT_PAGE_MISSING", "COMMENT_TARGET_MISSING",
  "COMMENT_POINT_INVALID",
]);
const CATEGORY: Readonly<Record<StudioFinishQualityResult["issues"][number]["category"], StudioQualityCategory>> = {
  document: "document", page: "document", review: "workflow", layer: "layer",
  dialogue: "lettering", image: "asset", animation: "asset", stroke: "document", comments: "workflow",
};
export interface StudioQualityFinishBridgeResult {
  readonly detail: StudioFinishQualityResult | null;
  readonly issues: readonly StudioQualityIssue[];
}

/** Exceptions and incomplete coverage are findings, never a successful inspection. */
export function inspectStudioQualityFinishSupplement(
  input: StudioFinishQualityInput,
  inspect: typeof inspectStudioFinishQuality = inspectStudioFinishQuality
): StudioQualityFinishBridgeResult {
  try {
    const detail = inspect(input);
    const issues: StudioQualityIssue[] = detail.issues
      .filter((issue) => ADDITIONAL_CODES.has(issue.code))
      .map((issue) => createStudioQualityIssue({
        code: "FINISH_QUALITY_FINDING",
        severity: issue.severity === "blocker" ? "blocking" : issue.severity === "info" ? "review" : issue.severity,
        category: CATEGORY[issue.category], title: issue.title, message: issue.message,
        remediation: "해당 위치와 세부 검사 근거를 확인한 뒤 수정하거나 의도된 상태인지 판단하세요.",
        pageId: issue.pageId, pageIndex: issue.pageIndex, elementId: issue.elementId,
        idSuffix: issue.fingerprint,
        evidence: { ...issue.evidence, sourceCode: issue.code },
      }));
    if (detail.truncated) issues.push(createStudioQualityIssue({
      code: "FINISH_QUALITY_FINDING", severity: "error", category: "document",
      title: "추가 마감 검사 표시 한도 도달", message: "모든 문제의 상세 결과를 확인하지 못했습니다.",
      remediation: "표시된 문제를 수정하고 다시 검사하세요.", idSuffix: "truncated",
    }));
    return { detail, issues };
  } catch {
    return { detail: null, issues: [createStudioQualityIssue({
      code: "FINISH_QUALITY_FINDING", severity: "blocking", category: "document",
      title: "추가 마감 검사 실행 실패", message: "원고 데이터 또는 측정 환경 때문에 추가 검사를 완료하지 못했습니다.",
      remediation: "문서 무결성 문제를 먼저 수정하고 다시 검사하세요. 실패는 통과로 처리되지 않습니다.",
      idSuffix: "scan-failed",
    })] };
  }
}
''',
"studio-quality-finish-bridge.test.ts": '''import { describe, expect, it } from "vitest";

import { inspectStudioQuality } from "./studio-quality-inspection";
import { inspectStudioQualityFinishSupplement } from "./studio-quality-finish-bridge";

import type { StudioFinishQualityResult, StudioFinishQualityIssue } from "./studio-finish-quality";

const input = { documentTitle: "검사", pages: [] };
function report(issues: readonly StudioFinishQualityIssue[], truncated = false): StudioFinishQualityResult {
  return { version: 1, status: "needs-work", score: 50, canExport: false, readyForFinalReview: false,
    checkedPageCount: 0, checkedElementCount: 0, checkedDialogueCount: 0, checkedImageCount: 0,
    checkedStrokeCount: 0, openCommentCount: 0,
    counts: { blocker: 0, error: issues.length, warning: 0, info: 0, total: issues.length }, issues, truncated };
}
function issue(code: StudioFinishQualityIssue["code"]): StudioFinishQualityIssue {
  return { id: code, fingerprint: code, code, severity: "error", category: "dialogue",
    title: code, message: "원고 확인", pageId: "p", elementId: "e" };
}
describe("finishing findings in the canonical quality center", () => {
  it("retains unique findings without double-counting existing bubble errors", () => {
    const detail = report([issue("DIALOGUE_PLACEHOLDER"), issue("BUBBLE_TEXT_OVERFLOW")]);
    const result = inspectStudioQualityFinishSupplement(input, () => detail);
    expect(result.detail).toBe(detail);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: "error", pageId: "p", elementId: "e",
      evidence: { sourceCode: "DIALOGUE_PLACEHOLDER" } });
    expect(inspectStudioQualityFinishSupplement(input, () => detail).issues[0]?.id).toBe(result.issues[0]?.id);
  });
  it("fails closed when the additional inspector throws", () => {
    const result = inspectStudioQualityFinishSupplement(input, () => { throw new Error("private payload"); });
    expect(result.detail).toBeNull();
    expect(result.issues[0]?.severity).toBe("blocking");
    expect(JSON.stringify(result)).not.toContain("private payload");
    expect(inspectStudioQuality({ pages: [], supplementalIssues: result.issues }).canFinalize).toBe(false);
  });
  it("does not acknowledge away truncated additional results", () => {
    expect(inspectStudioQualityFinishSupplement(input, () => report([], true)).issues)
      .toEqual([expect.objectContaining({ severity: "error" })]);
  });
  it("invalidates receipts when additional finding evidence changes", () => {
    const first = inspectStudioQualityFinishSupplement(input, () => report([issue("DIALOGUE_PLACEHOLDER")]));
    const second = first.issues.map((finding) => ({ ...finding, evidence: { sourceCode: "changed" } }));
    expect(inspectStudioQuality({ pages: [], supplementalIssues: first.issues }).revisionKey)
      .not.toBe(inspectStudioQuality({ pages: [], supplementalIssues: second }).revisionKey);
  });
});
''',
"studio-finish-quality-integration.test.ts": '''import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), "src/domains/creator", path), "utf8");
describe("Studio finish quality integration", () => {
  it("joins the existing lazy quality center rather than replacing it", () => {
    const panel = source("StudioContinuityPanel.tsx");
    const stack = source("StudioLazyPanelStack.tsx");
    expect(panel).toContain('from "./StudioFinishQualityView"');
    expect(panel).toContain("inspectStudioQualityFinishSupplement");
    expect(panel).toContain("...(finishSupplement?.issues ?? [])");
    expect(panel).toContain("inspectStudioQuality({");
    expect(stack).toContain("finishDocumentTitle={title}");
    expect(stack).toContain("finishComments={studioComments}");
    expect(stack).toContain("onSelectTarget");
    expect(stack).toContain("if (target.pageId && !setCurrentPageId(target.pageId)) return;");
  });
  it("retains stable identity and the broader accessible label", () => {
    const actions = source("StudioProjectReviewActions.tsx");
    expect(actions).toContain('id: "continuity"');
    expect(actions).toContain('label: "마감·품질 검사"');
    expect(actions).toContain('onSelect: handlers.openContinuityCheck');
  });
  it("includes supplemental evidence in review-receipt invalidation", () => {
    expect(source("studio-quality-inspection.ts")).toContain("supplementalIssues: input.supplementalIssues ?? []");
  });
});
''',
}
for name, content in PAYLOADS.items():
    pending[ROOT / base / name] = content
required = {
    panel: ["inspectStudioQualityFinishSupplement", "...(finishSupplement?.issues ?? [])", "finishSupplement.detail"],
    core: ['"FINISH_QUALITY_FINDING"', "supplementalIssues: input.supplementalIssues ?? []"],
    stack: ["finishComments={studioComments}", "finishDocumentTitle={title}"],
    finish: ["hasControlCharacter(text)"],
}
for relative, markers in required.items():
    text = source(relative)
    for marker in markers:
        if marker not in text:
            raise RuntimeError(f"Incomplete integration: {relative}: {marker}")
changed = [path for path, text in pending.items() if not path.exists() or path.read_text(encoding="utf-8") != text]
if "--check" in sys.argv:
    if changed:
        raise RuntimeError("Product integration has not been applied: " + ", ".join(str(p.relative_to(ROOT)) for p in changed))
else:
    for path in changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(pending[path], encoding="utf-8")
print(f"Quality integration verified; changed files: {len(changed)}")
