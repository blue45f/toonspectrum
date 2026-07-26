import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleShape {
  readonly dynamicImports: readonly string[];
  readonly exportedDeclarations: ReadonlySet<string>;
  readonly runtimeImports: readonly string[];
  readonly source: string;
  readonly topLevelDeclarations: ReadonlySet<string>;
}

function moduleShape(relativePath: string): ModuleShape {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const dynamicImports: string[] = [];
  const exportedDeclarations = new Set<string>();
  const runtimeImports: string[] = [];
  const topLevelDeclarations = new Set<string>();

  function rememberDeclaration(name: string, node: ts.Node): void {
    topLevelDeclarations.add(name);
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      exportedDeclarations.add(name);
    }
  }

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      const hasRuntimeBinding = !clause
        || (
          !clause.isTypeOnly
          && (
            Boolean(clause.name)
            || Boolean(bindings && ts.isNamespaceImport(bindings))
            || Boolean(
              bindings
              && ts.isNamedImports(bindings)
              && bindings.elements.some((specifier) => !specifier.isTypeOnly),
            )
          )
        );
      if (hasRuntimeBinding) runtimeImports.push(statement.moduleSpecifier.text);
    }

    if (
      ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isFunctionDeclaration(statement)
    ) {
      if (statement.name) rememberDeclaration(statement.name.text, statement);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          rememberDeclaration(declaration.name.text, statement);
        }
      }
    }
  }

  function visit(node: ts.Node): void {
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

  return {
    dynamicImports,
    exportedDeclarations,
    runtimeImports,
    source,
    topLevelDeclarations,
  };
}

const OPTIONAL_VIEWPORT_SURFACES = [
  "./StudioAppSettingsPanel",
  "./StudioDialogueBatchPanel",
  "./StudioDialogueTranslatePanel",
  "./StudioFeatureTutorialHub",
  "./StudioFrameAnimationPanel",
  "./StudioHealCloneOverlay",
  "./StudioHistoryBrushOverlay",
  "./StudioHistoryPanel",
  "./StudioLayerMaskOverlay",
  "./StudioMasterPagePanel",
  "./StudioPanelSplitTool",
  "./StudioPuppetWarpOverlay",
  "./StudioQuickMaskOverlay",
  "./StudioShortcutsHelp",
  "./StudioWebGpuCanvas",
] as const;

describe("Studio canvas viewport module boundary", () => {
  it("keeps the core canvas on one static, one-way ownership edge", () => {
    const page = moduleShape("./StudioPage.tsx");
    const viewport = moduleShape("./StudioCanvasViewport.tsx");

    expect(
      page.runtimeImports.filter((specifier) => specifier === "./StudioCanvasViewport"),
    ).toEqual(["./StudioCanvasViewport"]);
    expect(page.dynamicImports).not.toContain("./StudioCanvasViewport");
    expect(viewport.runtimeImports).not.toContain("./StudioPage");
    expect(viewport.dynamicImports).not.toContain("./StudioPage");
    expect(page.source).toContain("<StudioCanvasViewport");
  });

  it("moves the renderer and both public contracts out of the page monolith", () => {
    const page = moduleShape("./StudioPage.tsx");
    const viewport = moduleShape("./StudioCanvasViewport.tsx");

    expect(viewport.exportedDeclarations).toContain("StudioCanvasViewportHandlers");
    expect(viewport.exportedDeclarations).toContain("StudioCanvasViewportProps");
    expect(viewport.exportedDeclarations).toContain("StudioCanvasViewport");
    expect(page.topLevelDeclarations).not.toContain("StudioCanvasViewportHandlers");
    expect(page.topLevelDeclarations).not.toContain("StudioCanvasViewportProps");
    expect(page.topLevelDeclarations).not.toContain("StudioCanvasViewport");
    expect(Buffer.byteLength(viewport.source, "utf8")).toBeLessThan(500_000);
  });

  it("preserves the existing memoized Stage hot-surface contract", () => {
    const page = moduleShape("./StudioPage.tsx");
    const viewport = moduleShape("./StudioCanvasViewport.tsx");

    expect(page.source).toContain(
      "useStudioStableHandlers<StudioCanvasViewportHandlers>({",
    );
    expect(viewport.source).toContain(
      "export const StudioCanvasViewport = memo(function StudioCanvasViewport({",
    );
    expect(viewport.source).toContain('<Profiler id="studio:stage"');
  });

  it("keeps the viewport and right inspector in one desktop row without collapsing canvas height", () => {
    const page = moduleShape("./StudioPage.tsx");
    const viewport = moduleShape("./StudioCanvasViewport.tsx");
    const workspaceMarker = "중앙: 캔버스 + 우측 인스펙터";
    const workspaceIndex = page.source.indexOf(workspaceMarker);
    const viewportIndex = page.source.indexOf("<StudioCanvasViewport", workspaceIndex);
    const pointCommentIndex = page.source.indexOf("{pointCommentComposer ?", viewportIndex);
    const resizeHandleIndex = page.source.indexOf("캔버스 ↔ 속성 패널 너비 스플리터", viewportIndex);
    const inspectorIndex = page.source.indexOf("<LazyStudioInspectorAside", resizeHandleIndex);

    expect(workspaceIndex).toBeGreaterThan(-1);
    expect(
      page.source.slice(workspaceIndex, viewportIndex),
    ).toContain(
      'className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row"',
    );
    expect(viewportIndex).toBeGreaterThan(workspaceIndex);
    expect(pointCommentIndex).toBeGreaterThan(viewportIndex);
    expect(resizeHandleIndex).toBeGreaterThan(pointCommentIndex);
    expect(inspectorIndex).toBeGreaterThan(resizeHandleIndex);
    expect(viewport.source).toContain(
      '"relative min-h-0 min-w-0 flex-1 lg:min-w-[16rem]"',
    );
  });

  it("preserves the neutral optional-UI registry instead of flattening lazy chunks", () => {
    const viewport = moduleShape("./StudioCanvasViewport.tsx");

    expect(
      viewport.runtimeImports.filter((specifier) => specifier === "./studio-page-lazy-ui"),
    ).toEqual(["./studio-page-lazy-ui"]);
    expect(viewport.dynamicImports).toEqual([]);
    for (const specifier of OPTIONAL_VIEWPORT_SURFACES) {
      expect(
        viewport.runtimeImports,
        `${specifier} must stay behind studio-page-lazy-ui`,
      ).not.toContain(specifier);
    }
  });

  it("shares only leaf utilities with the orchestration owner", () => {
    const page = moduleShape("./StudioPage.tsx");
    const viewport = moduleShape("./StudioCanvasViewport.tsx");
    const shared = moduleShape("./studio-canvas-shared-runtime.ts");

    expect(page.runtimeImports).toContain("./studio-canvas-shared-runtime");
    expect(viewport.runtimeImports).toContain("./studio-canvas-shared-runtime");
    expect(shared.runtimeImports).not.toContain("./StudioPage");
    expect(shared.runtimeImports).not.toContain("./StudioCanvasViewport");
    expect(shared.runtimeImports).not.toContain("react");
    expect(shared.runtimeImports).not.toContain("react-konva/lib/ReactKonvaCore");
  });
});
