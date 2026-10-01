import { describe, expect, it } from "vitest";

import {
  createOfficeZone,
  officeZoneAriaLabel,
  officeZoneById,
  officeZoneEntryCopy,
  officeZonesByType,
  resolveOfficeZoneTransition,
  STUDIO_DEFAULT_OFFICE_ZONES,
  studioOfficeZoneContains,
  validateOfficeZones,
  zoneAtPoint,
} from "./studio-virtual-space-office-zones";

const FOCUS = officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-focus")!;
const CAFE = officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-cafe")!;
const LOUNGE = officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-lounge")!;

describe("STUDIO_DEFAULT_OFFICE_ZONES", () => {
  it("존 종류가 8종 이상이다", () => {
    const types = new Set(STUDIO_DEFAULT_OFFICE_ZONES.map((zone) => zone.type));
    expect(types.size).toBeGreaterThanOrEqual(8);
  });

  it("한영 이름과 규칙·앰비언트 힌트를 갖는다", () => {
    for (const zone of STUDIO_DEFAULT_OFFICE_ZONES) {
      expect(zone.labelKo.trim().length).toBeGreaterThan(0);
      expect(zone.labelEn.trim().length).toBeGreaterThan(0);
      expect(zone.rules.length).toBeGreaterThan(0);
      for (const rule of zone.rules) {
        expect(rule.labelKo.trim().length).toBeGreaterThan(0);
        expect(rule.labelEn.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("집중존은 입장 시 음소거를 제안한다", () => {
    expect(FOCUS.suggestMuteOnEnter).toBe(true);
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-library")!.suggestMuteOnEnter).toBe(true);
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-meeting")!.privateAudio).toBe(true);
  });

  it("기본 존 전체가 월드 경계 안에 있고 구조 검증를 통과한다", () => {
    expect(validateOfficeZones(STUDIO_DEFAULT_OFFICE_ZONES, { width: 1280, height: 960 })).toEqual([]);
  });
});

describe("createOfficeZone", () => {
  it("유효한 입력으로 존을 만든다", () => {
    const zone = createOfficeZone({
      id: "custom-hall", type: "event-hall", labelKo: "이벤트홀", labelEn: "Event Hall",
      shape: { kind: "rect", x: 0, y: 0, width: 100, height: 80 },
      rules: [{ id: "r1", severity: "info", labelKo: "규칙", labelEn: "Rule" }],
      suggestMuteOnEnter: false,
    });
    expect(zone?.id).toBe("custom-hall");
  });

  it("silent 플래그를 살균한다 (조용한 구역)", () => {
    const base = {
      id: "quiet", type: "focus-zone", labelKo: "조용한 존", labelEn: "Quiet Zone",
      shape: { kind: "rect", x: 0, y: 0, width: 100, height: 80 },
    };
    expect(createOfficeZone({ ...base, silent: true })?.silent).toBe(true);
    // true가 아니면 플래그를 붙이지 않는다.
    expect(createOfficeZone({ ...base, silent: false })?.silent).toBeUndefined();
    expect(createOfficeZone({ ...base })?.silent).toBeUndefined();
  });

  it("무효 입력을 거부한다", () => {
    const base = {
      id: "ok", type: "lobby", labelKo: "로비", labelEn: "Lobby",
      shape: { kind: "rect", x: 0, y: 0, width: 10, height: 10 },
    };
    expect(createOfficeZone({ ...base, id: " " })).toBeNull();
    expect(createOfficeZone({ ...base, type: "unknown" })).toBeNull();
    expect(createOfficeZone({ ...base, labelKo: " " })).toBeNull();
    expect(createOfficeZone({ ...base, shape: { kind: "rect", x: 0, y: 0, width: 0, height: 10 } })).toBeNull();
    expect(createOfficeZone({ ...base, shape: { kind: "polygon", points: [{ x: 0, y: 0 }] } })).toBeNull();
    expect(createOfficeZone({ ...base, rules: [{ id: "r", severity: "bogus", labelKo: "a", labelEn: "b" }] })).toBeNull();
  });

  it("다각형 존을 만든다", () => {
    const zone = createOfficeZone({
      id: "poly", type: "lounge", labelKo: "라운지", labelEn: "Lounge",
      shape: { kind: "polygon", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }] },
    });
    expect(zone?.shape.kind).toBe("polygon");
    expect(studioOfficeZoneContains(zone!, { x: 50, y: 20 })).toBe(true);
    expect(studioOfficeZoneContains(zone!, { x: 90, y: 70 })).toBe(false);
  });
});

describe("zoneAtPoint", () => {
  it("점이 속한 존을 찾는다", () => {
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 100, y: 100 })?.id).toBe("zone-focus");
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 1000, y: 700 })?.id).toBe("zone-meeting");
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 700, y: 950 })).toBeNull();
  });

  it("겹치는 존에서는 좁은 존(서브 존)을 우선한다", () => {
    // 카페는 라운지 안에, 리셉션은 로비 안에 있다.
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 500, y: 600 })?.id).toBe("zone-cafe");
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 400, y: 600 })?.id).toBe("zone-lounge");
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 750, y: 900 })?.id).toBe("zone-reception");
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: 660, y: 860 })?.id).toBe("zone-lobby");
  });

  it("경계 포함·무효 좌표를 처리한다", () => {
    expect(studioOfficeZoneContains(FOCUS, { x: 40, y: 40 })).toBe(true);
    expect(studioOfficeZoneContains(FOCUS, { x: 310, y: 250 })).toBe(true);
    expect(studioOfficeZoneContains(FOCUS, { x: 311, y: 250 })).toBe(false);
    expect(zoneAtPoint(STUDIO_DEFAULT_OFFICE_ZONES, { x: Number.NaN, y: 0 })).toBeNull();
    expect(zoneAtPoint([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("resolveOfficeZoneTransition", () => {
  it("전이 5종을 판정한다", () => {
    expect(resolveOfficeZoneTransition(null, null)).toBe("stay-outside");
    expect(resolveOfficeZoneTransition(FOCUS, FOCUS)).toBe("stay-inside");
    expect(resolveOfficeZoneTransition(null, FOCUS)).toBe("enter");
    expect(resolveOfficeZoneTransition(FOCUS, null)).toBe("exit");
    expect(resolveOfficeZoneTransition(FOCUS, CAFE)).toBe("switch");
  });
});

describe("officeZoneEntryCopy / officeZoneAriaLabel", () => {
  it("입장 안내 문구를 만든다", () => {
    const ko = officeZoneEntryCopy(FOCUS, "ko");
    expect(ko.title).toBe("집중존");
    expect(ko.rules.length).toBeGreaterThan(0);
    expect(ko.ambientHint).toContain("백색소음");
    const en = officeZoneEntryCopy(FOCUS, "en");
    expect(en.title).toBe("Focus Zone");
  });

  it("접근성 라벨에 종류와 음소거 제안을 담는다", () => {
    expect(officeZoneAriaLabel(FOCUS, "ko")).toContain("조용한 구역");
    expect(officeZoneAriaLabel(FOCUS, "ko")).toContain("음소거 권장");
    expect(officeZoneAriaLabel(LOUNGE, "ko")).toContain("공용 구역");
    expect(officeZoneAriaLabel(LOUNGE, "ko")).not.toContain("음소거");
    expect(officeZoneAriaLabel(CAFE, "en")).toContain("Cafe");
  });
});

describe("officeZonesByType", () => {
  it("종류로 존을 찾는다", () => {
    expect(officeZonesByType(STUDIO_DEFAULT_OFFICE_ZONES, "cafe").map((zone) => zone.id)).toEqual(["zone-cafe"]);
  });
});

describe("validateOfficeZones", () => {
  it("중복 id·경계 밖 도형을 지적한다", () => {
    const bad = createOfficeZone({
      id: "zone-focus", type: "lobby", labelKo: "x", labelEn: "y",
      shape: { kind: "rect", x: 1200, y: 900, width: 200, height: 200 },
    })!;
    const errors = validateOfficeZones([FOCUS, bad], { width: 1280, height: 960 });
    expect(errors.some((error) => error.includes("duplicate"))).toBe(true);
    expect(errors.some((error) => error.includes("geometry"))).toBe(true);
  });
});
