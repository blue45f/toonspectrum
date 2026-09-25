import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const hostSource = readStudioCuttoonEditorSource();
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
    expect(hostSource).toContain("createDrawingPracticeResultGroup");
    expect(hostSource).toContain("targetGroupId: resultGroup.id");
    expect(hostSource.indexOf("const existingSourceMissing")).toBeLessThan(
      hostSource.indexOf("replaceStudioAssets([...assetsRef.current, request.asset])"),
    );
    expect(hostSource).toContain("relinkStudioDrawingPracticeSource(existing, source, viewport)");
    expect(hostSource).toContain("commitDrawingPracticeDocument(retried, { resultGroup })");
    expect(hostSource).toContain("drawingPracticeTargetGroupId,");
    expect(hostTypeSource).toContain("drawingPracticeTargetGroupId: string | null");
    expect(pointerSource).toContain(
      "routeStudioDrawingPracticeStroke(next, drawingPracticeTargetGroupId)",
    );
  });
});
