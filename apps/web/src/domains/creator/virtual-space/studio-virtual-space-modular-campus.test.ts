import { describe, expect, it } from "vitest";
import {
  STUDIO_OFFICE_ZONE_FLOOR_VISUALS,
  studioOfficeZoneFloorVisual,
  studioRoomBoundsLineStyleFor,
} from "./studio-virtual-space-modular-campus";

const palette = { accent: 0xff0000, gate: 0x00ff00 };

describe("오피스 존 바닥/벽 비주얼 (Track D)", () => {
  it("10개 존 종류 모두에 비주얼이 정의된다", () => {
    expect(Object.keys(STUDIO_OFFICE_ZONE_FLOOR_VISUALS)).toHaveLength(10);
    for (const visual of Object.values(STUDIO_OFFICE_ZONE_FLOOR_VISUALS)) {
      expect(visual.floorPattern.trim().length).toBeGreaterThan(0);
      expect(visual.floorTint).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.wallAccent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("존 종류별 조회를 지원한다", () => {
    expect(studioOfficeZoneFloorVisual("focus-zone").floorPattern).toBe("tatami");
    expect(studioOfficeZoneFloorVisual("cafe").floorPattern).toBe("herringbone");
  });

  it("hub 룸은 기존 accent 경계선을 유지한다", () => {
    expect(studioRoomBoundsLineStyleFor("lobby", [], palette))
      .toEqual({ width: 1.5, color: palette.accent, alpha: 0.08 });
  });

  it("존이 없는 룸은 기존 gate 경계선을 유지한다", () => {
    expect(studioRoomBoundsLineStyleFor("production", [], palette))
      .toEqual({ width: 1, color: palette.gate, alpha: 0.025 });
    expect(studioRoomBoundsLineStyleFor("production", undefined, palette))
      .toEqual({ width: 1, color: palette.gate, alpha: 0.025 });
  });

  it("존 매칭 룸은 존 벽 악센트 색상으로 경계선을 그린다", () => {
    const zones = [{ roomId: "meeting", type: "focus-zone" as const }];
    const line = studioRoomBoundsLineStyleFor("meeting", zones, palette);
    expect(line.color).toBe(0x5b7f6b);
    expect(line.alpha).toBe(0.06);
    expect(line.width).toBe(1);
  });

  it("여러 존이 겹치는 룸은 선이 살짝 두꺼워진다", () => {
    const zones = [
      { roomId: "meeting", type: "focus-zone" as const },
      { roomId: "meeting", type: "cafe" as const },
    ];
    expect(studioRoomBoundsLineStyleFor("meeting", zones, palette).width).toBe(1.25);
  });

  it("다른 룸의 존은 영향을 주지 않는다", () => {
    const zones = [{ roomId: "teams", type: "phone-booth" as const }];
    expect(studioRoomBoundsLineStyleFor("meeting", zones, palette).color).toBe(palette.gate);
  });
});
