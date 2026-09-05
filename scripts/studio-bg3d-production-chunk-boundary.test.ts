import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const MODEL_PATHS = [
  "src/domains/creator/bg3d/studio-bg3d-production-workflow.ts",
  "src/domains/creator/bg3d/studio-bg3d-production-pass-readiness.ts",
  "src/domains/creator/bg3d/studio-bg3d-production-multipass.ts",
];

function parseFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(resolve(process.cwd(), file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function visitTree(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => visitTree(child, visit));
}

describe("BG3D production model chunk boundary", () => {
  it("co-locates exactly the three pure production models, not panels or engines", () => {
    const matchedPaths: string[] = [];
    let matchingGroups = 0;
    visitTree(parseFile("vite.config.ts"), (node) => {
      if (!ts.isIfStatement(node) || !ts.isBlock(node.thenStatement)) return;
      const returnsModelChunk = node.thenStatement.statements.some((statement) =>
        ts.isReturnStatement(statement) &&
        statement.expression !== undefined &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === "studio-bg3d-production-models",
      );
      if (!returnsModelChunk) return;
      matchingGroups += 1;
      visitTree(node.expression, (condition) => {
        if (ts.isStringLiteral(condition)) matchedPaths.push(condition.text);
      });
    });
    expect(matchingGroups).toBe(1);
    expect(matchedPaths.toSorted()).toEqual(MODEL_PATHS.map((file) => `/${file}`).toSorted());
  });

  it.each(MODEL_PATHS)("keeps %s free of external runtime dependencies", (file) => {
    const source = parseFile(file);
    const runtimeImports: string[] = [];
    const emitted = ts.transpileModule(source.text, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const javascript = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true);
    visitTree(javascript, (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ) runtimeImports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node)) {
        expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
        expect(ts.isIdentifier(node.expression) && node.expression.text === "require").toBe(false);
      }
    });
    expect(runtimeImports).toEqual(file.endsWith("production-pass-readiness.ts")
      ? ["./studio-bg3d-production-multipass"]
      : []);
  });
});
