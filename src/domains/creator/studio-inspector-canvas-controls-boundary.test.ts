import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly imports: readonly string[];
  readonly source: string;
}

function moduleEdges(relativePath: string): ModuleEdges {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { imports, source };
}

describe("Studio inspector canvas-controls boundary", () => {
  it("keeps the inspector as the one-way static owner of the controlled canvas leaf", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx");
    const leaf = moduleEdges("./StudioInspectorCanvasControls.tsx");

    expect(
      inspector.imports.filter(
        (specifier) => specifier === "./StudioInspectorCanvasControls"
      )
    ).toEqual(["./StudioInspectorCanvasControls"]);
    expect(inspector.source).toContain("<StudioInspectorCanvasControls");
    expect(leaf.imports).not.toContain("./StudioInspectorAside");
    expect(leaf.imports).not.toContain("./StudioPage");
  });

  it("leaves document mutation, collaboration policy, ids, and shared notices in the parent", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx").source;
    const leaf = moduleEdges("./StudioInspectorCanvasControls.tsx").source;

    for (const forbidden of [
      "collaborationDocumentLocked",
      "regenerateTemplate",
      "setSharedDocumentNotice",
      "commit(",
      "uid(",
    ]) {
      expect(leaf).not.toContain(forbidden);
    }
    expect(inspector).toContain("if (collaborationDocumentLocked) return;");
    expect(inspector).toContain("regenerateTemplate(currentTemplate, nextGutter)");
    expect(inspector).toContain("commit(nextElements);");
    expect(inspector).toContain("setSharedDocumentNotice(null);");
    expect(inspector).toContain("id: uid(),");
  });

  it("keeps the leaf bounded and compatible with the React Compiler", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx").source;
    const leaf = moduleEdges("./StudioInspectorCanvasControls.tsx").source;

    expect(leaf.split("\n").length).toBeLessThanOrEqual(450);
    // 의도적 변경(2026-07-24): 필터 마스크 페인팅 + 자동 채색 힌트 worker onRun 배선
    // (3_300 → 3_380 → 3_400).
    // 의도적 변경(2026-07-24): auto-color 새 채색 레이어 onApplyNewLayer + setSelectedId 배선
    // (3_400 → 3_480).
    // 의도적 변경(2026-07-25): live collaboration overlay & fallback glue (3_500 → 3_600).
    // 의도적 변경(2026-07-27): 공통 inspector interaction policy 배선(3_600 → 3_620).
    // 의도적 변경(2026-07-28): 선택 없는 래스터 도구 복구 경로와 패널 배선(3_620 → 3_960).
    // 의도적 변경(2026-07-29): Paper Worker 경로 정리·잠금 중 취소 배선(3_960 → 4_000).
    expect(inspector.split("\n").length).toBeLessThanOrEqual(4_000);
    expect(leaf).not.toContain('"use no memo"');
    expect(leaf).not.toMatch(/\b(?:memo|useCallback|useMemo)\s*\(/u);
    expect(leaf).toContain("export function StudioInspectorCanvasControls(");
  });
});
