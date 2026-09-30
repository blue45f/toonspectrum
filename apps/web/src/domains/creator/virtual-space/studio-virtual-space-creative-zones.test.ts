import { describe, expect, it } from "vitest";
import {
  activateCreativeZone,
  creativeZoneActionText,
  creativeZoneEnterNotice,
  creativeZoneResultNotice,
  diffCreativeZone,
  findNearestCreativeZone,
  resolveCreativeZone,
  type StudioCreativeZone,
} from "./studio-virtual-space-creative-zones";

const DRAWING: StudioCreativeZone = {
  id: "zone-drawing",
  kind: "drawing",
  position: { x: 240, y: 720 },
  radius: 70,
  labelKo: "드로잉 존",
  labelEn: "Drawing zone",
};

const LOUNGE: StudioCreativeZone = {
  id: "zone-lounge",
  kind: "lounge",
  position: { x: 1060, y: 720 },
  radius: 70,
  labelKo: "휴게실",
  labelEn: "Lounge",
};

describe("resolveCreativeZone", () => {
  it("반경 안의 공간을 찾는다", () => {
    expect(resolveCreativeZone([DRAWING, LOUNGE], { x: 250, y: 720 })?.id).toBe("zone-drawing");
  });

  it("반경 밖이면 null이다", () => {
    expect(resolveCreativeZone([DRAWING], { x: 900, y: 100 })).toBeNull();
  });

  it("겹치면 가장 가까운 공간을 찾는다", () => {
    const overlap: StudioCreativeZone = { ...LOUNGE, id: "zone-lounge-2", position: { x: 260, y: 720 } };
    expect(resolveCreativeZone([DRAWING, overlap], { x: 255, y: 720 })?.id).toBe("zone-lounge-2");
  });
});

describe("findNearestCreativeZone", () => {
  it("프롬프트 반경 안에서는 입장 전에도 찾는다", () => {
    // 입장 반경(70) 밖이지만 프롬프트 반경(90) 안
    expect(findNearestCreativeZone([DRAWING], { x: 240 + 80, y: 720 })?.id).toBe("zone-drawing");
  });
});

describe("activateCreativeZone", () => {
  it("드로잉 존에서는 캔버스 열기 이벤트를 낸다", () => {
    const { result, userStatus } = activateCreativeZone(DRAWING, "available", 1000);
    expect(result).toEqual({ kind: "open-canvas", zoneId: "zone-drawing" });
    expect(userStatus).toBe("available");
  });

  it("휴게실에서는 휴식을 토글한다", () => {
    const first = activateCreativeZone(LOUNGE, "available", 1000);
    expect(first.result.kind).toBe("rest");
    expect(first.userStatus).toBe("break");
    const second = activateCreativeZone(LOUNGE, first.userStatus, 2000);
    expect(second.result.kind).toBe("stop-rest");
    expect(second.userStatus).toBe("available");
  });

  it("전시관에서는 감상 모드 이벤트를 낸다", () => {
    const gallery: StudioCreativeZone = { ...DRAWING, id: "zone-gallery", kind: "gallery" };
    const { result } = activateCreativeZone(gallery, "available", 1000);
    expect(result.kind).toBe("open-gallery");
  });

  it("회의 공간에서는 협업 보드 이벤트를 낸다", () => {
    const meeting: StudioCreativeZone = { ...DRAWING, id: "zone-meeting", kind: "meeting" };
    const { result } = activateCreativeZone(meeting, "available", 1000);
    expect(result.kind).toBe("open-board");
  });
});

describe("diffCreativeZone", () => {
  it("입장/퇴장을 이벤트로 변환한다", () => {
    expect(diffCreativeZone(null, DRAWING)).toEqual([{ kind: "zone-entered", zoneId: "zone-drawing" }]);
    expect(diffCreativeZone(DRAWING, null)).toEqual([{ kind: "zone-exited", zoneId: "zone-drawing" }]);
    expect(diffCreativeZone(DRAWING, LOUNGE)).toEqual([
      { kind: "zone-exited", zoneId: "zone-drawing" },
      { kind: "zone-entered", zoneId: "zone-lounge" },
    ]);
    expect(diffCreativeZone(DRAWING, DRAWING)).toEqual([]);
  });
});

describe("문구", () => {
  it("휴게실은 휴식 중일 때 액션 문구가 바뀐다", () => {
    expect(creativeZoneActionText(LOUNGE, "break").ko).toBe("휴식 마치기");
    expect(creativeZoneActionText(LOUNGE, "available").ko).toBe("휴식하기");
    expect(creativeZoneActionText(DRAWING).ko).toBe("캔버스 열기");
  });

  it("입장 안내 문구가 있다", () => {
    expect(creativeZoneEnterNotice(DRAWING).ko).toContain("드로잉 존");
    expect(creativeZoneEnterNotice(LOUNGE).ko).toContain("🛋️");
  });

  it("결과 알림 문구가 있다", () => {
    const notice = creativeZoneResultNotice({ kind: "rest", zoneId: "zone-lounge" }, "휴게실", "Lounge");
    expect(notice?.ko).toContain("휴식 중");
    expect(creativeZoneResultNotice({ kind: "open-canvas", zoneId: "z" }, "드로잉 존", "Drawing")).not.toBeNull();
  });
});
