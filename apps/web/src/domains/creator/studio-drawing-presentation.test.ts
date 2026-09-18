import { describe, expect, it } from "vitest";

import { withStudioDrawingPresentation } from "./studio-drawing-presentation";

describe("studio drawing presentation", () => {
  it("adds app chrome hints without replacing unrelated document state", () => {
    const query = withStudioDrawingPresentation(
      "?workspace=draw&room=team-a&version=12",
      "app",
    );

    expect(query.get("drawingShell")).toBe("app");
    expect(query.get("uiMode")).toBe("focus");
    expect(query.get("startTool")).toBe("draw");
    expect(query.get("workspace")).toBe("draw");
    expect(query.get("room")).toBe("team-a");
    expect(query.get("version")).toBe("12");
  });

  it("returns to integrated chrome without discarding the canonical route envelope", () => {
    const query = withStudioDrawingPresentation(
      "?workspace=draw&room=team-a&language=ko&focus=layer-2",
      "integrated",
    );

    expect(query.get("drawingShell")).toBe("integrated");
    expect(query.get("workspace")).toBe("draw");
    expect(query.get("room")).toBe("team-a");
    expect(query.get("language")).toBe("ko");
    expect(query.get("focus")).toBe("layer-2");
  });
});
