import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(join(directory, entry.name)) : /\.tsx?$/u.test(entry.name) ? [join(directory, entry.name)] : []);
}
describe("browser focused core entrypoints", () => {
  it("does not import runtime values from the side-effectful core barrel", () => {
    for (const file of files("apps/web/src")) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('"@toonspectrum/core"')) continue;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== "@toonspectrum/core") continue;
        const clause = node.importClause, bindings = clause?.namedBindings;
        const typesOnly = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every((value) => value.isTypeOnly));
        expect(typesOnly, file).toBeTruthy();
      }
    }
  });
  it("exports stable focused modules without runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync("packages/core/package.json", "utf8"));
    for (const name of ["business", "public-share-path"]) {
      expect(pkg.exports[`./${name}`]).toBe(`./src/${name}.ts`);
      const ast = ts.createSourceFile(name, readFileSync(`packages/core/src/${name}.ts`, "utf8"), ts.ScriptTarget.Latest, true);
      expect(ast.statements.filter(ts.isImportDeclaration)).toEqual([]);
    }
  });
  it("keeps selected marketplace import behind a conditional dynamic boundary", () => {
    const sidebar = readFileSync("apps/web/src/domains/creator/bg3d/StudioBg3dEditorSidebar.tsx", "utf8");
    const wrapper = readFileSync("apps/web/src/domains/creator/bg3d/StudioMarketplaceModelImportMount.tsx", "utf8");
    expect(sidebar).toContain('from "./StudioMarketplaceModelImportMount"');
    expect(sidebar).not.toContain('from "./StudioMarketplaceModelImport"');
    expect(wrapper).toContain('if (!props.modelId) return null');
    expect(wrapper).toContain('const loadModelImport = () => import("./StudioMarketplaceModelImport")');
    expect(wrapper).toContain('useStudioOnDemandModule(loadModelImport, Boolean(props.modelId))');
    expect(wrapper).not.toContain('studio-marketplace-cc0-registry');
  });
});
