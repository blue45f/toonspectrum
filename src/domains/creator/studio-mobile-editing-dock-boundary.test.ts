import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleShape {
  readonly allImports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly exportedDeclarations: ReadonlySet<string>;
  readonly namedValueImports: ReadonlyMap<string, string>;
  readonly source: string;
  readonly topLevelDeclarations: ReadonlySet<string>;
  readonly valueImports: readonly string[];
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
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const exportedDeclarations = new Set<string>();
  const namedValueImports = new Map<string, string>();
  const topLevelDeclarations = new Set<string>();
  const valueImports: string[] = [];

  function rememberDeclaration(name: string, node: ts.Node): void {
    topLevelDeclarations.add(name);
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      exportedDeclarations.add(name);
    }
  }

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      allImports.push(statement.moduleSpecifier.text);
      if (!statement.importClause?.isTypeOnly) valueImports.push(statement.moduleSpecifier.text);
      const bindings = statement.importClause?.namedBindings;
      if (!statement.importClause?.isTypeOnly && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) {
            namedValueImports.set(element.name.text, statement.moduleSpecifier.text);
          }
        }
      }
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
        if (ts.isIdentifier(declaration.name)) rememberDeclaration(declaration.name.text, statement);
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
    allImports,
    dynamicImports,
    exportedDeclarations,
    namedValueImports,
    source,
    topLevelDeclarations,
    valueImports,
  };
}

describe("Studio mobile editing dock module boundary", () => {
  it("keeps StudioPage as the one-way static orchestration owner", () => {
    const page = moduleShape("./StudioPage.tsx");
    const dock = moduleShape("./StudioMobileEditingDock.tsx");

    expect(
      page.valueImports.filter((specifier) => specifier === "./StudioMobileEditingDock"),
    ).toEqual(["./StudioMobileEditingDock"]);
    expect(page.dynamicImports).not.toContain("./StudioMobileEditingDock");
    expect(dock.allImports).not.toContain("./StudioPage");
    expect(dock.dynamicImports).not.toContain("./StudioPage");
    expect(page.source).toContain("useStudioStableHandlers<StudioMobileEditingDockHandlers>({");
    expect(page.source).toContain("<StudioMobileEditingDock");
  });

  it("moves the dock and its presentation contracts out of the page monolith", () => {
    const page = moduleShape("./StudioPage.tsx");
    const dock = moduleShape("./StudioMobileEditingDock.tsx");

    for (const declaration of [
      "StudioBrushCatalogHandlers",
      "StudioMobileEditingDockHandlers",
      "StudioMobileEditingDockProps",
      "StudioMobileEditingDock",
    ]) {
      expect(dock.exportedDeclarations).toContain(declaration);
      expect(page.topLevelDeclarations).not.toContain(declaration);
    }
  });

  it("preserves the lazy registry and excludes canvas runtime dependencies", () => {
    const dock = moduleShape("./StudioMobileEditingDock.tsx");

    for (const name of [
      "StudioBrushLibraryPanel",
      "StudioBrushStudio",
      "StudioShapePickerGrid",
      "StudioUnifiedBrushPicker",
      "loadStudioBrushStudio",
    ]) {
      expect(dock.namedValueImports.get(name)).toBe("./studio-page-lazy-ui");
    }
    for (const directModule of [
      "./StudioBrushLibraryPanel",
      "./StudioBrushStudio",
      "./StudioShapePickerGrid",
      "./StudioUnifiedBrushPicker",
      "konva",
      "react-konva",
      "react-konva/lib/ReactKonvaCore",
    ]) {
      expect(dock.allImports).not.toContain(directModule);
    }
    expect(dock.dynamicImports).toEqual([]);
    expect(dock.source).not.toContain("lazyRetry(");
  });

  it("leaves modal, focus, and stable-handler lifecycle in StudioPage", () => {
    const page = moduleShape("./StudioPage.tsx");
    const dock = moduleShape("./StudioMobileEditingDock.tsx");

    for (const controllerContract of [
      "const drawSheetRef = useRef",
      "const brushManagerSheetRef = useRef",
      "const mobileBrushDockButtonRef = useRef",
      "useStudioModalSheet({",
      "function dismissBrushManagerToDraw()",
      "function openBrushManager(launcher: HTMLButtonElement)",
      "useStudioStableHandlers<StudioMobileEditingDockHandlers>({",
    ]) {
      expect(page.source).toContain(controllerContract);
      expect(dock.source).not.toContain(controllerContract);
    }
    expect(dock.source).not.toContain("useState(");
    expect(dock.source).not.toContain("useStudioModalSheet");
  });
});
