import { describe, expect, it } from "vitest";

import {
  STUDIO_TOOL_HINT_ACTIVATION_COOLDOWN_MS,
  STUDIO_TOOL_HINT_AUTOMATIC_RESET_MS,
  STUDIO_TOOL_HINT_GLOBAL_MAX_AUTOMATIC_REVEALS,
  STUDIO_TOOL_HINT_GLOBAL_REVEAL_WINDOW_MS,
  STUDIO_TOOL_HINT_HOVER_COOLDOWN_MS,
  createStudioToolHintExposureManager,
} from "./studio-tool-hint-exposure";

describe("studio tool hint exposure policy", () => {
  it("cools down repeated passive hover for the same semantic tool", () => {
    const exposure = createStudioToolHintExposureManager();

    expect(exposure.canReveal("brush/ink", "hover", 1_000)).toBe(true);
    exposure.markRevealed("brush/ink", "hover", 1_000);
    expect(exposure.canReveal("brush/ink", "hover", 1_001)).toBe(false);
    expect(
      exposure.canReveal("brush/ink", "hover", 1_000 + STUDIO_TOOL_HINT_HOVER_COOLDOWN_MS)
    ).toBe(true);
  });

  it("does not punish a different tool for a previously shown hint", () => {
    const exposure = createStudioToolHintExposureManager();
    exposure.markRevealed("brush/ink", "hover", 2_000);

    expect(exposure.canReveal("brush/pencil", "hover", 2_001)).toBe(true);
  });

  it("pauses hover coaching after activation even when the control remounts", () => {
    const exposure = createStudioToolHintExposureManager();
    exposure.markActivated("brush/watercolor", 3_000);

    expect(exposure.canReveal("brush/watercolor", "hover", 3_001)).toBe(false);
    expect(
      exposure.canReveal(
        "brush/watercolor",
        "hover",
        3_000 + STUDIO_TOOL_HINT_ACTIVATION_COOLDOWN_MS
      )
    ).toBe(true);
  });

  it("keeps explicit keyboard and long-press help available during suppression", () => {
    const exposure = createStudioToolHintExposureManager();
    exposure.markActivated("eraser", 4_000);
    exposure.markRevealed("eraser", "hover", 4_000);

    expect(exposure.canReveal("eraser", "focus", 4_001)).toBe(true);
    expect(exposure.canReveal("eraser", "touch", 4_001)).toBe(true);
  });

  it("caps automatic repetition inside one learning window and later resets it", () => {
    const exposure = createStudioToolHintExposureManager();
    exposure.markRevealed("shape/rectangle", "hover", 5_000);
    exposure.markRevealed(
      "shape/rectangle",
      "hover",
      5_000 + STUDIO_TOOL_HINT_HOVER_COOLDOWN_MS
    );

    expect(
      exposure.canReveal(
        "shape/rectangle",
        "hover",
        5_000 + STUDIO_TOOL_HINT_HOVER_COOLDOWN_MS * 2
      )
    ).toBe(false);
    expect(
      exposure.canReveal(
        "shape/rectangle",
        "hover",
        5_000 + STUDIO_TOOL_HINT_AUTOMATIC_RESET_MS
      )
    ).toBe(true);
  });

  it("pauses passive tooltip roulette after an editor-wide reveal burst", () => {
    const exposure = createStudioToolHintExposureManager();
    for (let index = 0; index < STUDIO_TOOL_HINT_GLOBAL_MAX_AUTOMATIC_REVEALS; index += 1) {
      exposure.markRevealed(`tool-${index}`, "hover", 10_000 + index);
    }

    expect(exposure.canReveal("one-more-tool", "hover", 10_100)).toBe(false);
    expect(
      exposure.canReveal(
        "one-more-tool",
        "hover",
        10_000 + STUDIO_TOOL_HINT_GLOBAL_REVEAL_WINDOW_MS
      )
    ).toBe(true);
  });

  it("never lets the passive burst budget block deliberate help", () => {
    const exposure = createStudioToolHintExposureManager();
    for (let index = 0; index < STUDIO_TOOL_HINT_GLOBAL_MAX_AUTOMATIC_REVEALS; index += 1) {
      exposure.markRevealed(`burst-${index}`, "hover", 20_000 + index);
    }

    expect(exposure.canReveal("keyboard-tool", "focus", 20_100)).toBe(true);
    expect(exposure.canReveal("touch-tool", "touch", 20_100)).toBe(true);
  });
});
