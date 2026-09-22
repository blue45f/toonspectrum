import { describe, expect, it } from "vitest";

import { projectStudioSkiaLiveTransformElements } from "./studio-skia-live-transform-projection";

import type { DrawEl, El } from "../studio-element-model";
import type { StudioLiveTransformDraftSnapshot } from "../studio-live-transform-draft-store";

function stroke(id: string, offset = 0): DrawEl & El {
  return {
    id,
    type: "draw",
    kind: "freehand",
    points: [offset, 0, offset + 12, 12],
    pressures: [0.5, 0.8],
    stroke: "#111111",
    strokeWidth: 4,
  } as DrawEl & El;
}

function snapshot(
  element: DrawEl,
  phase: "active" | "handoff" = "active",
  revision = 1,
): StudioLiveTransformDraftSnapshot {
  return {
    scope: "page:p1",
    entries: [{ element, clip: null }],
    phase,
    revision,
  };
}

describe("projectStudioSkiaLiveTransformElements", () => {
  it("keeps the authored projection when no matching draft owns pixels", () => {
    const elements = [stroke("a"), stroke("b")];
    const result = projectStudioSkiaLiveTransformElements(elements, null, "page:p1");
    expect(result).toEqual({ elements, token: "base" });
    expect(projectStudioSkiaLiveTransformElements(
      elements,
      { ...snapshot(stroke("a")), scope: "page:p2" },
      "page:p1",
    )).toEqual({ elements, token: "base" });
  });

  it("hides only the active exact-draft source with a frame-stable token", () => {
    const elements = [stroke("a"), stroke("b")];
    const first = projectStudioSkiaLiveTransformElements(
      elements,
      snapshot(stroke("a", 20), "active", 1),
      "page:p1",
    );
    const second = projectStudioSkiaLiveTransformElements(
      elements,
      snapshot(stroke("a", 24), "active", 2),
      "page:p1",
    );
    expect(first.token).toBe(second.token);
    expect(first.elements[0]).toMatchObject({ id: "a", hidden: true });
    expect(first.elements[1]).toBe(elements[1]);
  });

  it("keeps a handoff hidden until the authoritative draw matches", () => {
    const original = stroke("a");
    const terminal = stroke("a", 40);
    const waiting = projectStudioSkiaLiveTransformElements(
      [original],
      snapshot(terminal, "handoff", 3),
      "page:p1",
    );
    expect(waiting.elements[0]).toMatchObject({ hidden: true });
    const caughtUp = projectStudioSkiaLiveTransformElements(
      [{ ...terminal }],
      snapshot(terminal, "handoff", 3),
      "page:p1",
    );
    expect(caughtUp.token).toBe("base");
    expect(caughtUp.elements[0]).toEqual(terminal);
  });
});
