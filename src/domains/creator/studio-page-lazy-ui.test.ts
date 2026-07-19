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
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
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

const REPRESENTATIVE_OPTIONAL_SURFACES = [
  "./StudioAiAssistHub",
  "./StudioAppSettingsPanel",
  "./StudioBrushStudio",
  "./StudioColorPalettePanel",
  "./StudioCommentsPanelSession",
  "./StudioFilterDialog",
  "./StudioFloodFillPanel",
  "./StudioFrameAnimationPanel",
  "./StudioImageAdjustmentsPanel",
  "./StudioLayerNavigator",
  "./StudioPanelSplitTool",
  "./StudioPageThumbnails",
  "./StudioQuickStartPanel",
  "./StudioTeamPanel",
  "./StudioWebGpuCanvas",
] as const;

describe("StudioPage optional UI registry", () => {
  it("keeps StudioPage orchestration separate from the optional loader catalog", () => {
    const page = moduleEdges("./StudioPage.tsx");

    expect(page.valueImports).toContain("./studio-page-lazy-ui");
    for (const specifier of REPRESENTATIVE_OPTIONAL_SURFACES) {
      expect(page.valueImports).not.toContain(specifier);
      expect(page.dynamicImports).not.toContain(specifier);
    }
  });

  it("retains literal, statically analyzable lazy boundaries in the registry", () => {
    const registry = moduleEdges("./studio-page-lazy-ui.ts");

    expect(registry.source).not.toContain("import.meta.glob");
    expect(registry.source).toContain("lazyRetry(");
    expect(registry.dynamicImports.length).toBeGreaterThanOrEqual(70);
    for (const specifier of REPRESENTATIVE_OPTIONAL_SURFACES) {
      expect(registry.valueImports).not.toContain(specifier);
      expect(registry.dynamicImports.filter((candidate) => candidate === specifier)).toEqual([
        specifier,
      ]);
    }
  });

  it("keeps shared preload promises in the registry instead of recreating them per render", () => {
    const registry = moduleEdges("./studio-page-lazy-ui.ts").source;

    expect(registry).toContain("studioAssetMenuPanelPromise ??=");
    expect(registry).toContain("studioStockImagePanelPromise ??=");
    expect(registry).toContain("studioIntegrationsSettingsPanelPromise ??=");
    expect(registry).toContain("studioExportMenuPanelPromise ??=");
    expect(registry).toContain("studioColorPopoverPromise ??=");
  });

  it("loads one comments session boundary without a nested panel waterfall", () => {
    const registry = moduleEdges("./studio-page-lazy-ui.ts");
    const session = moduleEdges("./StudioCommentsPanelSession.tsx");

    expect(
      registry.dynamicImports.filter(
        (specifier) => specifier === "./StudioCommentsPanelSession"
      )
    ).toEqual(["./StudioCommentsPanelSession"]);
    expect(registry.dynamicImports).not.toContain("./StudioCommentsPanel");
    expect(registry.valueImports).not.toContain("./StudioCommentsPanelSession");
    expect(
      session.valueImports.filter((specifier) => specifier === "./StudioCommentsPanel")
    ).toEqual(["./StudioCommentsPanel"]);
    expect(session.dynamicImports).toEqual([]);
    expect(session.valueImports).not.toContain("./studio-page-lazy-ui");
  });
});
