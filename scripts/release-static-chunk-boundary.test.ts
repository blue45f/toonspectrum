import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { createStudioManualChunks } from "../apps/web/config/vite-manual-chunks";

const leaves = ["studio-material-pressure-model", "studio-hand-feel-media-load-v1", "brush/studio-ink-pressure-model", "studio-color-utils", "studio-color-wheel"];
const manual = createStudioManualChunks({ isInitialIconModule: () => false, isStudioCoreIconModule: () => false });

describe("release static chunk isolation", () => {
  it("groups only already-synchronous numeric brush leaves", () => {
    for (const leaf of leaves) {
      expect(manual(resolve(`apps/web/src/domains/creator/${leaf}.ts`))).toBe("studio-brush-numeric-contracts");
    }
    for (const file of ["brush/studio-native-brush-probe.worker.ts", "brush/studio-native-brush-document-session.ts", "render/studio-vello-hub.ts", "brush/StudioNativeBrushDocumentInspector.tsx"]) {
      expect(manual(resolve(`apps/web/src/domains/creator/${file}`))).toBeUndefined();
    }
  });
  it("keeps grouped contracts free of runtime imports and dynamic dependencies", () => {
    for (const leaf of [...leaves, "render/studio-engine-failure-policy", "contracts/studio-live-lock-resource"]) {
      const file = `apps/web/src/domains/creator/${leaf}.ts`;
      const output = ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText;
      const ast = ts.createSourceFile(file, output, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        expect(ts.isImportDeclaration(node)).toBe(false);
        if (ts.isExportDeclaration(node)) expect(node.moduleSpecifier).toBeUndefined();
        if (ts.isCallExpression(node)) expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  });
  it("loads the project archive builder after the user-activation file picker, not at editor boot", () => {
    const host = readFileSync("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "utf8");
    expect(host).not.toContain('import { buildStudioProjectPackageWithWorkspace } from');
    const start = host.indexOf("async function saveLocalStudioProjectFile()");
    const end = host.indexOf("function openLocalStudioPersonalDrive()", start);
    const action = host.slice(start, end);
    const picker = action.indexOf("await chooseStudioProjectPackageSaveTarget(");
    const load = action.indexOf('await import("./save-first/studio-project-package-with-workspace")');
    expect(picker).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(picker);
    expect(action.indexOf("currentStudioProjectSnapshot()")).toBeGreaterThan(load);
    expect(action.indexOf("await writeStudioProjectPackageToTarget")).toBeGreaterThan(load);
    expect(action).toContain("catch (cause)");
  });

  it("does not change the accepted bundle baseline or temporary allowance", () => {
    const baseline = JSON.parse(readFileSync("scripts/bundle-baseline.json", "utf8"));
    expect(baseline).toBeTruthy();
    const source = readFileSync("apps/web/config/vite-manual-chunks.ts", "utf8");
    expect(source).not.toContain("UPDATE_BUNDLE_BASELINE");
    expect(source).not.toContain("node_modules/canvaskit-wasm");
  });
});
