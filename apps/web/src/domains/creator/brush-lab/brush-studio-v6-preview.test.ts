import { describe, expect, it } from "vitest";

import {
  mixPreviewPigments,
  resolveBrushStudioV6LiveTransport,
  resolveBrushStudioV6PointerIntent,
  shouldBrushStudioV6HandleMoveEvent,
} from "./brush-studio-v6-preview";

describe("Brush Studio V6 pigment preview", () => {
  it("keeps the subtractive preview deterministic", () => {
    expect(mixPreviewPigments("#1d4ed8", "#eab308", 0.5)).toBe(
      mixPreviewPigments("#1d4ed8", "#eab308", 0.5),
    );
  });

  it("does not collapse a mixed pigment to either endpoint", () => {
    const mixed = mixPreviewPigments("#1d4ed8", "#eab308", 0.5);
    expect(mixed).not.toBe("rgba(29,78,216,1)");
    expect(mixed).not.toBe("rgba(234,179,8,1)");
  });
});

describe("Brush Studio V6 live input authority", () => {
  const touch = Object.freeze({ pointerType: "touch", width: 10, height: 10 });

  it("routes touch contacts according to the selected pen policy", () => {
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-only", true)).toBe("ignore");
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-draw-finger-pan", true)).toBe("gesture");
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-draw-two-finger-gesture", true)).toBe("gesture");
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-ink-finger-water", true)).toBe("water");
    expect(resolveBrushStudioV6PointerIntent(touch, "touch-draw", true)).toBe("draw");
  });

  it("rejects palm-sized contacts before touch drawing or water routing", () => {
    const palm = Object.freeze({ pointerType: "touch", width: 50, height: 30 });
    expect(resolveBrushStudioV6PointerIntent(palm, "touch-draw", true)).toBe("reject-palm");
    expect(resolveBrushStudioV6PointerIntent(palm, "pen-ink-finger-water", true)).toBe("reject-palm");
    expect(resolveBrushStudioV6PointerIntent(palm, "touch-draw", false)).toBe("draw");
  });

  it("never classifies a pen contact as a palm", () => {
    expect(resolveBrushStudioV6PointerIntent(
      { pointerType: "pen", width: 64, height: 64 },
      "pen-only",
      true,
    )).toBe("draw");
  });

  it("falls back from unavailable raw or coalesced transports", () => {
    expect(resolveBrushStudioV6LiveTransport("auto", {
      pointerRawUpdate: true,
      coalescedEvents: true,
    })).toBe("raw-coalesced");
    expect(resolveBrushStudioV6LiveTransport("raw-coalesced", {
      pointerRawUpdate: false,
      coalescedEvents: true,
    })).toBe("move-coalesced");
    expect(resolveBrushStudioV6LiveTransport("move-coalesced", {
      pointerRawUpdate: false,
      coalescedEvents: false,
    })).toBe("move-basic");
  });

  it("accepts exactly one authoritative movement event stream", () => {
    expect(shouldBrushStudioV6HandleMoveEvent("pointerrawupdate", "raw-coalesced")).toBe(true);
    expect(shouldBrushStudioV6HandleMoveEvent("pointermove", "raw-coalesced")).toBe(false);
    expect(shouldBrushStudioV6HandleMoveEvent("pointermove", "move-coalesced")).toBe(true);
    expect(shouldBrushStudioV6HandleMoveEvent("pointerrawupdate", "move-coalesced")).toBe(false);
    expect(shouldBrushStudioV6HandleMoveEvent("pointermove", "move-basic")).toBe(true);
  });
});
