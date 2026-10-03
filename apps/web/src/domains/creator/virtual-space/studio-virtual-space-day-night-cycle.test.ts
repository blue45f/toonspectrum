import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as dayNightCycle from "./studio-virtual-space-day-night-cycle";
import {
  studioDayNightName,
  studioDayNightTimeOfDay,
  STUDIO_DAY_NIGHT_CYCLE_MS,
} from "./studio-virtual-space-day-night-cycle";

describe("studioDayNightTimeOfDay", () => {
  it("시작 시각을 0, 하루 뒤를 0으로 순환한다", () => {
    expect(studioDayNightTimeOfDay(0, 0)).toBe(0);
    expect(studioDayNightTimeOfDay(STUDIO_DAY_NIGHT_CYCLE_MS, 0)).toBeCloseTo(0, 8);
    expect(studioDayNightTimeOfDay(STUDIO_DAY_NIGHT_CYCLE_MS / 2, 0)).toBeCloseTo(0.5, 8);
  });

  it("음수 오프셋도 양의 비율로 감싼다", () => {
    expect(studioDayNightTimeOfDay(-1000, 0)).toBeGreaterThan(0);
    expect(studioDayNightTimeOfDay(-1000, 0)).toBeLessThan(1);
  });
});

describe("studioDayNightName", () => {
  it("시간대별 한글/영문 이름", () => {
    expect(studioDayNightName(0.4).ko).toBe("아침");
    expect(studioDayNightName(0.5).en).toBe("Day");
    expect(studioDayNightName(0).ko).toBe("밤");
    expect(studioDayNightName(0.74).ko).toBe("해질녘");
    expect(studioDayNightName(0.25).ko).toBe("새벽");
  });
});

describe("전면 틴트 오버레이 부재", () => {
  it("주야 사이클 모듈은 틴트 색상·알파를 산출하는 경로를 제공하지 않는다", () => {
    expect("studioDayNightTintAlpha" in dayNightCycle).toBe(false);
    expect("studioDayNightAmbientAt" in dayNightCycle).toBe(false);
    const tintExports = Object.keys(dayNightCycle).filter((key) => /tint/i.test(key));
    expect(tintExports).toEqual([]);
  });

  it("캔버스와 living world 어디에도 화면 전체를 덮는 틴트 오버레이가 없다", () => {
    const canvasSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx"),
      "utf8",
    );
    expect(canvasSource).not.toContain("lightingOverlay");
    expect(canvasSource).not.toContain("studioDayNightTintAlpha");
    expect(canvasSource).not.toContain("fillRect(0, 0, manifest.width, manifest.height)");

    const livingWorldSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/domains/creator/virtual-space/studio-virtual-space-living-world.ts"),
      "utf8",
    );
    expect(livingWorldSource).not.toContain("dayNight");
    expect(livingWorldSource).not.toContain("MULTIPLY");
  });
});
