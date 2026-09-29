import { describe, expect, it } from "vitest";

import {
  canRunSpectacle,
  resolveSpectacleLevel,
  type SpectacleLevelInput,
} from "./spectacle-engine";

const base: SpectacleLevelInput = {
  intensity: "vivid",
  reducedMotion: false,
  lowPower: false,
};

describe("resolveSpectacleLevel", () => {
  it("off면 none", () => {
    expect(resolveSpectacleLevel({ ...base, intensity: "off" })).toBe("none");
  });

  it("reduced-motion이면 none", () => {
    expect(resolveSpectacleLevel({ ...base, reducedMotion: true })).toBe("none");
  });

  it("vivid + 고성능이면 full", () => {
    expect(resolveSpectacleLevel(base)).toBe("full");
  });

  it("vivid + 저전력이면 light", () => {
    expect(resolveSpectacleLevel({ ...base, lowPower: true })).toBe("light");
  });

  it("subtle이면 light", () => {
    expect(resolveSpectacleLevel({ ...base, intensity: "subtle" })).toBe("light");
  });

  it("subtle + 저전력도 light", () => {
    expect(resolveSpectacleLevel({ ...base, intensity: "subtle", lowPower: true })).toBe(
      "light",
    );
  });
});

describe("canRunSpectacle", () => {
  it("none에서는 아무것도 실행 불가", () => {
    expect(canRunSpectacle("none", "motion")).toBe(false);
    expect(canRunSpectacle("none", "heavy")).toBe(false);
  });

  it("light에서는 motion만 가능", () => {
    expect(canRunSpectacle("light", "motion")).toBe(true);
    expect(canRunSpectacle("light", "heavy")).toBe(false);
  });

  it("full에서는 모두 가능", () => {
    expect(canRunSpectacle("full", "motion")).toBe(true);
    expect(canRunSpectacle("full", "heavy")).toBe(true);
  });
});
