import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly allImports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly source: string;
  readonly typeImports: readonly string[];
  readonly valueImports: readonly string[];
}

function moduleEdges(relativePath: string): ModuleEdges {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const typeImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      allImports.push(specifier);
      const clause = node.importClause;
      if (clause?.isTypeOnly) typeImports.push(specifier);
      const namedBindings = clause?.namedBindings;
      const hasRuntimeValue = !clause || (
        !clause.isTypeOnly
        && (
          Boolean(clause.name)
          || Boolean(namedBindings && ts.isNamespaceImport(namedBindings))
          || Boolean(
            namedBindings
            && ts.isNamedImports(namedBindings)
            && namedBindings.elements.some((item) => !item.isTypeOnly)
          )
        )
      );
      if (hasRuntimeValue) valueImports.push(specifier);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { allImports, dynamicImports, source, typeImports, valueImports };
}

const EXTRACTED_FUNCTIONS = [
  "drawBounds",
  "getSymmetricPoints",
  "drawFreehandPenSegments",
  "drawStudioCausalInkDabs",
  "isDirectLiveDraftEl",
  "isDirectLiveStampDraftEl",
  "drawLiveFreehandDraftToContext",
] as const;

describe("studio draw rendering ownership boundary", () => {
  it("keeps one-way ownership from StudioPage to the pure Canvas2D helper module", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const rendering = moduleEdges("./studio-draw-rendering.ts");

    expect(
      page.valueImports.filter((specifier) => specifier === "./studio-draw-rendering"),
    ).toEqual(["./studio-draw-rendering"]);
    expect(rendering.allImports).not.toContain("./StudioPage");
    expect(rendering.dynamicImports).toEqual([]);

    for (const functionName of EXTRACTED_FUNCTIONS) {
      expect(rendering.source).toMatch(new RegExp(`export function ${functionName}\\b`));
      expect(page.source).not.toMatch(new RegExp(`function ${functionName}\\b`));
    }
  });

  it("keeps DrawEl and Konva as whole-clause type-only dependencies", () => {
    const rendering = moduleEdges("./studio-draw-rendering.ts");

    expect(rendering.typeImports).toContain("./studio-element-model");
    expect(rendering.typeImports).toContain("konva");
    expect(rendering.valueImports).not.toContain("./studio-element-model");
    expect(rendering.valueImports).not.toContain("konva");
    expect(rendering.source).toContain('import type { DrawEl } from "./studio-element-model";');
    expect(rendering.source).toContain('import type Konva from "konva";');
  });

  it("does not pull editor lifecycle, UI, collaboration, or GPU responsibilities into the helper", () => {
    const rendering = moduleEdges("./studio-draw-rendering.ts");
    const forbiddenSpecifier = /(?:^|\/)(?:react|react-dom|react-router|auth|studio-crdt|studio-webgpu|StudioPage)(?:\/|$)/;

    for (const specifier of rendering.allImports) {
      expect(specifier).not.toMatch(forbiddenSpecifier);
    }
    expect(rendering.source).not.toMatch(/\b(?:useEffect|useLayoutEffect|useRef|useState|useSyncExternalStore)\b/);
    expect(rendering.source).not.toMatch(/\b(?:navigator|document|window)\s*\./);
    expect(rendering.source).not.toMatch(/\bGPUDevice\b/);
  });

  it("leaves the React-Konva node and draft-preview store inside StudioPage", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const rendering = moduleEdges("./studio-draw-rendering.ts");

    expect(page.source).toContain("const StudioDrawNode = memo(function StudioDrawNode(");
    expect(page.source).toContain("class StudioDraftPreviewStore");
    expect(page.source).toContain(
      "const StudioDraftPreviewLayers = memo(function StudioDraftPreviewLayers(",
    );
    expect(rendering.source).not.toMatch(/\b(?:const|function|class)\s+StudioDrawNode\b/);
    expect(rendering.source).not.toMatch(/\b(?:const|function|class)\s+StudioDraftPreviewStore\b/);
    expect(rendering.source).not.toMatch(/\b(?:const|function|class)\s+StudioDraftPreviewLayers\b/);
    expect(rendering.allImports.some((specifier) => specifier.startsWith("react-konva"))).toBe(false);
  });
});
