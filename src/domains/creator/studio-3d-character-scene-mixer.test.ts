import { describe, it, expect } from "vitest";

import { Studio3DCharacterSceneMixer } from "./studio-3d-character-scene-mixer";

describe("Studio3DCharacterSceneMixer", () => {
  it("adds character to 3D scene with ground contact alignment", () => {
    const mixer = new Studio3DCharacterSceneMixer("scene-1", "교실 세트장");
    const char = mixer.addCharacter("harin-vrm", "하린", [0, -1, 0]);

    // Position Y should be clamped to groundY (0)
    expect(char.position[1]).toBe(0);
    expect(mixer.getConfig().characters.length).toBe(1);
  });

  it("attaches 3D props to character bone", () => {
    const mixer = new Studio3DCharacterSceneMixer("scene-1");
    mixer.addCharacter("harin-vrm", "하린");

    const ok = mixer.attachPropToCharacter(
      "harin-vrm",
      "sword-3d",
      "마법 검",
      "rightHand",
      [0, 0.1, 0],
    );

    expect(ok).toBe(true);
    const summary = mixer.generateMixSummary();
    expect(summary.totalAttachedProps).toBe(1);
  });

  it("harmonizes toon shadow bands across background and character", () => {
    const mixer = new Studio3DCharacterSceneMixer("scene-1");
    mixer.setToonShadowBands(3);

    expect(mixer.getConfig().toonShadowBands).toBe(3);
    const summary = mixer.generateMixSummary();
    expect(summary.toonShadowBands).toBe(3);
  });

  it("toggles camera wall cutaway for indoor 3D scenes", () => {
    const mixer = new Studio3DCharacterSceneMixer("scene-1");
    expect(mixer.getConfig().wallCutawayEnabled).toBe(true);

    mixer.setWallCutaway(false);
    expect(mixer.getConfig().wallCutawayEnabled).toBe(false);
  });
});
