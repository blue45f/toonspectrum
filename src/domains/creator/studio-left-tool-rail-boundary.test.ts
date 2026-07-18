import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleShape {
  readonly allImports: readonly string[];
  readonly exportedDeclarations: ReadonlySet<string>;
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
  const exportedDeclarations = new Set<string>();
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
      if (!statement.importClause?.isTypeOnly) {
        valueImports.push(statement.moduleSpecifier.text);
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
        if (ts.isIdentifier(declaration.name)) {
          rememberDeclaration(declaration.name.text, statement);
        }
      }
    }
  }

  return {
    allImports,
    exportedDeclarations,
    source,
    topLevelDeclarations,
    valueImports,
  };
}

describe("Studio left tool rail module boundary", () => {
  it("keeps StudioPage as the one-way static owner", () => {
    const page = moduleShape("./StudioPage.tsx");
    const rail = moduleShape("./StudioLeftToolRail.tsx");

    expect(page.valueImports.filter((specifier) => specifier === "./StudioLeftToolRail")).toEqual([
      "./StudioLeftToolRail",
    ]);
    expect(rail.allImports).not.toContain("./StudioPage");
    expect(rail.source).not.toMatch(/import\s*\([^)]*StudioPage/u);
  });

  it("exports the component and stable handler contract from their new owner", () => {
    const page = moduleShape("./StudioPage.tsx");
    const rail = moduleShape("./StudioLeftToolRail.tsx");

    expect(rail.exportedDeclarations.has("StudioLeftToolRail")).toBe(true);
    expect(rail.exportedDeclarations.has("StudioLeftToolRailHandlers")).toBe(true);
    expect(page.topLevelDeclarations.has("StudioLeftToolRail")).toBe(false);
    expect(page.topLevelDeclarations.has("StudioLeftToolRailHandlers")).toBe(false);
  });

  it("keeps the rail independent from canvas render runtimes", () => {
    const rail = moduleShape("./StudioLeftToolRail.tsx");

    expect(rail.allImports).not.toContain("konva");
    expect(rail.allImports).not.toContain("react-konva");
    expect(rail.valueImports).toContain("./studio-page-lazy-ui");
    expect(rail.source).toContain("preloadStudioReferencePanel");
  });
});
