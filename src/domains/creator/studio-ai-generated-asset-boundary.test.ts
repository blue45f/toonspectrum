import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const fileUrl = new URL("./StudioPage.tsx", import.meta.url);
const source = readFileSync(fileUrl, "utf8");
const file = ts.createSourceFile(
  fileUrl.pathname,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function functionSource(name: string): string {
  let match: ts.FunctionDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!match) throw new Error(`Missing function ${name}`);
  return (match as ts.FunctionDeclaration).getText(file);
}

function expectInOrder(value: string, fragments: readonly string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = value.indexOf(fragment, cursor + 1);
    expect(next, `Expected ${JSON.stringify(fragment)} after index ${cursor}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe("Studio AI generated asset fail-closed boundary", () => {
  it("discards the pending notice action before closing and wires the named cancel handler", () => {
    expectInOrder(functionSource("cancelAiNotice"), [
      "aiNoticePendingActionRef.current = null",
      "setAiNoticeOpen(false)",
    ]);
    expect(source).toContain("<AiAssetNotice onCancel={cancelAiNotice}");
    expect(source).toContain("cancelAiNotice: () => void;");
    expect(source).not.toContain("setAiNoticeOpen={setAiNoticeOpen}");
  });

  it("captures request provenance before image awaits and never derives it after completion", () => {
    for (const [functionName, requestCall] of [
      ["executeGenerateAsset", "await Promise.all"],
      ["executeAiBackgroundGenerate", "await generateBackgroundImage"],
      ["executeAiColorize", "await colorizeLineArt"],
      ["executeAiCharacterConsistency", "await generateConsistentCharacterImage"],
      ["executeGenerateScenarioImages", "await generateConsistentCharacterImage"],
      ["executeRegenerateScenarioImage", "await generateConsistentCharacterImage"],
    ] as const) {
      expectInOrder(functionSource(functionName), [
        "captureStudioAiGeneratedAssetProvenance",
        requestCall,
      ]);
    }
    expect(source).not.toContain("currentImageAiProvenance");
  });

  it("captures the character reference identity, source, and size before the notice gate", () => {
    expectInOrder(functionSource("onGenerateAiCharacter"), [
      "const reference = {",
      "elementId: selected.id",
      "src: selected.src",
      "width: selected.width",
      "height: selected.height",
      "runWithAiNotice",
    ]);
    expect(functionSource("executeAiCharacterConsistency")).toContain(
      "references: [{ assetId: reference.elementId }]"
    );
  });

  it("keeps prompts and menus open when a generated result cannot be committed", () => {
    expectInOrder(functionSource("executeGenerateAsset"), [
      "finalizeStudioAiGeneratedAssetProvenance(requestProvenance",
      "model: generated.model",
      "if (!addRenderedImage",
      "return;",
      "setAssetPrompt(\"\")",
      "setMenu(null)",
    ]);
    expectInOrder(functionSource("executeAiBackgroundGenerate"), [
      "if (!insertAiBackgroundImage",
      "setAiBgError",
      "return;",
      "setMenu(null)",
    ]);
    expectInOrder(functionSource("executeAiCharacterConsistency"), [
      "if (!addRenderedImage",
      "setAiCharacterError",
      "return;",
      "setMenu(null)",
    ]);
    expect(functionSource("executeAiColorize")).toContain("if (!patchEl(elId");
    expect(functionSource("executeAiColorize")).toContain("setAiColorizeError");
  });

  it("requires a successful document commit before dismissing a scenario preview", () => {
    const applyScenario = functionSource("onApplyScenarioPreview");
    expect(applyScenario).toContain("if (!commitPages(populatedPages))");
    expect(applyScenario).toContain("if (!commit([...elements, ...newEls]");
    expectInOrder(applyScenario, [
      "if (!commit([...elements, ...newEls]",
      "return;",
      "setScenarioResult(null)",
      "setScenarioOpen(false)",
    ]);
  });
});
