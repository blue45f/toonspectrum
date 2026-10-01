import { describe, expect, it } from "vitest";
import { studioNpcGuideStopLine } from "./studio-virtual-space-npc-guide";

describe("투어 경유지 대사", () => {
  it("액션별 경유지 대사를 반환한다", () => {
    const line = studioNpcGuideStopLine("story", 0);
    expect(line.ko).toContain("1번째");
    expect(line.en).toContain("Stop 1");
  });

  it("번호는 stopIndex+1이다", () => {
    const line = studioNpcGuideStopLine("canvas", 2);
    expect(line.ko).toContain("3번째");
  });

  it("모든 액션의 대사가 ko/en 쌍을 가진다", () => {
    for (const action of ["story", "canvas", "review", "assets"] as const) {
      const line = studioNpcGuideStopLine(action, 0);
      expect(line.ko.length).toBeGreaterThan(0);
      expect(line.en.length).toBeGreaterThan(0);
    }
  });
});
