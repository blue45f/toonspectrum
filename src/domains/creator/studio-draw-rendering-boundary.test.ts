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

  it("keeps the React-Konva node and draft preview runtime in one-way modules", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const drawNode = moduleEdges("./StudioDrawNode.tsx");
    const previewLayers = moduleEdges("./StudioDraftPreviewLayers.tsx");
    const previewStore = moduleEdges("./studio-draft-preview-store.ts");
    const rendering = moduleEdges("./studio-draw-rendering.ts");

    expect(
      page.valueImports.filter((specifier) => specifier === "./StudioDrawNode"),
    ).toEqual(["./StudioDrawNode"]);
    expect(page.source).not.toContain("const StudioDrawNode = memo(function StudioDrawNode(");
    expect(drawNode.source).toContain(
      "export const StudioDrawNode = memo(function StudioDrawNode(",
    );
    expect(drawNode.allImports).not.toContain("./StudioPage");
    expect(drawNode.dynamicImports).toEqual([]);
    expect(drawNode.valueImports).toContain("./StudioStampDrawShape");
    expect(drawNode.typeImports).toContain("./studio-element-model");
    expect(drawNode.valueImports).not.toContain("./studio-element-model");
    expect(drawNode.valueImports).toContain("./studio-draw-rendering");
    expect(drawNode.valueImports).toContain("react-konva/lib/ReactKonvaCore");

    expect(page.valueImports.filter((specifier) => specifier === "./studio-draft-preview-store"))
      .toEqual(["./studio-draft-preview-store"]);
    expect(page.valueImports.filter((specifier) => specifier === "./StudioDraftPreviewLayers"))
      .toEqual(["./StudioDraftPreviewLayers"]);
    expect(page.source).not.toMatch(/\b(?:const|function|class)\s+StudioDraftPreviewStore\b/);
    expect(page.source).not.toMatch(/\b(?:const|function|class)\s+StudioDraftPreviewLayers\b/);

    expect(previewStore.source).toContain("export class StudioDraftPreviewStore");
    expect(previewStore.typeImports).toContain("./studio-element-model");
    expect(previewStore.valueImports).not.toContain("./studio-element-model");
    expect(previewStore.allImports).not.toContain("./StudioPage");
    expect(previewStore.allImports.some((specifier) => specifier.startsWith("react"))).toBe(false);

    expect(previewLayers.source).toContain(
      "export const StudioDraftPreviewLayers = memo(function StudioDraftPreviewLayers(",
    );
    expect(previewLayers.typeImports).toContain("./studio-draft-preview-store");
    expect(previewLayers.valueImports).not.toContain("./studio-draft-preview-store");
    expect(previewLayers.valueImports).toContain("./StudioDrawNode");
    expect(previewLayers.valueImports).toContain("react-konva/lib/ReactKonvaCore");
    expect(previewLayers.allImports).not.toContain("./StudioPage");

    expect(rendering.source).not.toMatch(/\b(?:const|function|class)\s+StudioDrawNode\b/);
    expect(rendering.source).not.toMatch(/\b(?:const|function|class)\s+StudioDraftPreviewStore\b/);
    expect(rendering.source).not.toMatch(/\b(?:const|function|class)\s+StudioDraftPreviewLayers\b/);
    expect(rendering.allImports.some((specifier) => specifier.startsWith("react-konva"))).toBe(false);
  });

  it("keeps editor lifecycle, collaboration, routing, and GPU ownership out of StudioDrawNode", () => {
    const drawNode = moduleEdges("./StudioDrawNode.tsx");
    const forbiddenSpecifier = /(?:^|\/)(?:react-router|auth|studio-crdt|studio-webgpu|StudioPage)(?:\/|$)/;

    for (const specifier of drawNode.allImports) {
      expect(specifier).not.toMatch(forbiddenSpecifier);
    }
    expect(drawNode.source).not.toMatch(/\b(?:navigator|document|window)\s*\./);
    expect(drawNode.source).not.toMatch(/\b(?:GPUDevice|PointerEvent|WebSocket)\b/);
  });

  it("locks the stamp, watercolor, pattern, and memo routing seams in the extracted node", () => {
    const drawNode = moduleEdges("./StudioDrawNode.tsx");
    const stampShape = moduleEdges("./StudioStampDrawShape.tsx");

    expect(drawNode.source).toContain("const tileSrc = pattern ? patternDataUrl(pattern) : null;");
    expect(drawNode.source).toContain("if (active) setImage(img);");
    expect(drawNode.source).toContain("const symmetricVariations = stampBrushKind");
    expect(drawNode.source).toContain("<StudioStampDrawShape");
    expect(drawNode.valueImports).toContain("./StudioStampDrawShape");
    expect(stampShape.source).toContain('el.stampPipeline === "causal-walker-v2"');
    expect(stampShape.source).toContain("? el.points\n    : processFreehandPoints(el.points, renderSampleDistance)");
    expect(stampShape.source).toContain("drawStudioStampStrokeWithSymmetry(");
    expect(drawNode.source).toContain('el.watercolorPipeline === "causal-walker-v2"');
    expect(drawNode.source).toContain("planCausalWatercolorBrushDabs(watercolorInput, !activeDraft)");
    expect(drawNode.source).toContain('globalCompositeOperation="multiply"');
    expect(drawNode.source).toContain('globalCompositeOperation="lighter"');
  });
});
