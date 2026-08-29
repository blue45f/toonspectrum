import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCanvasViewportStack } from "./canvas/read-studio-canvas-viewport-stack";
import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const pageSource = readStudioCuttoonEditorSource();
const viewportSource = readStudioCanvasViewportStack(import.meta.url, "./canvas/");
const proxySource = readFileSync(
  new URL("./StudioGroupUniformResizeProxy.tsx", import.meta.url),
  "utf8",
);
// 2026-08-21 intentional: the proxy call site and the single-object Transformer moved verbatim out
// of StudioCanvasViewport.tsx into the canvas selection-decorations leaf. The viewport still owns
// the resize handlers and the bounds they consume, which is what the rest of this test asserts.
const selectionDecorationsSource = readFileSync(
  new URL("./canvas/StudioCanvasSelectionDecorations.tsx", import.meta.url),
  "utf8",
);

function functionBody(name: string): string {
  const start = pageSource.indexOf(`function ${name}`);
  expect(
    start,
    `StudioPage must expose the runtime function ${name}`,
  ).toBeGreaterThanOrEqual(0);
  const tail = pageSource.slice(start + `function ${name}`.length);
  const nextFunction = /\n {2}(?:async )?function [A-Za-z]/.exec(tail);
  const end =
    nextFunction?.index === undefined
      ? pageSource.length
      : start + `function ${name}`.length + nextFunction.index;
  expect(
    end,
    `${name} must have a readable function boundary`,
  ).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

function expectSourceToken(
  source: string,
  token: string,
  contract: string,
): void {
  expect(
    source.includes(token),
    `${contract} must include ${JSON.stringify(token)}`,
  ).toBe(true);
}

describe("Studio group uniform-resize runtime boundary", () => {
  it("renders a dedicated group proxy and transformer instead of attaching the single-object transformer to children", () => {
    expectSourceToken(
      proxySource,
      'name="studio-group-uniform-resize-proxy"',
      "dedicated group resize proxy",
    );
    expectSourceToken(
      proxySource,
      'name="studio-group-uniform-resize-transformer"',
      "dedicated group resize Transformer",
    );
    expectSourceToken(
      selectionDecorationsSource,
      "<StudioGroupUniformResizeProxy",
      "StudioCanvasViewport group resize integration",
    );
    expectSourceToken(viewportSource, "beginCanvasSelectionResize", "Viewport handlers");
    expectSourceToken(viewportSource, "commitCanvasSelectionResize", "Viewport handlers");
    expectSourceToken(viewportSource, "cancelCanvasSelectionResize", "Viewport handlers");
    expect(viewportSource).not.toContain("previewCanvasSelectionResize");
    expect(selectionDecorationsSource).not.toContain("previewCanvasSelectionResize");
    expect(proxySource).not.toContain("previewCanvasSelectionResize");

    expect(occurrences(selectionDecorationsSource, "<Transformer")).toBeGreaterThanOrEqual(1);
    expect(occurrences(proxySource, "<Transformer")).toBe(1);
    expectSourceToken(proxySource, "transformer.nodes([proxy])", "group Transformer");
    expectSourceToken(selectionDecorationsSource, "ref={trRef}", "single-object Transformer");
    expectSourceToken(
      viewportSource,
      "unionBounds(multiSelectionVisibleBounds)",
      "multi-selection source bounds",
    );
  });

  it("previews the gesture imperatively through the engine-agnostic projection, never via document state", () => {
    const previewSource = readFileSync(
      new URL("./studio-live-transform-preview.ts", import.meta.url),
      "utf8",
    );
    // The projection math is the next-gen-engine seam: renderer-free by contract. Konva-specific
    // application must stay in the -konva adapter so a future scene backend swaps one file.
    expect(previewSource).not.toContain('from "konva"');
    expect(previewSource).not.toContain("react-konva");
    expectSourceToken(
      previewSource,
      "studioLiveTransformPreviewMat2d",
      "stable-IR projection",
    );

    expectSourceToken(
      proxySource,
      "onTransform={handleTransform}",
      "live preview wiring",
    );
    expectSourceToken(
      proxySource,
      "planStudioLiveTransformPreviewAttrs",
      "live preview projection",
    );
    // Both resolutions of a gesture — commit and every cancel path — must neutralize the ink
    // projection, or a stale affine would double-apply once the baked points render.
    expect(
      occurrences(proxySource, "clearLiveTransformPreview(active.livePreview)"),
    ).toBe(2);
    // The live path may never touch the document: the one commit in
    // commitCanvasSelectionResize stays the only mutation of the gesture.
    expect(proxySource).not.toContain("patchEl(");
    expect(proxySource).not.toContain("setPagesHistory");
    expectSourceToken(
      selectionDecorationsSource,
      "livePreviewElementId={",
      "single-stroke live preview opt-in",
    );
  });

  it("starts one exact multi-selection lease after validating IDs, locks, and source bounds", () => {
    const source = functionBody("beginCanvasSelectionResize");
    const idsHelper = functionBody("currentCanvasResizeSelectionIds");
    const boundsGuard = functionBody("finitePositiveGroupResizeBounds");

    expectSourceToken(source, "currentCanvasResizeSelectionIds()", "resize begin");
    expectSourceToken(idsHelper, "marqueeIdsRef.current", "resize ids helper");
    expectSourceToken(idsHelper, "selectedIdRef.current", "resize single-object ids");
    expectSourceToken(source, "new Set", "resize begin");
    expectSourceToken(source, "activeElementsRef.current", "resize begin");
    expectSourceToken(source, "currentPageIdRef.current", "resize page snapshot");
    expectSourceToken(source, "masterEditModeRef.current", "resize master snapshot");
    expectSourceToken(source, "captureStudioMutationTicket()", "resize document snapshot");
    expectSourceToken(source, "isEffectivelyLocked", "resize begin");
    expectSourceToken(
      source,
      "finitePositiveGroupResizeBounds(sourceBounds)",
      "resize source bounds",
    );
    expectSourceToken(boundsGuard, "Number.isFinite", "resize bounds guard");
    expectSourceToken(boundsGuard, "bounds.width > 0", "resize bounds guard");
    expectSourceToken(boundsGuard, "bounds.height > 0", "resize bounds guard");
    expectSourceToken(source, "beginLiveResourceEdit(", "resize begin");
    expectSourceToken(source, "uniqueIds.size !== selectedIds.length", "resize duplicate guard");
    expectSourceToken(source, "!currentById.has(id)", "resize missing-ID guard");
    expectSourceToken(source, "sourceElements:", "resize element identity snapshot");
    expect(source).not.toContain("completeSelectedGroupId()");
    // Multi-select (2+) or a single freehand stroke (CSP free-scale on one layer).
    expectSourceToken(source, "singleDrawResize", "single stroke free-scale");
    expectSourceToken(source, 'type === "draw"', "single stroke free-scale");
    expect(source).toContain("selectedIds.length < 2 && !singleDrawResize");
    expect(source.indexOf("isEffectivelyLocked")).toBeLessThan(
      source.indexOf("beginLiveResourceEdit("),
    );
    expect(source).not.toContain("commit(");
    expect(source).not.toContain("patchEl(");
  });

  it("bakes every member through the uniform planner in exactly one document commit", () => {
    const source = functionBody("commitCanvasSelectionResize");

    expectSourceToken(source, "planStudioGroupUniformResize", "resize commit");
    expectSourceToken(source, "groupResizeRef.current", "resize commit");
    expectSourceToken(source, "currentPageIdRef.current", "resize page identity");
    expectSourceToken(source, "masterEditModeRef.current", "resize master identity");
    expectSourceToken(source, "currentCanvasResizeSelectionIds()", "resize commit");
    expectSourceToken(source, "selectionStillMatches", "resize selection identity");
    expectSourceToken(source, "sourceStillMatches", "resize element identity");
    expectSourceToken(
      source,
      "canApplyStudioMutation(session.mutationTicket)",
      "resize document identity",
    );
    expectSourceToken(source, "isEffectivelyLocked", "resize effective lock guard");
    expect(occurrences(source, "commit(")).toBe(1);
    expect(source).not.toContain("patchEl(");
    expectSourceToken(source, "finally", "resize commit");
    expectSourceToken(source, "endLiveResourceEdit()", "resize commit");
  });

  it("cancels without mutation and always releases the transform lease", () => {
    const source = functionBody("cancelCanvasSelectionResize");

    expectSourceToken(source, "groupResizeRef.current", "resize cancel");
    expectSourceToken(source, "groupResizeRef.current = null", "resize cancel");
    expectSourceToken(source, "endLiveResourceEdit()", "resize cancel");
    expect(source).not.toContain("commit(");
    expect(source).not.toContain("patchEl(");
  });

  it("fails closed when locks, selection identity, page identity, or cancellation invalidate the session", () => {
    const lifecycleStart = pageSource.indexOf(
      "// Transformer pointer capture 중에",
    );
    const lifecycleEnd = pageSource.indexOf(
      "function applyGroupSelectionState",
      lifecycleStart,
    );
    expect(lifecycleStart).toBeGreaterThanOrEqual(0);
    expect(lifecycleEnd).toBeGreaterThan(lifecycleStart);
    const lifecycleSource = pageSource.slice(lifecycleStart, lifecycleEnd);
    expectSourceToken(lifecycleSource, "useEffect(() => {", "resize lifecycle");
    expectSourceToken(lifecycleSource, "groupResizeRef.current", "resize lifecycle");
    expectSourceToken(lifecycleSource, "selectionStillMatches", "resize lifecycle");
    expectSourceToken(lifecycleSource, "activePage.id", "resize lifecycle");
    expectSourceToken(lifecycleSource, "masterEditMode", "resize lifecycle");
    expectSourceToken(lifecycleSource, "groupResizeRef.current = null", "resize lifecycle");
    expectSourceToken(lifecycleSource, "endLiveResourceEdit()", "resize lifecycle");
    expectSourceToken(
      lifecycleSource,
      "[activePage.id, masterEditMode, marqueeIds, selectedId]",
      "resize lifecycle dependencies",
    );

    const escapeStart = pageSource.indexOf(
      '} else if (e.key === "Escape") {',
    );
    const escapeEnd = pageSource.indexOf(
      "\n      } else if (",
      escapeStart + '} else if (e.key === "Escape") {'.length,
    );
    expect(escapeStart).toBeGreaterThanOrEqual(0);
    expect(escapeEnd).toBeGreaterThan(escapeStart);
    expectSourceToken(
      pageSource.slice(escapeStart, escapeEnd),
      "groupResizeRef.current",
      "Escape handling",
    );
    expectSourceToken(
      pageSource.slice(escapeStart, escapeEnd),
      "cancelCanvasSelectionResize",
      "Escape handling",
    );

    const pointerCancelSource = functionBody("onStagePointerCancel");
    expectSourceToken(
      pointerCancelSource,
      "groupResizeRef.current",
      "pointer cancellation",
    );
    expectSourceToken(
      pointerCancelSource,
      "cancelCanvasSelectionResize()",
      "pointer cancellation",
    );
    expectSourceToken(proxySource, "onCancelRef.current()", "proxy cancellation");
  });

  it("keeps the existing single-object Transformer detached for every multi/group selection", () => {
    const transformerEffectStart = pageSource.indexOf(
      "// 트랜스포머를 선택 노드",
    );
    const transformerEffectEnd = pageSource.indexOf(
      "function publishStudioCrdtSceneTransition",
      transformerEffectStart,
    );
    expect(transformerEffectStart).toBeGreaterThanOrEqual(0);
    expect(transformerEffectEnd).toBeGreaterThan(transformerEffectStart);
    const source = pageSource.slice(
      transformerEffectStart,
      transformerEffectEnd,
    );

    expectSourceToken(source, "marqueeIds.length > 0", "single Transformer effect");
    expectSourceToken(source, "tr.nodes([])", "single Transformer effect");
    expect(source).not.toContain("planStudioGroupUniformResize");
  });
});
