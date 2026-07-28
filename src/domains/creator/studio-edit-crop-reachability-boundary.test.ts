import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function resolvesLiteralCall(
  sourceFile: ts.SourceFile,
  entryName: string,
  targetName: string,
  literal: string,
): boolean {
  const functions = new Map<string, ts.FunctionDeclaration>();
  function collectFunctions(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
    }
    ts.forEachChild(node, collectFunctions);
  }
  collectFunctions(sourceFile);

  function resolveLiteral(
    expression: ts.Expression | undefined,
    bindings: ReadonlyMap<string, string>,
  ): string | null {
    if (!expression) return null;
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isIdentifier(expression)) return bindings.get(expression.text) ?? null;
    return null;
  }

  function visitFunction(
    name: string,
    bindings: ReadonlyMap<string, string>,
    visited: ReadonlySet<string>,
  ): boolean {
    const declaration = functions.get(name);
    if (!declaration?.body) return false;
    const visitKey = `${name}:${JSON.stringify([...bindings])}`;
    if (visited.has(visitKey)) return false;
    const nextVisited = new Set(visited).add(visitKey);
    let resolved = false;

    function visit(node: ts.Node): void {
      if (resolved) return;
      if (ts.isFunctionLike(node) && node !== declaration) return;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const calledName = node.expression.text;
        if (
          calledName === targetName
          && resolveLiteral(node.arguments[0], bindings) === literal
        ) {
          resolved = true;
          return;
        }
        const calledFunction = functions.get(calledName);
        if (calledFunction) {
          const nextBindings = new Map<string, string>();
          calledFunction.parameters.forEach((parameter, index) => {
            if (!ts.isIdentifier(parameter.name)) return;
            const value = resolveLiteral(node.arguments[index], bindings);
            if (value !== null) nextBindings.set(parameter.name.text, value);
          });
          if (visitFunction(calledName, nextBindings, nextVisited)) {
            resolved = true;
            return;
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(declaration.body);
    return resolved;
  }

  return visitFunction(entryName, new Map(), new Set());
}

/**
 * Reachability contract (2026-07-24): Edit → 레이어 자르기 must stay aligned with the
 * left-rail Crop button and keyboard C, which both route through ensurePixelToolTarget
 * (sole editable image auto-select / arm-anytime). Requiring selectedImage alone left the
 * menu item hard-disabled while the rail/keyboard still worked.
 */
describe("Studio edit crop reachability boundary", () => {
  it("derives cropLayerDisabled from pixelToolTargetAvailable, not selectedImage alone", () => {
    const controls = source("./studio-edit-controls.ts");
    expect(controls).toContain("pixelToolTargetAvailable: boolean");
    expect(controls).toContain(
      "cropLayerDisabled: input.mutationLocked || !input.pixelToolTargetAvailable",
    );
    expect(controls).not.toMatch(
      /cropLayerDisabled:\s*!input\.selectedImage\s*\|\|\s*input\.selectedContentMutationLocked/u,
    );
  });

  it("wires StudioPage ensurePixelToolTarget availability into the edit menu matrix", () => {
    const page = source("./StudioPage.tsx");
    const pageFile = ts.createSourceFile(
      "StudioPage.tsx",
      page,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    expect(
      resolvesLiteralCall(
        pageFile,
        "openSelectedLayerCrop",
        "ensurePixelToolTarget",
        "레이어 자르기",
      ),
    ).toBe(true);
    expect(page).toContain("pixelToolTargetAvailable,");
    expect(page).toContain("resolveStudioEditAvailability({");
    // The availability object must pass the rail gate rather than re-deriving selectedImage.
    const availabilityStart = page.indexOf("resolveStudioEditAvailability({");
    const availabilityEnd = page.indexOf("});", availabilityStart);
    const availability = page.slice(availabilityStart, availabilityEnd);
    expect(availability).toContain("pixelToolTargetAvailable");
    expect(availability).toContain("selectedImage: selected?.type === \"image\"");
  });

  it("keeps the left rail Crop button on the same availability gate", () => {
    const rail = source("./StudioLeftToolRail.tsx");
    expect(rail).toContain("disabled={!pixelToolTargetAvailable}");
    expect(rail).toContain("onClick={openSelectedLayerCrop}");
  });
});
