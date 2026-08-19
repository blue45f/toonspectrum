import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly dynamicImports: readonly string[];
  readonly source: string;
  readonly typeOnlyImports: readonly string[];
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
  const dynamicImports: string[] = [];
  const typeOnlyImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (node.importClause?.isTypeOnly) {
        typeOnlyImports.push(node.moduleSpecifier.text);
      } else {
        valueImports.push(node.moduleSpecifier.text);
      }
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
  return { dynamicImports, source, typeOnlyImports, valueImports };
}

function pathBooleanHandler(): string {
  const page = moduleEdges("./StudioPage.tsx").source;
  const start = page.indexOf(
    "async function applyPathBooleanCombine(op: StudioPathBooleanOp)",
  );
  const end = page.indexOf(
    "function handleLayerNavigatorAction(",
    start,
  );
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return page.slice(start, end);
}

describe("CanvasKit PathOps product entry boundary", () => {
  it("keeps the heavy Worker client graph behind one analyzable dynamic import", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const workerClient = "./studio-quality-worker-client";

    expect(page.valueImports).toContain(
      "./studio-canvaskit-path-boolean-document-adapter",
    );
    expect(page.valueImports).not.toContain(workerClient);
    expect(page.typeOnlyImports).toContain(workerClient);
    expect(
      page.dynamicImports.filter((specifier) => specifier === workerClient),
    ).toEqual([workerClient]);
  });

  it("flushes settled ink, calls CanvasKit, revalidates authority, and commits once", () => {
    const handler = pathBooleanHandler();
    const flushAt = handler.indexOf("flushPendingStrokeCommitsRef.current()");
    const ticketAt = handler.indexOf("captureStudioMutationTicket()");
    const importAt = handler.indexOf(
      'await import("./studio-quality-worker-client")',
    );
    const pathOpsAt = handler.indexOf(
      "await combineStudioShapesWithCanvasKit(",
    );
    const staleAt = handler.indexOf(
      "studioVectorAsyncCommandStaleReason(snapshot",
    );
    const commitAt = handler.indexOf("const committed = commit(");

    expect(flushAt).toBeGreaterThan(0);
    expect(ticketAt).toBeGreaterThan(flushAt);
    expect(importAt).toBeGreaterThan(ticketAt);
    expect(pathOpsAt).toBeGreaterThan(importAt);
    expect(staleAt).toBeGreaterThan(pathOpsAt);
    expect(commitAt).toBeGreaterThan(staleAt);
    expect(handler.match(/\bcommit\(/gu)).toHaveLength(1);
    expect(handler).toContain("sourceElements: selectionEls");
    expect(handler).toContain("elements: latestElements");
    expect(handler).toContain("mutationAllowed");
    expect(handler).toContain("reviewLocked: activeSurfaceReviewLockedRef.current");
  });

  it("fails closed on semantic errors and only uses the compatibility engine for infrastructure failures", () => {
    const handler = pathBooleanHandler();

    expect(handler).toContain('"provider-capability-missing"');
    expect(handler).toContain('"provider-init-failed"');
    expect(handler).toContain('"worker-failed"');
    expect(handler).toContain('"worker-unavailable"');
    expect(handler).toContain(
      "result = await combineStudioShapes(baseSpec, topSpec, op)",
    );
    expect(handler).toContain("if (!result.ok)");
    expect(handler.indexOf("if (!result.ok)")).toBeGreaterThan(
      handler.indexOf("result = await combineStudioShapes(baseSpec, topSpec, op)"),
    );
  });

  it("owns cancellation, Worker lifetime, timeline cleanup, and selection ref synchronization", () => {
    const page = moduleEdges("./StudioPage.tsx").source;
    const handler = pathBooleanHandler();

    expect(page).toContain("pathBooleanAbortRef.current?.abort()");
    expect(page).toContain("pathBooleanClientRef.current?.dispose()");
    expect(handler).toContain("removeTrack(document, id)");
    expect(handler).toContain("applyGroupSelectionState({");
    expect(handler).toContain("Skia 고품질 경로");
  });
});
