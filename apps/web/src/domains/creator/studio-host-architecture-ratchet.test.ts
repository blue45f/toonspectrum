import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Architecture contracts for the StudioCuttoonEditor host.
 *
 * Every number is a ratchet: it may decrease as ownership moves behind adapters, but new coupling
 * must not silently raise it. The 2026-09-09 host ceiling records the exact tree produced by the
 * typed AI comic-composer handoff; the browser API owner assertion keeps its storage boundary from
 * spreading even while the call-count baseline remains frozen.
 */
const CREATOR_DIR = fileURLToPath(new URL("./", import.meta.url));
const SRC_DIR = path.resolve(CREATOR_DIR, "../..");
const HOST_FILE = path.join(CREATOR_DIR, "StudioCuttoonEditorHost.tsx");
const RAIL_FILE = path.join(CREATOR_DIR, "StudioLeftToolRail.tsx");
const APP_ROUTER_FILE = path.join(SRC_DIR, "app/routes/AppRouter.tsx");
const STUDIO_ROUTER_FILE = path.join(CREATOR_DIR, "studio-router/StudioRouter.tsx");
const STUDIO_RUNTIME_DIR = path.join(CREATOR_DIR, "studio-cuttoon-editor/runtime");
const APP_ROUTE_GROUP_DIR = path.join(SRC_DIR, "app/routes/groups");
const SESSION_FILES = {
  "StudioCuttoonEditorViewSessionCore.ts": path.join(
    CREATOR_DIR,
    "studio-cuttoon-editor/StudioCuttoonEditorViewSessionCore.ts",
  ),
  "StudioCuttoonEditorViewSessionRest.ts": path.join(
    CREATOR_DIR,
    "studio-cuttoon-editor/StudioCuttoonEditorViewSessionRest.ts",
  ),
} as const;

const HOST_MAX_LINES = 29_488;
const ROUTER_SEAM_MAX_LINES = 100;
const STUDIO_RUNTIME_MODULE_MAX_LINES = 300;
const APP_ROUTE_GROUP_MAX_LINES = 120;
const RAIL_REACT_SETTER_PROPS_MAX = 0;
const SESSION_BAG_ANY_BASELINE: Readonly<Record<keyof typeof SESSION_FILES, number>> = {
  "StudioCuttoonEditorViewSessionCore.ts": 552,
  "StudioCuttoonEditorViewSessionRest.ts": 552,
};
const CREATOR_BROWSER_API_BASELINE: Readonly<Record<string, number>> = {
  "navigator.gpu": 1,
  // StudioFileControlCenter owns persisted/estimate/persist capability checks. The owner ratchet
  // below prevents this browser boundary from spreading to another React component.
  "navigator.storage": 5,
  indexedDB: 0,
  showOpenFilePicker: 0,
  "new Worker(": 1,
  "new OffscreenCanvas(": 0,
  "new WebSocket(": 0,
};

const BROWSER_API_PREFILTER = Object.keys(CREATOR_BROWSER_API_BASELINE);
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage", ".vite"]);

function collectSourceFiles(directory: string, output: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(absolutePath, output);
    else if (/\.tsx?$/.test(entry.name)) output.push(absolutePath);
  }
  return output;
}

function parseSource(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function moduleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const result: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      result.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function countAnyKeywords(sourceFile: ts.SourceFile): number {
  let total = 0;
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) total += 1;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return total;
}

function countBrowserApiAccess(
  sourceFile: ts.SourceFile,
  counts: Record<string, number>,
): void {
  const increment = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText();
      const member = node.name.text;
      if (member === "gpu" && /(^|\.)navigator$/.test(owner)) increment("navigator.gpu");
      else if (member === "storage" && /(^|\.)navigator$/.test(owner)) {
        increment("navigator.storage");
      } else if (member === "indexedDB") increment("indexedDB");
      else if (member === "showOpenFilePicker") increment("showOpenFilePicker");
    } else if (ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node.parent)) {
      if (node.text === "indexedDB") increment("indexedDB");
      else if (node.text === "showOpenFilePicker") increment("showOpenFilePicker");
    }
    if (ts.isNewExpression(node)) {
      const constructorName = node.expression.getText().split(".").pop();
      if (constructorName === "Worker") increment("new Worker(");
      else if (constructorName === "OffscreenCanvas") increment("new OffscreenCanvas(");
      else if (constructorName === "WebSocket") increment("new WebSocket(");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

interface ScanResult {
  readonly browserApiCounts: Record<string, number>;
  readonly hostImporters: readonly string[];
  readonly navigatorStorageOwners: readonly string[];
}

function scanSourceTree(): ScanResult {
  const hostImporters: string[] = [];
  const navigatorStorageOwners: string[] = [];
  const browserApiCounts = Object.fromEntries(
    BROWSER_API_PREFILTER.map((key) => [key, 0]),
  ) as Record<string, number>;

  for (const file of collectSourceFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    const mentionsHost = source.includes("StudioCuttoonEditorHost");
    const isCreatorComponent =
      file.startsWith(CREATOR_DIR)
      && file.endsWith(".tsx")
      && !/\.(test|spec)\.tsx$/.test(file);
    const mentionsBrowserApi =
      isCreatorComponent && BROWSER_API_PREFILTER.some((token) => source.includes(token));
    if (!mentionsHost && !mentionsBrowserApi) continue;

    const sourceFile = parseSource(file, source);
    if (
      mentionsHost
      && moduleSpecifiers(sourceFile).some((specifier) =>
        /(^|\/)StudioCuttoonEditorHost$/.test(specifier),
      )
    ) {
      hostImporters.push(path.relative(SRC_DIR, file).split(path.sep).join("/"));
    }

    if (mentionsBrowserApi) {
      const storageCountBefore = browserApiCounts["navigator.storage"] ?? 0;
      countBrowserApiAccess(sourceFile, browserApiCounts);
      if ((browserApiCounts["navigator.storage"] ?? 0) > storageCountBefore) {
        navigatorStorageOwners.push(
          path.relative(CREATOR_DIR, file).split(path.sep).join("/"),
        );
      }
    }
  }

  return {
    browserApiCounts,
    hostImporters: hostImporters.sort((left, right) => left.localeCompare(right)),
    navigatorStorageOwners: navigatorStorageOwners.sort((left, right) =>
      left.localeCompare(right)),
  };
}

const scan = scanSourceTree();

describe("studio host architecture ratchet", () => {
  it("keeps the editor host a leaf owned by StudioPage", () => {
    expect(scan.hostImporters).toEqual(["domains/creator/StudioPage.tsx"]);
    expect(
      scan.hostImporters.filter((relative) =>
        relative.startsWith("domains/creator/studio-cuttoon-editor/"),
      ),
    ).toEqual([]);
  });

  it("keeps StudioPage as the host lazy-orchestration owner", () => {
    const page = readFileSync(path.join(CREATOR_DIR, "StudioPage.tsx"), "utf8");
    const host = readFileSync(HOST_FILE, "utf8");
    expect(page).toContain('from "./StudioCuttoonEditorHost"');
    expect(page).toContain("export { StudioCuttoonEditor }");
    expect(host).toContain("export function StudioCuttoonEditor");
  });

  it("holds the editor host under the exact post-composer ceiling", () => {
    expect(readFileSync(HOST_FILE, "utf8").split("\n").length)
      .toBeLessThanOrEqual(HOST_MAX_LINES);
  });

  it("keeps application and Studio routers as small composition seams", () => {
    const measured = {
      AppRouter: readFileSync(APP_ROUTER_FILE, "utf8").split("\n").length,
      StudioRouter: readFileSync(STUDIO_ROUTER_FILE, "utf8").split("\n").length,
    };
    expect(
      Object.entries(measured)
        .filter(([, lines]) => lines > ROUTER_SEAM_MAX_LINES)
        .map(([name, lines]) => `${name}: ${lines}`),
    ).toEqual([]);
  });

  it("keeps runtime modules typed, focused, and independent of the host", () => {
    const violations: string[] = [];
    for (const entry of readdirSync(STUDIO_RUNTIME_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.includes(".test.")) {
        continue;
      }
      const file = path.join(STUDIO_RUNTIME_DIR, entry.name);
      const source = readFileSync(file, "utf8");
      const sourceFile = parseSource(file, source);
      const lines = source.split("\n").length;
      const explicitAny = countAnyKeywords(sourceFile);
      if (lines > STUDIO_RUNTIME_MODULE_MAX_LINES) {
        violations.push(`${entry.name}: ${lines} lines`);
      }
      if (explicitAny > 0) violations.push(`${entry.name}: ${explicitAny} explicit any`);
      if (
        moduleSpecifiers(sourceFile).some((specifier) =>
          /(^|\/)StudioCuttoonEditorHost$/u.test(specifier),
        )
      ) {
        violations.push(`${entry.name}: imports StudioCuttoonEditorHost`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps domain route registries small and free of broad barrels", () => {
    const violations: string[] = [];
    for (const entry of readdirSync(APP_ROUTE_GROUP_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".tsx") || entry.name.includes(".test.")) {
        continue;
      }
      const lines = readFileSync(path.join(APP_ROUTE_GROUP_DIR, entry.name), "utf8")
        .split("\n").length;
      if (lines > APP_ROUTE_GROUP_MAX_LINES) violations.push(`${entry.name}: ${lines} lines`);
      if (entry.name === "index.tsx") violations.push("index.tsx barrel is not allowed");
    }
    expect(violations).toEqual([]);
  });

  it("holds the session closure bags under their frozen any ceilings", () => {
    const names = Object.keys(SESSION_FILES) as Array<keyof typeof SESSION_FILES>;
    for (const name of names) {
      const file = SESSION_FILES[name];
      const measured = countAnyKeywords(parseSource(file, readFileSync(file, "utf8")));
      expect(measured).toBeLessThanOrEqual(SESSION_BAG_ANY_BASELINE[name]);
    }
  });

  it("holds the left tool rail under its raw-React-setter prop ceiling", () => {
    const rail = parseSource(RAIL_FILE, readFileSync(RAIL_FILE, "utf8"));
    let setterProps: number | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === "StudioLeftToolRailProps") {
        setterProps = node.members.filter((member) => {
          if (!ts.isPropertySignature(member) || !member.type) return false;
          const typeText = member.type.getText();
          return typeText.startsWith('import("react").Dispatch<')
            || typeText.startsWith("Dispatch<");
        }).length;
      }
      ts.forEachChild(node, visit);
    };
    visit(rail);
    expect(setterProps).not.toBeNull();
    expect(setterProps).toBeLessThanOrEqual(RAIL_REACT_SETTER_PROPS_MAX);
  });

  it("keeps navigator.storage access centralized in FileControlCenter", () => {
    expect(scan.navigatorStorageOwners).toEqual(["StudioFileControlCenter.tsx"]);
  });

  it("holds direct browser API access under its frozen table", () => {
    const overBudget = Object.entries(CREATOR_BROWSER_API_BASELINE)
      .filter(([api, ceiling]) => (scan.browserApiCounts[api] ?? 0) > ceiling)
      .map(([api, ceiling]) => `${api}: ${scan.browserApiCounts[api]} > ${ceiling}`);
    expect(overBudget).toEqual([]);
  });
});