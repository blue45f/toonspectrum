import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL(
  "./studio-p5-brush-standalone-runtime-adapter.ts",
  import.meta.url,
);
const source = readFileSync(sourceUrl, "utf8");
const file = ts.createSourceFile(
  sourceUrl.pathname,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const staticPackages: string[] = [];
const dynamicPackages: string[] = [];

function visit(node: ts.Node): void {
  if (
    ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier)
  ) staticPackages.push(node.moduleSpecifier.text);
  if (
    ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments.length === 1
    && ts.isStringLiteral(node.arguments[0])
  ) dynamicPackages.push(node.arguments[0].text);
  ts.forEachChild(node, visit);
}

visit(file);

describe("Studio p5.brush standalone adapter bundle boundary", () => {
  it("uses one literal lazy standalone import and never loads the p5 addon entry", () => {
    expect(dynamicPackages).toEqual(["p5.brush/standalone"]);
    expect(staticPackages).toEqual([
      "./studio-procedural-artistic-brush-provider",
    ]);
    expect(source).not.toMatch(
      /(?:from|import\s*\()\s*["'](?:p5|p5\.brush)["']/u,
    );
  });

  it("keeps the runtime settled-only, Worker-isolated and non-authoritative", () => {
    expect(source).toContain('"execution:settled-only"');
    expect(source).toContain('"surface:offscreen-canvas"');
    expect(source).toContain('"gpu:webgl2"');
    expect(source).toContain('"authority:none"');
    expect(source).toContain("globalRuntimeTail");
    expect(source).toContain("isDedicatedWorkerScope");
    expect(source).toContain("isOffscreenCanvas");
    expect(source).toContain("isWebGl2Context");
    expect(source).toContain("readTopLeftRgbaInPlace");
    expect(source).toContain("pixels.copyWithin");
    expect(source).not.toContain("new Uint8Array(pixels)");
    expect(source).not.toContain('"tip:image"');
    expect(source).not.toContain('"tip:custom"');
  });
});
