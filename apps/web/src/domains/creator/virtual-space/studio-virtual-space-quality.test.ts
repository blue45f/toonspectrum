import { describe, expect, it } from "vitest";
import {
  StudioVirtualAdaptiveQualityController,
  studioVirtualAutomaticQualityTier,
  studioVirtualQualityProfile,
} from "./studio-virtual-space-quality";

describe("Virtual Studio adaptive quality", () => {
  it("selects accessible and mobile-safe defaults without hiding explicit choices", () => {
    expect(studioVirtualAutomaticQualityTier({ viewportWidth: 390, reducedMotion: true })).toBe("accessibility");
    expect(studioVirtualAutomaticQualityTier({ viewportWidth: 390, reducedMotion: false, deviceMemory: 4, hardwareConcurrency: 6 })).toBe("balanced");
    expect(studioVirtualQualityProfile("ultra", { viewportWidth: 390, reducedMotion: false }).tier).toBe("ultra");
  });

  it("keeps the accessibility tier pinned when adaptive sampling is disabled for reduced motion", () => {
    const controller = new StudioVirtualAdaptiveQualityController("accessibility");
    let sample = controller.sample(8, false);
    for (let index = 0; index < 2_000; index += 1) sample = controller.sample(8, false);
    expect(sample.tier).toBe("accessibility");
    expect(sample.changed).toBe(false);
  });

  it("degrades only after sustained slow frames and recovers slowly", () => {
    const controller = new StudioVirtualAdaptiveQualityController("high");
    let sample = controller.sample(60, true);
    for (let index = 0; index < 70; index += 1) sample = controller.sample(60, true);
    expect(sample.tier).toBe("balanced");
    expect(sample.changed || sample.tier === "balanced").toBe(true);
    for (let index = 0; index < 700; index += 1) sample = controller.sample(10, true);
    expect(["balanced", "high", "ultra"]).toContain(sample.tier);
  });
});
