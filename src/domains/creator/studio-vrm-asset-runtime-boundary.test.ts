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

function expectInOrder(source: string, tokens: readonly string[]): void {
  let cursor = 0;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor);
    expect(index, `Expected ${JSON.stringify(token)} after offset ${cursor}`).toBeGreaterThanOrEqual(cursor);
    cursor = index + token.length;
  }
}

describe("Studio VRM asset runtime ownership boundary", () => {
  it("keeps a one-way asset runtime import without pulling the editor back into the leaf", () => {
    const poser = moduleEdges("./StudioVrmPoser.tsx");
    const runtime = moduleEdges("./studio-vrm-asset-runtime.ts");
    const binding = moduleEdges("./studio-vrm-texture-paint-binding.ts");

    expect(
      poser.valueImports.filter((specifier) => specifier === "./studio-vrm-asset-runtime"),
    ).toEqual(["./studio-vrm-asset-runtime"]);
    expect(runtime.allImports).not.toContain("./StudioVrmPoser");
    expect(runtime.valueImports).toEqual([
      "three",
      "./studio-vrm-texture-paint-binding",
      "./vrm-library",
      "@/src/catalog-static",
    ]);
    expect(runtime.typeImports).toEqual(["@pixiv/three-vrm"]);
    expect(binding.allImports).toEqual([]);
    expect(runtime.dynamicImports).toEqual([
      "three/examples/jsm/loaders/GLTFLoader.js",
      "@pixiv/three-vrm",
      "@pixiv/three-vrm",
    ]);
  });

  it("keeps React, persistence, request arbitration, object URLs, and install orchestration in the parent", () => {
    const poser = moduleEdges("./StudioVrmPoser.tsx");
    const runtime = moduleEdges("./studio-vrm-asset-runtime.ts");

    for (const ownerToken of [
      "loadRequestRef",
      "getStoredVrmModel",
      "URL.createObjectURL",
      "URL.revokeObjectURL",
      "function installVrm",
      "resetFullStateHistory",
      "setVrm(",
    ]) {
      expect(poser.source).toContain(ownerToken);
      expect(runtime.source).not.toContain(ownerToken);
    }
    expect(runtime.allImports.some((specifier) => specifier.startsWith("react"))).toBe(false);
    expect(runtime.source).not.toMatch(
      /\b(?:useEffect|useLayoutEffect|useRef|useState|useSyncExternalStore)\b/u,
    );
    expect(runtime.source).not.toMatch(/\b(?:installVrm|applyPose|historyRef|setVrm)\b/u);
  });

  it("leaves stale-request disposal and object-URL revocation ordering in the parent", () => {
    const source = moduleEdges("./StudioVrmPoser.tsx").source;
    const libraryStart = source.indexOf("function loadModelFromLibraryEntry");
    const libraryEnd = source.indexOf("async function handleFileChange", libraryStart);
    expect(libraryStart).toBeGreaterThanOrEqual(0);
    expect(libraryEnd).toBeGreaterThan(libraryStart);
    const libraryLoad = source.slice(libraryStart, libraryEnd);

    expectInOrder(libraryLoad, [
      "const requestId = beginModelLoad(entry.id);",
      'const storedModel = entry.source === "memory"',
      ": await getStoredVrmModel(entry.id);",
      "if (requestId !== loadRequestRef.current) return;",
      "const objectUrl = URL.createObjectURL(storedModel.blob);",
      "const loadedVrm = await loadVrmAsset(objectUrl);",
      "if (requestId !== loadRequestRef.current) {",
      "disposeVrm(loadedVrm);",
      "installVrm(loadedVrm, storedModel.name, storedModel.id);",
      "finally {",
      "URL.revokeObjectURL(objectUrl);",
    ]);

    expect(source).toContain("const requestId = loadRequestRef.current + 1;");
    expect(source).not.toMatch(/function (?:prepareVrmScene|disposeVrm|loadVrmAsset)\b/u);
    expect(source).not.toContain("function shouldPreflightVrmUrl");
  });
});
