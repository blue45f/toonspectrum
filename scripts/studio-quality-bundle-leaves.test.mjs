import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const leaves = ["studio-page-review.ts", "studio-frame-animation-timing.ts"];
for (const name of leaves) {
  test(name + " remains a dependency-free document chunk leaf", () => {
    const path = "src/domains/creator/" + name;
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (ts.isImportDeclaration(node)) assert.equal(node.importClause?.isTypeOnly, true);
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) assert.equal(node.isTypeOnly, true);
    }
    const config = readFileSync("vite.config.ts", "utf8");
    const start = config.indexOf('id.endsWith("/src/domains/creator/studio-layers.ts")');
    const end = config.indexOf('return "studio-document-micro-models";', start);
    assert.ok(start >= 0 && end > start);
    assert.ok(config.slice(start, end).includes('/src/domains/creator/' + name));
  });
}
