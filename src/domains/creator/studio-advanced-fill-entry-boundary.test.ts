import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const pageUrl = new URL("./StudioPage.tsx", import.meta.url);
const source = readFileSync(pageUrl, "utf8");
const file = ts.createSourceFile(
  pageUrl.pathname,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function nestedFunction(name: string): string {
  let match: ts.FunctionDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!match) throw new Error(`Missing nested function ${name}`);
  return (match as ts.FunctionDeclaration).getText(file);
}

describe("Studio advanced fill entry boundary", () => {
  it("keeps every existing document, asset, layer, animation, and reference guard in one target policy", () => {
    const targetPolicy = nestedFunction("advancedFillTargetUnsupportedReason");
    const editor = nestedFunction("StudioCuttoonEditor");

    expect(editor).toContain("const advancedFillDocumentUnsupportedReason =");
    expect(editor).toContain("collaborationDocumentLocked");
    expect(editor).toContain("masterEditMode");
    expect(editor).toContain("pageEditLocked");
    expect(targetPolicy).toContain("advancedFillDocumentUnsupportedReason");
    expect(targetPolicy).toContain("studioWorkAssetDestructiveEditReason(target)");
    expect(targetPolicy).toContain("isEffectivelyLocked(target, groups)");
    expect(targetPolicy).toContain("isEffectivelyHidden(target, groups)");
    expect(targetPolicy).toContain("target.isAnimatedGif");
    expect(targetPolicy).toContain("target.frames?.length");
    expect(targetPolicy).toContain("timelinePlaying");
    expect(targetPolicy).toContain("collectOverlappingStudioFillReferenceLayers(");
    expect(targetPolicy).toContain("advancedFillHasVisibleVectorLineArt");
    expect(targetPolicy).toContain('advancedFillSettings.referenceScope === "reference"');
    expect(targetPolicy).toContain('advancedFillSettings.referenceScope === "all-visible"');
  });

  it("delegates raster ambiguity and vector fallback to the canonical non-mutating entry decision", () => {
    const toggle = nestedFunction("toggleAdvancedFill");
    const editor = nestedFunction("StudioCuttoonEditor");

    expect(source).toContain(
      'import { resolveStudioAdvancedFillEntry } from "./studio-advanced-fill-entry";',
    );
    expect(toggle).toContain("resolveStudioAdvancedFillEntry({");
    expect(toggle).toContain("getRasterUnsupportedReason: advancedFillTargetUnsupportedReason");
    expect(toggle).toContain("vectorInput: currentAdvancedFillVectorInput()");
    expect(toggle).toContain('entry.mode === "auto-select-raster"');
    expect(toggle).toContain('entry.mode === "ambiguous-raster"');
    expect(toggle).toContain('entry.mode === "virtual-vector-fill"');
    expect(toggle).toContain('entry.mode === "unavailable"');
    expect(toggle).toContain("setMarqueeIds([])");
    expect(toggle).toContain("setSelectedId(target.id)");
    expect(toggle).toContain("advancedFillAutoArmTargetRef.current = { targetId: target.id, status: readyStatus }");
    expect(editor).toContain("const pendingAutoArm = advancedFillAutoArmTargetRef.current");
    expect(editor).toContain("if (pendingAutoArm?.targetId === selectedId)");
    expect(editor).toContain("setAdvancedFillVirtualTarget(pendingAutoArm.virtualTarget)");
    expect(editor).toContain("setAdvancedFillStatus(pendingAutoArm.status)");
    expect(toggle).toContain("virtualTarget: entry.target");
    expect(toggle).toContain('selectInspectorRoute({ primary: "properties", image: "fill" }');
    expect(toggle).not.toContain(
      'openInspectorRoute({ primary: "properties", image: "fill" }, null)',
    );
    expect(toggle).toContain("setAdvancedFillActive(true)");
    expect(toggle).toContain("레이어에서 하나를 선택한 뒤 채우기를 다시 누르세요");
    expect(toggle).toContain("flushPendingStrokeCommitsRef.current()");
    expect(toggle).toContain("setAdvancedFillVirtualTarget(entry.target)");
    expect(toggle).toContain("적용 전까지 문서는 바뀌지 않습니다");
    expect(toggle).not.toContain("rasterLayers.length === 0");
    expect(toggle).not.toContain("planStudioAdvancedFillVectorTarget(");
    expect(toggle).not.toContain("현재 페이지에 채울 래스터 이미지가 없어요");
    expect(toggle).not.toContain("setPages(");
    expect(toggle).not.toContain("commit(");
    expect(editor).toContain("const advancedFillEligibleRasterElements = elements.filter(");
    expect(editor).toContain("advancedFillEligibleRasterElements.length === 1");
    expect(editor).toContain("advancedFillHasVisibleVectorLineArt");
    expect(editor).not.toContain(
      "advancedFillRasterLayers.length === 0 && advancedFillHasVisibleVectorLineArt",
    );
  });

  it("routes the quick action through the same toggle and never pre-disables fill", () => {
    const quickAction = nestedFunction("executeQuickAction");
    const disabledStart = source.indexOf("const quickActionsDisabledActions = useMemo");
    const disabledEnd = source.indexOf("// 모바일 한 손 모드", disabledStart);
    const disabledPolicy = source.slice(disabledStart, disabledEnd);

    expect(quickAction).toContain('action !== "advanced-fill"');
    expect(quickAction).toContain('else if (action === "advanced-fill") toggleAdvancedFill()');
    expect(disabledPolicy).not.toContain('disabled.add("advanced-fill")');
  });
});
