import { describe, expect, it } from "vitest";
import { StudioVirtualAdaptiveQualityController, studioVirtualQualityProfile } from "../studio-virtual-space-quality";

describe("자동 품질의 기기 예산", () => {
  it("명시한 최고 품질도 모션 감소 설정을 존중한다", () => {
    expect(studioVirtualQualityProfile("ultra", { viewportWidth: 1440, reducedMotion: true }).tier).toBe("accessibility");
  });
  it("빠른 프레임이 이어져도 자동 품질의 모바일 상한을 넘지 않는다", () => {
    const controller = new StudioVirtualAdaptiveQualityController("balanced");
    for (let index = 0; index < 5000; index += 1) expect(controller.sample(10, true, "balanced").tier).toBe("balanced");
  });
  it("자동 모드에서 상한 변경을 반영하고 수동 품질은 강등하지 않는다", () => {
    const controller = new StudioVirtualAdaptiveQualityController("ultra");
    expect(controller.sample(16, false, "balanced").tier).toBe("ultra");
    const sample = controller.sample(16, true, "balanced");
    expect(sample.tier).toBe("balanced"); expect(sample.changed).toBe(true);
  });
  it("지속적인 저성능에서는 상한 아래로도 적응한다", () => {
    const controller = new StudioVirtualAdaptiveQualityController("balanced");
    for (let index = 0; index < 100; index += 1) controller.sample(80, true, "balanced");
    expect(["battery", "accessibility"]).toContain(controller.sample(80, true, "balanced").tier);
  });
});
