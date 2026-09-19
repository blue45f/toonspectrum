import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { standardZigzagStrokeSamples as publicSamples } from "../raster-compile";
import { standardZigzagStrokeSamples } from "../raster-stroke-samples";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("focused libmypaint runtime entry", () => {
  it("keeps the exact existing fidelity helper and its public re-export", () => {
    expect(publicSamples).toBe(standardZigzagStrokeSamples);
    expect(publicSamples(192, 96, 96)).toEqual(standardZigzagStrokeSamples(192, 96, 96));
  });
  it("has no value-import path to Zod, format gateways, renderer registries, or other engines", () => {
    const pkg = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
    expect(pkg.exports["./libmypaint"].import).toBe("./src/libmypaint.ts");
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (ts.isImportDeclaration(node)) {
          if (node.importClause?.isTypeOnly) continue;
          const bindings = node.importClause?.namedBindings;
          if (!node.importClause?.name && bindings && ts.isNamedImports(bindings)
            && bindings.elements.length > 0 && bindings.elements.every((value) => value.isTypeOnly)) continue;
          const name = (node.moduleSpecifier as ts.StringLiteral).text;
          expect(name).toMatch(/^\.\//u);
          visit(resolve(dirname(file), name + ".ts"));
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
          throw new Error("Unexpected value re-export from focused native runtime");
        }
      }
    }
    visit(resolve(packageRoot, "src/libmypaint.ts"));
    expect([...visited].map((path) => path.split("/").at(-1)).sort()).toEqual(["libmypaint.ts", "raster-stroke-samples.ts"]);
  });
});
