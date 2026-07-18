import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function studioPageEdges() {
  const fileUrl = new URL("./StudioPage.tsx", import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const valueImports: string[] = [];
  const typeImports: string[] = [];
  const dynamicImports: string[] = [];
  let layerNavigatorUsesLazyRetry = false;

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      (node.importClause?.isTypeOnly ? typeImports : valueImports).push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "StudioLayerNavigator" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "lazyRetry"
    ) {
      layerNavigatorUsesLazyRetry = true;
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return {
    dynamicImports,
    layerNavigatorUsesLazyRetry,
    source,
    typeImports,
    valueImports,
  };
}

describe("Studio layer navigator bundle boundary", () => {
  it("keeps the optional layer navigator behind one analyzable lazyRetry import", () => {
    const edges = studioPageEdges();

    expect(edges.valueImports).not.toContain("./StudioLayerNavigator");
    expect(edges.typeImports).toContain("./StudioLayerNavigator");
    expect(edges.dynamicImports.filter((specifier) => specifier === "./StudioLayerNavigator")).toEqual([
      "./StudioLayerNavigator",
    ]);
    expect(edges.layerNavigatorUsesLazyRetry).toBe(true);
  });

  it("mounts the navigator only for the visible layer tab with an accessible stable fallback", () => {
    const source = studioPageEdges().source;

    expect(source).toMatch(
      /aria-label="레이어"[\s\S]*?\{inspectorLayout\.primary === "layers" \? \([\s\S]*?<Suspense/,
    );
    expect(source).toMatch(
      /fallback=\{[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?h-full min-h-72/,
    );
    expect(source).toMatch(/<StudioLayerNavigator[\s\S]*?<\/Suspense>[\s\S]*?\) : null\}/);
  });
});
