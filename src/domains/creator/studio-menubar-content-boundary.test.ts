import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly allImports: readonly string[];
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
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      allImports.push(node.moduleSpecifier.text);
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const hasRuntimeValue = !clause || (
        !clause.isTypeOnly
        && (
          Boolean(clause.name)
          || Boolean(namedBindings && ts.isNamespaceImport(namedBindings))
          || Boolean(
            namedBindings
            && ts.isNamedImports(namedBindings)
            && namedBindings.elements.some((specifier) => !specifier.isTypeOnly)
          )
        )
      );
      if (hasRuntimeValue) valueImports.push(node.moduleSpecifier.text);
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
  return { allImports, dynamicImports, source, valueImports };
}

describe("Studio menubar ownership boundary", () => {
  it("keeps StudioPage as the single lazy parent and forbids a reverse dependency", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const menubar = moduleEdges("./StudioMenubarContent.tsx");

    expect(
      page.valueImports.filter((specifier) => specifier === "./StudioMenubarContent")
    ).toEqual([]);
    expect(
      page.dynamicImports.filter((specifier) => specifier === "./StudioMenubarContent")
    ).toEqual(["./StudioMenubarContent"]);
    expect(page.source.match(/<LazyStudioMenubarContent\b/g)).toHaveLength(1);
    expect(page.source).toContain('data-studio-menubar-loading="true"');
    expect(page.source).not.toContain("interface StudioMenubarContentProps");
    expect(page.source).not.toContain("interface StudioMenubarContentHandlers");
    expect(menubar.allImports).not.toContain("./StudioPage");
    expect(
      menubar.allImports.some((specifier) =>
        specifier === "konva"
        || specifier.startsWith("konva/")
        || specifier.startsWith("react-konva")
        || specifier === "three"
        || specifier.startsWith("three/")
      )
    ).toBe(false);
    expect(menubar.source).not.toContain('"use no memo"');
  });

  it("loads heavy application menus only through the neutral lazy registry", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const menubar = moduleEdges("./StudioMenubarContent.tsx");
    const registry = moduleEdges("./studio-page-lazy-ui.ts");

    for (const optionalModule of ["./StudioMainMenu", "./StudioExportMenuPanel"] as const) {
      expect(page.valueImports).not.toContain(optionalModule);
      expect(page.dynamicImports).not.toContain(optionalModule);
      expect(menubar.valueImports).not.toContain(optionalModule);
      expect(menubar.dynamicImports).not.toContain(optionalModule);
      expect(registry.valueImports).not.toContain(optionalModule);
      expect(registry.dynamicImports.filter((specifier) => specifier === optionalModule)).toEqual([
        optionalModule,
      ]);
    }

    expect(menubar.valueImports).toContain("./studio-page-lazy-ui");
    expect(menubar.source).toContain("preloadStudioExportMenuPanel();");
    expect(menubar.source).toContain("onMouseEnter={preloadStudioExportMenuPanel}");
    expect(menubar.source).toContain("onFocus={preloadStudioExportMenuPanel}");
  });

  it("preserves the two-lane chrome, portal selectors, and Page-owned focus refs", () => {
    const page = moduleEdges("./StudioPage.tsx").source;
    const menubar = moduleEdges("./StudioMenubarContent.tsx").source;

    expect(menubar).toContain('data-studio-menubar-primary="true"');
    expect(menubar).toContain('data-studio-menubar-actions="true"');
    expect(menubar).toContain('data-studio-export-menu-panel="true"');
    expect(menubar).toContain('data-studio-project-actions-menu="true"');
    expect(menubar.match(/createPortal\(/g)).toHaveLength(2);
    expect(menubar).toContain("document.body");
    expect(menubar).toContain("globalThis.setTimeout(() => setProjectActionsOpen(false), 0)");
    expect(page).toContain("exportMenuRef={exportMenuRef}");
    expect(page).toContain("projectActionsRef={projectActionsRef}");
    expect(page).toContain(
      'projectActionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus()'
    );
  });

  it("keeps handler identity stable while render-time lock copy remains a normal prop", () => {
    const page = moduleEdges("./StudioPage.tsx").source;
    const menubar = moduleEdges("./StudioMenubarContent.tsx").source;
    const handlerContract = menubar.slice(
      menubar.indexOf("export interface StudioMenubarContentHandlers"),
      menubar.indexOf("export interface StudioMenubarContentProps")
    );

    expect(page).toContain(
      "const studioMenubarContentHandlers = useStudioStableHandlers<StudioMenubarContentHandlers>({"
    );
    expect(page).toContain("stableHandlers={studioMenubarContentHandlers}");
    expect(page).toContain("collaborationLockMessage={collaborationLockMessage}");
    expect(handlerContract).not.toContain("collaborationLockMessage");
    expect(page).not.toMatch(
      /useStudioStableHandlers<StudioMenubarContentHandlers>\(\{[\s\S]{0,800}collaborationLockMessage/
    );
  });

  it("wires multi-page range capture through indices mode (not all-then-slice residual)", () => {
    const page = moduleEdges("./StudioPage.tsx").source;
    const menubar = moduleEdges("./StudioMenubarContent.tsx").source;
    const handlerContract = menubar.slice(
      menubar.indexOf("export interface StudioMenubarContentHandlers"),
      menubar.indexOf("export interface StudioMenubarContentProps")
    );

    expect(page).toContain("async function handleCapturePagesForIndices(indices: number[])");
    expect(page).toContain("handleCapturePagesForIndices,");
    expect(handlerContract).toContain(
      "handleCapturePagesForIndices: (indices: number[]) => Promise<HTMLCanvasElement[]>"
    );
    expect(menubar).toContain("handleCapturePagesForIndices,");
    expect(menubar).toContain("capturePagesForIndices={handleCapturePagesForIndices}");
  });
});
