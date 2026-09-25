import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const hostSource = readStudioCuttoonEditorSource();
const runtimeSource = readFileSync(
  new URL("./use-studio-drawing-practice-runtime.ts", import.meta.url),
  "utf8",
);
const pointerSource = readFileSync(
  new URL("./studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-draw.ts", import.meta.url),
  "utf8",
);
const hostTypeSource = readFileSync(
  new URL("./studio-cuttoon-editor/studio-cuttoon-stage-pointers-types.ts", import.meta.url),
  "utf8",
);

describe("Studio drawing-practice editor integration boundary", () => {
  it("creates one durable result group per attempt and routes new strokes into it", () => {
    expect(hostSource).toContain("useStudioDrawingPracticeRuntime");
    expect(runtimeSource).toContain("const createResultGroup");
    expect(runtimeSource).toContain("targetGroupId: resultGroup.id");
    expect(runtimeSource.indexOf("const existingSourceMissing")).toBeLessThan(
      runtimeSource.indexOf("input.replaceAssets([...currentAssets, request.asset])"),
    );
    expect(runtimeSource).toContain("relinkStudioDrawingPracticeSource(existing, source, viewport)");
    expect(runtimeSource).toContain("commitDocument(retried, { resultGroup })");
    expect(hostSource).toContain("drawingPracticeTargetGroupId: drawingPractice.targetGroupId");
    expect(hostTypeSource).toContain("drawingPracticeTargetGroupId: string | null");
    expect(pointerSource).toContain(
      "routeStudioDrawingPracticeStroke(next, drawingPracticeTargetGroupId)",
    );
  });
});
