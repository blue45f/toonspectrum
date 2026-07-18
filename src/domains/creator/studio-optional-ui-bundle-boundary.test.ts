import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly dynamicImports: readonly string[];
  readonly source: string;
  readonly valueImports: readonly string[];
}

function moduleEdges(relativePath: string): ModuleEdges {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const dynamicImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.importClause?.isTypeOnly
    ) {
      valueImports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { dynamicImports, source, valueImports };
}

const STUDIO_PAGE_OPTIONAL_MODULES = [
  "./StudioColorPalettePanel",
  "./StudioFloodFillPanel",
  "./StudioHealCloneOverlay",
  "./StudioHistoryBrushOverlay",
  "./StudioIsometricGridOverlay",
  "./StudioLayerMaskOverlay",
  "./StudioPaletteLibraryPanel",
  "./StudioPanelSplitTool",
  "./StudioPerspectiveOverlay",
  "./StudioPuppetWarpOverlay",
] as const;

describe("Studio optional UI bundle boundaries", () => {
  it("keeps optional inspector and canvas-tool surfaces behind analyzable imports", () => {
    const edges = moduleEdges("./StudioPage.tsx");

    for (const specifier of STUDIO_PAGE_OPTIONAL_MODULES) {
      expect(edges.valueImports, `${specifier} must not be a static value import`).not.toContain(specifier);
      expect(
        edges.dynamicImports.filter((candidate) => candidate === specifier),
        `${specifier} must have one literal dynamic import`
      ).toEqual([specifier]);
    }
  });

  it("mounts only active or actually visited image tabs instead of persisted hidden children", () => {
    const source = moduleEdges("./StudioPage.tsx").source;

    for (const tab of ["quick", "fill", "retouch", "mask", "transform"] as const) {
      expect(source).toContain(`shouldMountImageInspectorTab("${tab}") ? (`);
      expect(source).toContain(`hidden={activeImageInspectorTab !== "${tab}"}`);
    }
    expect(source).toContain("activatedImageInspectorTabs.has(tab)");
    expect(source).toContain("next.add(activeImageInspectorTab)");
    expect(source).toContain(">(() => new Set());");
    expect(source).not.toContain("new Set([inspectorLayout.image])");
  });

  it("keeps the heavy workspace manager behind the lightweight intent gate", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const gate = moduleEdges("./StudioWorkspaceMenuGate.tsx");

    expect(page.valueImports).not.toContain("./StudioWorkspaceMenu");
    expect(page.valueImports).toContain("./StudioWorkspaceMenuGate");
    expect(gate.valueImports).not.toContain("./StudioWorkspaceMenu");
    expect(gate.dynamicImports.filter((specifier) => specifier === "./StudioWorkspaceMenu")).toEqual([
      "./StudioWorkspaceMenu",
    ]);
    expect(gate.source).toContain("createStudioIntentLazyLoader<StudioWorkspaceMenuModule>");
    expect(gate.source).toContain("studioWorkspaceMenuLoader.preload()");
  });

  it("uses local passive Suspense boundaries for lazy Konva overlays", () => {
    const source = moduleEdges("./StudioPage.tsx").source;

    for (const component of [
      "StudioPanelSplitOverlay",
      "StudioHealCloneOverlay",
      "StudioHistoryBrushOverlay",
      "StudioPuppetWarpOverlay",
      "StudioLayerMaskOverlay",
      "StudioPerspectiveOverlay",
      "StudioIsometricGridOverlay",
    ] as const) {
      expect(source).toMatch(
        new RegExp(`<Suspense fallback=\\{null\\}>[\\s\\S]{0,700}<${component}`)
      );
    }
  });
});
