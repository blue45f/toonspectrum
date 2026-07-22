import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const pageUrl = new URL("./StudioPage.tsx", import.meta.url);
const inspectorUrl = new URL("./StudioInspectorAside.tsx", import.meta.url);
const pageSource = readFileSync(pageUrl, "utf8");
const inspectorSource = readFileSync(inspectorUrl, "utf8");
const pageFile = ts.createSourceFile(
  pageUrl.pathname,
  pageSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function nestedFunction(name: string): string {
  let match: ts.FunctionDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(pageFile);
  if (!match) throw new Error(`Missing nested function ${name}`);
  return (match as ts.FunctionDeclaration).getText(pageFile);
}

describe("Studio canvas and layer navigator selection boundary", () => {
  it("projects canvas single/multi selection into the navigator without inventing a second owner", () => {
    expect(inspectorSource).toContain(
      "selectedIds={marqueeIds.length > 0 ? marqueeIds : selectedId ? [selectedId] : []}",
    );
    expect(inspectorSource).toContain("onSelectionChange={selectLayersFromNavigator}");
  });

  it("maps navigator 0/1/2+ selection back to the authoritative canvas selection shape", () => {
    const selectionAdapter = nestedFunction("selectLayersFromNavigator");

    expect(selectionAdapter).toContain("setTool(\"select\")");
    expect(selectionAdapter).toContain("if (validIds.length === 0)");
    expect(selectionAdapter).toContain("setSelectedId(null)");
    expect(selectionAdapter).toContain("setMarqueeIds([])");
    expect(selectionAdapter).toContain("if (validIds.length === 1)");
    expect(selectionAdapter).toContain("setSelectedId(validIds[0] ?? null)");
    expect(selectionAdapter).toContain("setMarqueeIds(validIds)");
    expect(selectionAdapter).toContain(".slice(0, 500)");
  });
});
