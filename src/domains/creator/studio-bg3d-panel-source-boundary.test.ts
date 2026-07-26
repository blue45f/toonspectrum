import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const PANEL_FILES = [
  "./StudioBg3dShapesPanel.tsx",
  "./StudioBg3dViewPanel.tsx",
  "./StudioBg3dLtPanel.tsx",
] as const;

function moduleSource(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function moduleImports(fileName: string) {
  const source = moduleSource(fileName);
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const staticImports: string[] = [];
  const dynamicImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      staticImports.push(node.moduleSpecifier.text);
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

  visit(sourceFile);
  return { dynamicImports, staticImports };
}

describe("Studio BG3D panel source boundary", () => {
  it("keeps every React Compiler source unit below the guarded 480 KB ceiling", () => {
    for (const fileName of ["./StudioBackground3D.tsx", ...PANEL_FILES]) {
      expect(
        Buffer.byteLength(moduleSource(fileName), "utf8"),
        `${fileName} must keep React Compiler headroom`,
      ).toBeLessThan(480_000);
    }
  });

  it("keeps the panels inside the single static BG3D editor closure", () => {
    const editorImports = moduleImports("./StudioBackground3D.tsx");
    expect(editorImports.staticImports).toEqual(expect.arrayContaining([
      "./StudioBg3dShapesPanel",
      "./StudioBg3dViewPanel",
      "./StudioBg3dLtPanel",
    ]));

    const loaderImports = moduleImports("./studio-background-3d-loader.ts");
    expect(loaderImports.staticImports).not.toContain("./StudioBackground3D");
    expect(loaderImports.dynamicImports).toEqual(["./StudioBackground3D"]);
  });

  it("does not create renderer back-edges or nested lazy boundaries in UI-only panels", () => {
    for (const fileName of [...PANEL_FILES, "./studio-bg3d-editor-ui.ts"]) {
      const imports = moduleImports(fileName);
      expect(imports.dynamicImports, fileName).toEqual([]);
      expect(imports.staticImports, fileName).not.toContain("./StudioBackground3D");
      expect(imports.staticImports, fileName).not.toContain("three");
      expect(
        imports.staticImports.some((source) => source.startsWith("@react-three/")),
        fileName,
      ).toBe(false);
    }
  });

  it("preserves always-mounted tab panels through the hidden attribute", () => {
    const editorSource = moduleSource("./StudioBackground3D.tsx");
    const expectations = [
      ["StudioBg3dShapesPanel", "shapes"],
      ["StudioBg3dViewPanel", "view"],
      ["StudioBg3dLtPanel", "lt"],
    ] as const;

    for (const [componentName, tab] of expectations) {
      expect(editorSource).toContain(`<${componentName}`);
      expect(editorSource).toContain(`hidden={hideOnTab("${tab}")}`);
      expect(moduleSource(`./${componentName}.tsx`)).toContain("<section hidden={hidden}>");
    }
  });
});
