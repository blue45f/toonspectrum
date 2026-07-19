import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function moduleImports(fileName: string) {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const valueImports: string[] = [];
  const dynamicImports: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.importClause?.isTypeOnly
    ) {
      valueImports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { dynamicImports, valueImports };
}

describe("Studio background 3D bundle boundary", () => {
  it("keeps StudioPage tool detection on the Three-free metadata module", () => {
    const imports = moduleImports("./StudioPage.tsx");

    expect(imports.valueImports).toContain("./studio-background-3d-metadata");
    expect(imports.valueImports).not.toContain("./studio-background-3d-primitives");
    expect(imports.valueImports).not.toContain("./StudioBackground3D");
  });

  it("loads the 3D editor from one analyzable dynamic-import boundary", () => {
    const imports = moduleImports("./studio-background-3d-loader.ts");

    expect(imports.valueImports).not.toContain("./StudioBackground3D");
    expect(imports.dynamicImports).toEqual(["./StudioBackground3D"]);
  });

  it("loads durable shot production only after the user starts a batch", () => {
    const imports = moduleImports("./StudioBackground3D.tsx");
    const loaderImports = moduleImports("./studio-bg3d-shot-batch-runtime-loader.ts");

    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-batch-runtime");
    expect(imports.dynamicImports).not.toContain("./studio-bg3d-shot-batch-runtime");
    expect(imports.valueImports).toContain("./studio-bg3d-shot-batch-runtime-loader");
    expect(loaderImports.dynamicImports).toEqual(["./studio-bg3d-shot-batch-runtime"]);
    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-batch-recovery-store");
    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-batch-worker-client");
    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-contact-sheet-worker-client");
    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-psd-worker-client");
    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-batch");
    expect(imports.valueImports).not.toContain("./studio-bg3d-shot-batch-plan");
    expect(imports.valueImports).toContain("./studio-bg3d-shot-batch-limits");
    expect(imports.valueImports).toContain("./studio-bg3d-shot-batch-pass-catalog");
  });

  it("keeps the metadata contract independent of rendering runtimes", () => {
    const imports = moduleImports("./studio-background-3d-metadata.ts");

    expect(imports.valueImports).toEqual([]);
    expect(imports.dynamicImports).toEqual([]);
  });
});
