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
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
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
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.isTypeOnly
    ) {
      const clause = node.exportClause;
      const hasRuntimeValue = !clause || (
        ts.isNamedExports(clause)
        && clause.elements.some((specifier) => !specifier.isTypeOnly)
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
  return { dynamicImports, source, valueImports };
}

const BROWSER_ORCHESTRATORS = [
  "./studio-heal-clone-browser",
  "./studio-magic-wand-browser",
  "./studio-smudge-browser",
] as const;

describe("Studio pixel-edit brush runtime boundary", () => {
  it("keeps one cached intent boundary out of the Studio static graph", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const runtime = moduleEdges("./studio-pixel-edit-brush-runtime.ts");

    expect(page.dynamicImports.filter(
      (specifier) => specifier === "./studio-pixel-edit-brush-runtime"
    )).toEqual(["./studio-pixel-edit-brush-runtime"]);
    expect(page.valueImports).not.toContain("./studio-pixel-edit-brush-runtime");
    for (const specifier of BROWSER_ORCHESTRATORS) {
      expect(page.valueImports).not.toContain(specifier);
    }
    expect(runtime.valueImports.toSorted()).toEqual(BROWSER_ORCHESTRATORS.toSorted());
    expect(runtime.dynamicImports).toEqual([]);
    expect(page.source).toContain(
      "studioPixelEditBrushRuntimePromise ??= import(\"./studio-pixel-edit-brush-runtime\")"
    );
  });

  it("awaits the shared runtime inside all three existing async mutation guards", () => {
    const { source } = moduleEdges("./StudioPage.tsx");

    expect(source).toContain(
      "const { magicWandScanFromImage } = await loadStudioPixelEditBrushRuntime();"
    );
    expect(source).toContain(
      "const { smudgeStrokeImage } = await loadStudioPixelEditBrushRuntime();"
    );
    expect(source).toContain(
      "const { bakeHealCloneStrokeToCanvas } = await loadStudioPixelEditBrushRuntime();"
    );
  });
});
