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

describe("Studio inspector bubble-appearance boundary", () => {
  it("keeps the inspector as the one-way owner of a controlled appearance leaf", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx");
    const leaf = moduleEdges("./StudioInspectorBubbleAppearanceControls.tsx");

    expect(
      inspector.imports.filter(
        (specifier) => specifier === "./StudioInspectorBubbleAppearanceControls"
      )
    ).toEqual(["./StudioInspectorBubbleAppearanceControls"]);
    expect(inspector.source).toContain("<StudioInspectorBubbleAppearanceControls");
    expect(inspector.source).toContain(
      "onPatch={(patch) => patchEl(selected.id, patch as Partial<El>)}"
    );
    expect(leaf.imports).not.toContain("./StudioInspectorAside");
    expect(leaf.imports).not.toContain("./StudioPage");
  });

  it("keeps identity, document mutation, collaboration, and history policy in the parent", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx").source;
    const leaf = moduleEdges("./StudioInspectorBubbleAppearanceControls.tsx").source;

    for (const forbidden of [
      "patchEl(",
      "selected.id",
      "collaboration",
      "crdt",
      "commit(",
      "history",
      "save",
      "useStudio",
    ]) {
      expect(leaf.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(inspector).toContain("patchEl(selected.id");
  });

  it("leaves shape, tail, and anchor geometry outside the appearance leaf", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx").source;
    const leaf = moduleEdges("./StudioInspectorBubbleAppearanceControls.tsx");
    const shapeControls = moduleEdges("./StudioInspectorBubbleShapeControls.tsx");

    expect(inspector).toContain("<StudioInspectorBubbleShapeControls");
    expect(shapeControls.source).toContain("<StudioBubbleShapePanel");
    expect(shapeControls.imports).not.toContain("./StudioInspectorAside");
    expect(shapeControls.imports).not.toContain("./StudioPage");
    expect(inspector).toContain("<StudioBubbleTailControls");
    expect(inspector).toContain("<StudioBubbleAnchorPanel");
    for (const forbiddenImport of [
      "./StudioBubbleShapePanel",
      "./StudioBubbleTailControls",
      "./studio-bubble-custom-shape",
      "./studio-bubble-path",
    ]) {
      expect(leaf.imports).not.toContain(forbiddenImport);
    }
  });

  it("loads optional panels through the neutral lazy surface and stays bounded", () => {
    const inspector = moduleEdges("./StudioInspectorAside.tsx").source;
    const leaf = moduleEdges("./StudioInspectorBubbleAppearanceControls.tsx");

    expect(leaf.imports).toContain("./studio-page-lazy-ui");
    expect(leaf.source).not.toContain("./StudioBubbleAutoShrinkPanel");
    expect(leaf.source).not.toContain("./StudioBubbleStylePresetPanel");
    expect(leaf.source.split("\n").length).toBeLessThanOrEqual(450);
    // 의도적 변경(2026-07-24): auto-color 새 채색 레이어 onApplyNewLayer 배선(3_400 → 3_480).
    // 의도적 변경(2026-07-25): live collaboration overlay & fallback glue (3_500 → 3_600).
    // 의도적 변경(2026-07-27): 공통 inspector interaction policy 배선(3_600 → 3_620).
    // 의도적 변경(2026-07-28): 선택 없는 래스터 도구 복구 경로와 패널 배선(3_620 → 3_960).
    // 의도적 변경(2026-07-29): Paper Worker 경로 정리·잠금 중 취소 배선(3_960 → 4_000).
    expect(inspector.split("\n").length).toBeLessThanOrEqual(4_000);
    expect(leaf.source).not.toContain('"use no memo"');
    expect(leaf.source).not.toMatch(/\b(?:memo|useCallback|useMemo)\s*\(/u);
    expect(leaf.source).toContain(
      "export function StudioInspectorBubbleAppearanceControls("
    );
  });
});
