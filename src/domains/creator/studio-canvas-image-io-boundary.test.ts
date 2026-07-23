import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleShape {
  readonly imports: readonly string[];
  readonly source: string;
  readonly sourceFile: ts.SourceFile;
  readonly topLevelDeclarations: ReadonlySet<string>;
  readonly exportedDeclarations: ReadonlySet<string>;
}

function declarationIsExported(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function moduleShape(relativePath: string): ModuleShape {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const sourceFile = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports: string[] = [];
  const topLevelDeclarations = new Set<string>();
  const exportedDeclarations = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push(statement.moduleSpecifier.text);
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      topLevelDeclarations.add(statement.name.text);
      if (declarationIsExported(statement)) exportedDeclarations.add(statement.name.text);
    }
  }

  return { imports, source, sourceFile, topLevelDeclarations, exportedDeclarations };
}

function callCount(sourceFile: ts.SourceFile, name: string): number {
  let count = 0;
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === name
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return count;
}

const MOVED_FUNCTIONS = [
  "studioCanvasDecodedPixelLimit",
  "assertStudioCanvasDecodedImageSize",
  "downscaleImageFile",
  "readGifFileAsDataUrl",
  "loadImageFileForCanvas",
  "downscaleDataUrl",
  "createPixelEditCanvas",
  "loadPixelEditImage",
] as const;

describe("Studio canvas image I/O module boundary", () => {
  it("owns the browser image and pixel helpers outside StudioPage", () => {
    const page = moduleShape("./StudioPage.tsx");
    const imageIo = moduleShape("./studio-canvas-image-io.ts");

    for (const name of MOVED_FUNCTIONS) {
      expect(imageIo.topLevelDeclarations.has(name)).toBe(true);
      expect(imageIo.exportedDeclarations.has(name)).toBe(true);
      expect(page.topLevelDeclarations.has(name)).toBe(false);
    }
    expect(page.imports).not.toContain("./studio-canvas-image-io");
    expect(page.source.match(/import\("\.\/studio-canvas-image-io"\)/gu)).toHaveLength(1);
  });

  it("keeps the extracted module independent from React, Konva, and StudioPage", () => {
    const imageIo = moduleShape("./studio-canvas-image-io.ts");

    expect(imageIo.imports).toEqual([
      "./studio-gif-element",
      "./studio-upload-image-safety",
      "./studio-raster-interchange",
    ]);
    expect(imageIo.source.match(/import\("\.\/studio-raster-interchange-worker-client"\)/gu)).toHaveLength(1);
    expect(imageIo.source).not.toContain("const { decodeStudioRasterInterchange }");
    expect(imageIo.imports).not.toContain("./StudioPage");
    expect(imageIo.imports.some((specifier) => specifier === "react" || specifier.includes("konva"))).toBe(false);
  });

  it("preserves every StudioPage consumer call after extraction", () => {
    const page = moduleShape("./StudioPage.tsx");

    expect(callCount(page.sourceFile, "loadStudioCanvasImageFile")).toBe(4);
    expect(callCount(page.sourceFile, "downscaleStudioCanvasDataUrl")).toBe(1);
    expect(callCount(page.sourceFile, "loadStudioPixelEditImage")).toBe(15);
    expect(page.source.match(/\bcreateStudioPixelEditCanvas\b/gu)).toHaveLength(17);
    expect(page.source).not.toContain('from "./studio-gif-element"');
    expect(page.source).not.toContain('from "./studio-upload-image-safety"');
  });
});
