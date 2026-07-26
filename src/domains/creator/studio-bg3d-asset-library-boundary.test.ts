import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function moduleSource(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function moduleImports(fileName: string) {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const valueImports: string[] = [];
  const typeImports: string[] = [];
  const dynamicImports: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = node.importClause?.isTypeOnly ? typeImports : valueImports;
      target.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { dynamicImports, typeImports, valueImports };
}

describe("Studio BG3D asset-library ownership boundary", () => {
  it("keeps the leaf panel renderer-free and prevents a reverse editor import", () => {
    const imports = moduleImports("./StudioBg3dAssetLibraryPanel.tsx");

    expect(imports.valueImports).toEqual(["lucide-react", "react"]);
    expect(imports.typeImports).toEqual(["./bg3d-model-library"]);
    expect(imports.dynamicImports).toEqual(["./studio-bg3d-canonical-glb-download"]);
    expect([...imports.valueImports, ...imports.typeImports]).not.toContain("./StudioBackground3D");
    expect(imports.valueImports).not.toContain("three");
    expect(imports.valueImports.some((source) => source.startsWith("@react-three/"))).toBe(false);
  });

  it("keeps persistence, validation, resource disposal, scene, history, and selection in the parent", () => {
    const editorSource = moduleSource("./StudioBackground3D.tsx");
    const editorImports = moduleImports("./StudioBackground3D.tsx");
    const panelSource = moduleSource("./StudioBg3dAssetLibraryPanel.tsx");

    expect(editorImports.valueImports).not.toContain("./StudioBg3dAssetLibraryPanel");
    expect(editorImports.dynamicImports).toContain("./StudioBg3dAssetLibraryPanel");
    expect(editorSource).toContain("<LazyStudioBg3dAssetLibraryPanel");
    expect(editorSource).toContain('if (tab === "models") setModelsPanelActivated(true)');
    expect(editorSource).toContain("modelsPanelActivated ? (");
    for (const ownerToken of [
      "handleUploadModelFiles",
      "importVerifiedBg3dModelsAtomically",
      "deleteStoredBg3dModel",
      "modelImportAbortRef",
      "modelRootCacheRef",
      "cacheEntry.dispose()",
      "removeSceneEntities",
      "historyRef",
      "setSelectedIds",
    ]) {
      expect(editorSource).toContain(ownerToken);
      expect(panelSource).not.toContain(ownerToken);
    }
    expect(editorSource).not.toContain('aria-label="3D 모델 및 연결 파일 선택"');
    expect(panelSource).toContain('aria-label="3D 모델 및 연결 파일 선택"');
  });

  it("preserves the single analyzable lazy editor boundary", () => {
    const loaderImports = moduleImports("./studio-background-3d-loader.ts");

    expect(loaderImports.valueImports).not.toContain("./StudioBackground3D");
    expect(loaderImports.dynamicImports).toEqual(["./StudioBackground3D"]);
  });
});
