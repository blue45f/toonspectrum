import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const inspectorSource = readFileSync(
  new URL("./StudioInspectorAside.tsx", import.meta.url),
  "utf8",
);

describe("StudioInspectorAside transient tool boundary", () => {
  it("routes every Inspector navigation through the pointer ownership transition", () => {
    expect(inspectorSource).toContain(
      'from "./studio-inspector-tool-transition"',
    );
    expect(inspectorSource).toContain(
      "executeStudioInspectorRouteTransition(",
    );
    expect(inspectorSource).not.toContain(
      "onChange={changeInspectorLayout}",
    );
  });

  it("routes draw-mode changes through the Page-owned disarm-before-change contract", () => {
    expect(inspectorSource).toContain(
      'activateCanvasTool("draw", next);',
    );
    expect(inspectorSource).not.toContain("onDrawModeChange={setDrawMode}");
    expect(inspectorSource).not.toContain("executeStudioInspectorDrawModeTransition(");
  });

  it("keeps cross-state side effects out of React functional updaters", () => {
    expect(inspectorSource).not.toContain(
      "setPanelSplitActive((active) =>",
    );
    expect(inspectorSource).not.toContain(
      "setHistoryBrushActive((v) =>",
    );
    expect(inspectorSource).not.toContain(
      "setLayerMaskPaintActive((v) =>",
    );
    expect(inspectorSource).not.toContain(
      "setFilterMaskPaintActive((v) =>",
    );
  });

  it("disarms competing pointer owners before auto-color canvas scribble arms", () => {
    expect(inspectorSource).toContain(
      "executeStudioInspectorArmedChange(next, {",
    );
    expect(inspectorSource).toContain(
      "setActive: setAutoColorScribbleCanvasArmed",
    );
    expect(inspectorSource).not.toContain(
      "onScribbleCanvasArmedChange={setAutoColorScribbleCanvasArmed}",
    );
  });

  it("keeps collapse and mobile dismiss presentation-only so reopening restores the session", () => {
    expect(inspectorSource).toContain(
      "onClick={() => setRightPanelOpen(false)}",
    );
    expect(inspectorSource).toContain(
      "onRequestClose={() => setMobileSheet(null)}",
    );
  });
});
