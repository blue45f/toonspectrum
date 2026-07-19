import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleShape {
  readonly allImports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly source: string;
  readonly valueImports: readonly string[];
  readonly wholeClauseTypeImports: readonly string[];
}

function moduleShape(relativePath: string): ModuleShape {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const valueImports: string[] = [];
  const wholeClauseTypeImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      allImports.push(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (clause?.isTypeOnly) wholeClauseTypeImports.push(node.moduleSpecifier.text);
      const bindings = clause?.namedBindings;
      const hasRuntimeValue = !clause || (
        !clause.isTypeOnly
        && (
          Boolean(clause.name)
          || Boolean(bindings && ts.isNamespaceImport(bindings))
          || Boolean(
            bindings
            && ts.isNamedImports(bindings)
            && bindings.elements.some((specifier) => !specifier.isTypeOnly)
          )
        )
      );
      if (hasRuntimeValue) valueImports.push(node.moduleSpecifier.text);
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
  return {
    allImports,
    dynamicImports,
    source,
    valueImports,
    wholeClauseTypeImports,
  };
}

describe("Studio 3D insert controller boundary", () => {
  it("keeps the pure controller free of editor and renderer runtime imports", () => {
    const controller = moduleShape("./studio-3d-insert-controller.ts");

    expect(controller.allImports).toEqual([
      "./studio-editor-scope",
      "./StudioBackground3D",
      "./StudioVrmPoser",
    ]);
    expect(controller.wholeClauseTypeImports).toEqual(controller.allImports);
    expect(controller.valueImports).toEqual([]);
    expect(controller.dynamicImports).toEqual([]);
    expect(controller.source).not.toContain("allowDuringSave");
    expect(controller.source).not.toContain("StudioPage");
    expect(controller.source).not.toContain("konva");
    expect(controller.source).not.toContain("three");
    expect(controller.source).not.toContain("react");
  });

  it("keeps StudioPage as the single static orchestration owner", () => {
    const page = moduleShape("./StudioPage.tsx");

    expect(
      page.valueImports.filter(
        (specifier) => specifier === "./studio-3d-insert-controller"
      )
    ).toEqual(["./studio-3d-insert-controller"]);
    expect(page.dynamicImports).not.toContain("./studio-3d-insert-controller");
    expect(page.source).toContain(
      "function captureStudioMutationTicket(): StudioEditorMutationTicket"
    );
    expect(page.source).toContain(
      "ticket: StudioEditorMutationTicket,"
    );
    expect(page.source).toContain(
      "useRef<StudioEditorMutationTicket | null>(null)"
    );
    expect(page.source).not.toContain("ReturnType<typeof captureStudioMutationTicket>");
  });

  it("exposes only semantic boolean insert transactions to the lazy modal stack", () => {
    const stack = moduleShape("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleShape("./StudioThreeDPreviewPanelStack.tsx").source;
    const handlersStart = stack.indexOf("export interface StudioLazyPanelStackHandlers");
    const propsStart = stack.indexOf("export interface StudioLazyPanelStackProps", handlersStart);
    const componentStart = stack.indexOf("export const StudioLazyPanelStack =", propsStart);
    const handlerContract = stack.slice(handlersStart, propsStart);
    const propContract = stack.slice(propsStart, componentStart);
    const component = stack.slice(componentStart);

    expect(handlersStart).toBeGreaterThanOrEqual(0);
    expect(propsStart).toBeGreaterThan(handlersStart);
    expect(componentStart).toBeGreaterThan(propsStart);
    expect(handlerContract).toContain("insertVrmResult: StudioVrmInsertHandler;");
    expect(handlerContract).toContain("insertBg3dResult: StudioBg3dInsertHandler;");
    expect(handlerContract).not.toMatch(/^\s*(?:addRenderedImage|applyBg3dRenderedImage|canApplyStudioMutation|patchEl):/mu);
    expect(propContract).not.toContain("RefObject<{ authScopeKey:");
    expect(propContract).not.toMatch(/^\s*bg3dInitialElementId:/mu);
    expect(propContract).not.toMatch(/^\s*(?:poser|bg3d)MutationTicketRef:/mu);
    expect(component).toContain("<StudioThreeDPreviewPanelStack");
    expect(previewStack).toContain("onInsert={insertVrmResult}");
    expect(previewStack).toContain("onInsert={insertBg3dResult}");
    expect(previewStack).not.toContain("poserMutationTicketRef.current");
    expect(previewStack).not.toContain("bg3dMutationTicketRef.current");
    expect(previewStack).not.toContain("canApplyStudioMutation");
    expect(previewStack).not.toContain("applyBg3dRenderedImage");
    expect(previewStack).not.toContain("addRenderedImage");
    expect(previewStack).not.toContain("patchEl");
  });

  it("wires fail-closed commit results before selection, tool, and guide side effects", () => {
    const page = moduleShape("./StudioPage.tsx").source;
    const addStart = page.indexOf("function addEl(el: El): boolean");
    const addEnd = page.indexOf("// ── 레이어 그룹", addStart);
    const addElement = page.slice(addStart, addEnd);
    const renderedImageStart = page.indexOf("function addRenderedImage(");
    const bgStart = page.indexOf("function applyBg3dRenderedImage(");
    const renderedImage = page.slice(renderedImageStart, bgStart);
    const bgEnd = page.indexOf("async function addBuiltinRasterAsset", bgStart);
    const backgroundInsert = page.slice(bgStart, bgEnd);

    expect(addStart).toBeGreaterThanOrEqual(0);
    expect(addElement.indexOf("if (!commit([...elements, el])) return false;")).toBeGreaterThanOrEqual(0);
    expect(addElement.indexOf("setSelectedId(el.id);")).toBeGreaterThan(
      addElement.indexOf("if (!commit([...elements, el])) return false;")
    );
    expect(renderedImage).toContain("return addEl({");
    expect(backgroundInsert).toContain("if (!patchEl(targetElementId, {");
    expect(backgroundInsert).toContain("if (!addEl({");
    expect(backgroundInsert).toContain(
      "if (!commit(plan.nextElements, { groups: plan.nextGroups })) return false;"
    );
    expect(backgroundInsert.indexOf("setSelectedId(plan.anchorElementId);")).toBeGreaterThan(
      backgroundInsert.indexOf(
        "if (!commit(plan.nextElements, { groups: plan.nextGroups })) return false;"
      )
    );
    expect(backgroundInsert.indexOf("commitStudioDrawingAssistDocument(")).toBeGreaterThan(
      backgroundInsert.indexOf("setTool(\"select\");")
    );
    expect(backgroundInsert).toContain(
      "const anchor = plan.nextElements.find((element) => element.id === plan.anchorElementId);"
    );
    expect(backgroundInsert).not.toContain("if (!commitStudioDrawingAssistDocument(");
    expect(backgroundInsert).not.toMatch(
      /const\s+\w+\s*=\s*commitStudioDrawingAssistDocument\(/u
    );
    expect(backgroundInsert.lastIndexOf("return true;")).toBeGreaterThan(
      backgroundInsert.indexOf("commitStudioDrawingAssistDocument(")
    );
  });
});
