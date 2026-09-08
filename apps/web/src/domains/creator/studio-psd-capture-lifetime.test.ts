import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import type { PageState } from "./studio-page-state";

// Execute the product's small Host orchestration directly, without mounting the entire GPU editor.
// The AST extraction keeps the actual awaits/finally and metadata selection under test.
const source = ts.createSourceFile("Host.tsx", readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8",
), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration: ts.FunctionDeclaration | undefined;
function find(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "exportCurrentPageToPsd") declaration = node;
  else ts.forEachChild(node, find);
}
find(source);
if (!declaration) throw new Error("Missing product PSD orchestration");
const executable = ts.transpileModule(declaration.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("product PSD capture lifetime and canonical metadata", () => {
  it.each(["resolve", "reject"] as const)("holds capture mode through every layer until the PSD operation %ss", async (result) => {
    const activePage: PageState = { id: "A", elements: [], canvasH: 1080, bg: "#ffffff", bgGrad: null };
    const capturedPage: PageState = {
      ...activePage, canvasH: 1440, bg: "#123456",
      elements: [{ id: "accepted", type: "draw", mode: "pen", kind: "freehand", brush: "pencil", points: [10, 10, 20, 30], stroke: "#ff00ff", strokeWidth: 8 }],
    };
    const layerWork = deferred<unknown>();
    const started = deferred<void>();
    const exportPagePsd = vi.fn(() => { started.resolve(); return layerWork.promise; });
    const context = {
      ensureSharedDocumentAvailableForExport: () => true,
      activePage, masterEditMode: true,
      setSelectedId: vi.fn(), setMasterEditMode: vi.fn(),
      preserveStudioViewBeforeCapture: vi.fn(), hideStrokeGuide: vi.fn(), setIsExporting: vi.fn(),
      loadStudioPsdExportModule: async () => ({ exportPagePsd }),
      captureReadyStageForPage: async (_page: PageState, onReady: (page: PageState) => void) => {
        onReady(capturedPage); return "ready-stage";
      },
      EMPTY_LAYER_GROUPS: [], isEffectivelyHidden: () => false,
      CANVAS_W: 720, canvasH: 1080, effScale: 1, exportScale: 2, bg: "#ffffff", bgGrad: null,
    };
    const run = new Function(...Object.keys(context), `${executable}; return exportCurrentPageToPsd;`)(
      ...Object.values(context),
    ) as () => Promise<unknown>;
    const operation = run();
    await started.promise;

    expect(context.setIsExporting.mock.calls).toEqual([[true]]);
    expect(context.setMasterEditMode.mock.calls).toEqual([[false]]);
    expect(exportPagePsd).toHaveBeenCalledWith("ready-stage", capturedPage.elements, 720, 1440, 1, {
      scale: 2, background: { color: "#123456", gradient: null },
    });

    if (result === "resolve") {
      layerWork.resolve("complete-psd");
      await expect(operation).resolves.toBe("complete-psd");
    } else {
      const assertion = expect(operation).rejects.toThrow("layer failed");
      layerWork.reject(new Error("layer failed"));
      await assertion;
    }
    expect(context.setIsExporting.mock.calls).toEqual([[true], [false]]);
    expect(context.setMasterEditMode.mock.calls).toEqual([[false], [true]]);
  });
});
