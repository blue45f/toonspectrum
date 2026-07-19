import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly allImports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly source: string;
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
    ts.ScriptKind.TSX
  );
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      allImports.push(node.moduleSpecifier.text);
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const hasRuntimeValue = !clause || (
        !clause.isTypeOnly
        && (
          Boolean(clause.name)
          || Boolean(namedBindings && ts.isNamespaceImport(namedBindings))
          || Boolean(
            namedBindings
            && ts.isNamedImports(namedBindings)
            && namedBindings.elements.some((specifier) => !specifier.isTypeOnly)
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
  return { allImports, dynamicImports, source, valueImports };
}

const STACK_OPTIONAL_MODULES = [
  "./StudioAiProvenancePanel",
  "./StudioAutoActionsPanel",
  "./StudioBackground3D",
  "./StudioCharacterBiblePanel",
  "./StudioCheckpointPanel",
  "./StudioColorWheelOverlay",
  "./StudioCommentsPanel",
  "./StudioContinuityPanel",
  "./StudioPageReviewPanel",
  "./StudioProductionInsightsPanel",
  "./StudioPublicationOperationsPanel",
  "./StudioPublishPackagePanel",
  "./StudioPublishPreflightPanel",
  "./StudioQuickActionsMenu",
  "./StudioReferencePanel",
  "./StudioScenarioAutoLayoutPanel",
  "./StudioScrollPreviewPanel",
  "./StudioStoryboardGridPanel",
  "./StudioTeamPanel",
  "./StudioTimelapsePanel",
  "./StudioVrmPoser",
  "./StudioWriterRoomPanel",
  "./WorkFxPanel",
] as const;

describe("Studio lazy panel stack boundary", () => {
  it("keeps one-way static ownership from StudioPage", () => {
    const page = moduleEdges("./StudioPage.tsx");
    const stack = moduleEdges("./StudioLazyPanelStack.tsx");
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx");

    expect(
      page.valueImports.filter((specifier) => specifier === "./StudioLazyPanelStack")
    ).toEqual(["./StudioLazyPanelStack"]);
    expect(page.source.match(/<StudioLazyPanelStack\b/g)).toHaveLength(1);
    expect(page.source).not.toContain("interface StudioLazyPanelStackProps");
    expect(page.source).not.toContain("interface StudioLazyPanelStackHandlers");
    expect(stack.allImports).not.toContain("./StudioPage");
    expect(stack.dynamicImports).toEqual([]);
    expect(stack.source).not.toContain('"use no memo"');
    expect(stack.source).toContain("export interface StudioLazyPanelStackHandlers");
    expect(stack.source).toContain("export interface StudioLazyPanelStackProps");
    expect(stack.source).toContain("export const StudioLazyPanelStack = memo(");
    expect(
      stack.valueImports.filter(
        (specifier) => specifier === "./StudioThreeDPreviewPanelStack"
      )
    ).toEqual(["./StudioThreeDPreviewPanelStack"]);
    expect(previewStack.allImports).toContain("./StudioLazyPanelStack");
    expect(previewStack.valueImports).not.toContain("./StudioLazyPanelStack");
    expect(previewStack.dynamicImports).toEqual([]);
    expect(previewStack.source).not.toContain('"use no memo"');
    expect(previewStack.source).toContain(
      "export type StudioThreeDPreviewPanelStackProps = Pick<"
    );
    expect(previewStack.source).toContain(
      "export type StudioScrollScenarioPreviewPanelStackProps = Pick<"
    );
    expect(previewStack.source).toContain(
      "export const StudioThreeDPreviewPanelStack = memo("
    );
    expect(previewStack.source).toContain(
      "export const StudioScrollScenarioPreviewPanelStack = memo("
    );

    for (const specifier of [...stack.valueImports, ...previewStack.valueImports]) {
      expect(specifier).not.toMatch(/^(?:konva|react-konva|three)(?:\/|$)/);
    }
  });

  it("uses the neutral lazy registry instead of importing optional panel implementations", () => {
    const stack = moduleEdges("./StudioLazyPanelStack.tsx");
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx");
    const registry = moduleEdges("./studio-page-lazy-ui.ts");
    const background3dLoader = moduleEdges("./studio-background-3d-loader.ts");

    expect(stack.valueImports).toContain("./studio-page-lazy-ui");
    expect(previewStack.valueImports).toContain("./studio-page-lazy-ui");
    for (const optionalModule of STACK_OPTIONAL_MODULES) {
      expect(stack.valueImports, `${optionalModule} must not be eager`).not.toContain(optionalModule);
      expect(stack.dynamicImports, `${optionalModule} must not bypass the registry`).not.toContain(optionalModule);
      expect(previewStack.valueImports, `${optionalModule} must not be eager`).not.toContain(optionalModule);
      expect(previewStack.dynamicImports, `${optionalModule} must not bypass the registry`).not.toContain(optionalModule);
      expect(registry.valueImports, `${optionalModule} must remain optional`).not.toContain(optionalModule);
      if (optionalModule === "./StudioBackground3D") {
        expect(registry.valueImports).toContain("./studio-background-3d-loader");
        expect(
          background3dLoader.dynamicImports.filter((specifier) => specifier === optionalModule)
        ).toEqual([optionalModule]);
      } else {
        expect(
          registry.dynamicImports.filter((specifier) => specifier === optionalModule),
          `${optionalModule} must have exactly one registry loader`
        ).toEqual([optionalModule]);
      }
    }
    expect(stack.valueImports).not.toContain("./StudioVrmPoser");
  });

  it("preserves semantic 3D transactions and initial-scene cleanup", () => {
    const page = moduleEdges("./StudioPage.tsx").source;
    const stack = moduleEdges("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const stackUseStart = page.indexOf("<StudioLazyPanelStack");
    const stackUseEnd = page.indexOf("/>", stackUseStart);
    const stackUse = page.slice(stackUseStart, stackUseEnd);

    expect(stackUseStart).toBeGreaterThan(-1);
    expect(stackUseEnd).toBeGreaterThan(stackUseStart);
    expect(page).toContain(
      "const studioLazyPanelStackHandlers = useStudioStableHandlers<StudioLazyPanelStackHandlers>({"
    );
    expect(page).toContain("stableHandlers={studioLazyPanelStackHandlers}");
    expect(page).toContain("setCurrentPageId,");
    expect(stackUse).not.toContain("setCurrentPageId={setCurrentPageId}");
    expect(page).toContain("insertVrmResult: (result) => applyStudioVrmInsertResult({");
    expect(page).toContain("insertBg3dResult: (result) => applyStudioBg3dInsertResult({");
    expect(stack).toContain("<StudioThreeDPreviewPanelStack");
    expect(stack).toContain("<StudioScrollScenarioPreviewPanelStack");
    expect(previewStack).toContain("onInsert={insertVrmResult}");
    expect(previewStack).toContain("onInsert={insertBg3dResult}");
    expect(previewStack).toContain("initialScene={poserInitialScene}");
    expect(previewStack).toContain("setPoserInitialElementId(undefined)");
    expect(previewStack).toContain("setBg3dInitialElementId(undefined)");
    expect(previewStack).not.toContain("applyStudioVrmInsertResult");
    expect(previewStack).not.toContain("applyStudioBg3dInsertResult");
  });

  it("keeps all six modal loading overlays colocated with their Suspense boundaries", () => {
    const stack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const contracts = [
      ["PoserLoadingOverlay", "포저를 여는 중"],
      ["Bg3DLoadingOverlay", "3D 배경 도구를 여는 중"],
      ["TimelapseLoadingOverlay", "타임랩스 도구를 여는 중"],
      ["StoryboardGridLoadingOverlay", "스토리보드 그리드를 여는 중"],
      ["ScrollPreviewLoadingOverlay", "스크롤 미리보기를 여는 중"],
      ["ScenarioAutoLayoutLoadingOverlay", "시나리오 자동 생성 도구를 여는 중"],
    ] as const;

    for (const [name, label] of contracts) {
      expect(stack).toContain(`function ${name}()`);
      expect(stack).toContain(label);
      expect(stack).toContain(`<Suspense fallback={<${name} />}>`);
    }
    expect(stack.match(/aria-live="polite"/g)).toHaveLength(6);
    expect(stack.match(/<Loader2\b/g)).toHaveLength(6);
  });

  it("guards optional surfaces with their existing open or mounted flags", () => {
    const rootStack = moduleEdges("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const stack = `${rootStack}\n${previewStack}`;

    for (const condition of [
      "poserVrmOpen ? (",
      "bg3dOpen ? (",
      "timelapseOpen ? (",
      "storyboardGridOpen ? (",
      "pageReviewOpen ? (",
      "commentsPanelMounted ? (",
      "teamPanelOpen ? (",
      "continuityOpen ? (",
      "scrollPreviewOpen ? (",
      "scenarioOpen ? (",
      "publicationOperationsOpen ? (",
      "publishPackageOpen && publishPackagePlan ? (",
      "aiProvenanceOpen ? (",
      "writerRoomOpen ? (",
      "characterBibleOpen ? (",
      "autoActionsOpen ? (",
      "checkpointPanelOpen ? (",
      "referencePanelOpen ? (",
      "colorWheelOpen ? (",
    ] as const) {
      expect(stack).toContain(condition);
    }
  });

  it("keeps the split at the original DOM seam with stable Pick-based contracts", () => {
    const stack = moduleEdges("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const firstPreview = stack.indexOf("<StudioThreeDPreviewPanelStack");
    const comments = stack.indexOf("commentsPanelMounted ? (");
    const continuity = stack.indexOf("continuityOpen ? (");
    const secondPreview = stack.indexOf("<StudioScrollScenarioPreviewPanelStack");

    expect(firstPreview).toBeGreaterThan(-1);
    expect(comments).toBeGreaterThan(firstPreview);
    expect(continuity).toBeGreaterThan(comments);
    expect(secondPreview).toBeGreaterThan(continuity);
    expect(previewStack).toContain("type StudioThreeDPreviewPanelStackHandlers = Pick<");
    expect(previewStack).toContain("type StudioScrollScenarioPreviewPanelStackHandlers = Pick<");
    expect(previewStack.match(/stableHandlers: Studio\w+Handlers;/g)).toHaveLength(2);
    expect(stack.match(/stableHandlers=\{stableHandlers\}/g)).toHaveLength(2);
  });
});
