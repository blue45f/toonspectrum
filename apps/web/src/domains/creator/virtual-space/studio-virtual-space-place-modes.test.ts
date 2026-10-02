import { describe, expect, it } from "vitest";

import {
  PLACE_MODE_ENTER_STABLE_MS,
  PLACE_MODE_EXIT_STABLE_MS,
  parsePlaceWorkMode,
  placeModeAudienceCameraTarget,
  placeModeAutoStatus,
  placeModeEntryCopy,
  placeModeExitCopy,
  placeModeNeedsJoinConfirm,
  placeModeWhiteboardCopy,
  placeWorkModeForZoneType,
  placeWorkModeMeta,
  PLACE_WORK_MODES,
} from "./studio-virtual-space-place-modes";
import {
  createOfficeZone,
  STUDIO_DEFAULT_OFFICE_ZONES,
  officeZoneById,
  validateOfficeZones,
} from "./studio-virtual-space-office-zones";

describe("PlaceWorkMode 기본", () => {
  it("다섯 가지 모드를 정의한다", () => {
    expect(PLACE_WORK_MODES).toEqual(["conference", "focus-desk", "stage", "lounge", "none"]);
  });

  it("parsePlaceWorkMode는 유효한 값만 받는다", () => {
    expect(parsePlaceWorkMode("conference")).toBe("conference");
    expect(parsePlaceWorkMode("stage")).toBe("stage");
    expect(parsePlaceWorkMode("bogus")).toBeNull();
    expect(parsePlaceWorkMode(undefined)).toBeNull();
  });

  it("모드마다 한영 메타를 갖는다", () => {
    for (const mode of PLACE_WORK_MODES) {
      const meta = placeWorkModeMeta(mode);
      expect(meta.labelKo.trim().length).toBeGreaterThan(0);
      expect(meta.labelEn.trim().length).toBeGreaterThan(0);
      expect(meta.descriptionKo.trim().length).toBeGreaterThan(0);
      expect(meta.descriptionEn.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("placeWorkModeForZoneType 폴백 매핑", () => {
  it("존 종류를 업무 모드로 매핑한다", () => {
    expect(placeWorkModeForZoneType("meeting-room")).toBe("conference");
    expect(placeWorkModeForZoneType("focus-zone")).toBe("focus-desk");
    expect(placeWorkModeForZoneType("library")).toBe("focus-desk");
    expect(placeWorkModeForZoneType("event-hall")).toBe("stage");
    expect(placeWorkModeForZoneType("studio")).toBe("stage");
    expect(placeWorkModeForZoneType("lounge")).toBe("lounge");
    expect(placeWorkModeForZoneType("cafe")).toBe("lounge");
    expect(placeWorkModeForZoneType("lobby")).toBe("none");
    expect(placeWorkModeForZoneType("phone-booth")).toBe("none");
  });
});

describe("placeModeAutoStatus", () => {
  it("모드별 자동 presence 상태를 반환한다", () => {
    expect(placeModeAutoStatus("conference")).toBe("in-meeting");
    expect(placeModeAutoStatus("stage")).toBe("presenting");
    expect(placeModeAutoStatus("focus-desk")).toBe("focusing");
    expect(placeModeAutoStatus("lounge")).toBe("break");
    expect(placeModeAutoStatus("none")).toBeNull();
  });
});

describe("placeModeNeedsJoinConfirm", () => {
  it("회의실·스테이지만 참여 확인을 거친다", () => {
    expect(placeModeNeedsJoinConfirm("conference")).toBe(true);
    expect(placeModeNeedsJoinConfirm("stage")).toBe(true);
    expect(placeModeNeedsJoinConfirm("focus-desk")).toBe(false);
    expect(placeModeNeedsJoinConfirm("lounge")).toBe(false);
    expect(placeModeNeedsJoinConfirm("none")).toBe(false);
  });
});

describe("진입·이탈 문구", () => {
  const label = { ko: "회의실", en: "Meeting Room" };

  it("진입 문구가 한영으로 나온다", () => {
    const ko = placeModeEntryCopy("conference", label, "ko");
    const en = placeModeEntryCopy("conference", label, "en");
    expect(ko.title).toContain("회의실");
    expect(en.title).toContain("Meeting Room");
    expect(ko.body.length).toBeGreaterThan(0);
  });

  it("이탈 문구가 정리를 약속한다", () => {
    const ko = placeModeExitCopy("conference", label, "ko");
    expect(ko.body).toContain("마이크");
  });

  it("화이트보드 제안 문구가 있다", () => {
    const copy = placeModeWhiteboardCopy("ko");
    expect(copy.cta).toBe("화이트보드 열기");
  });
});

describe("placeModeAudienceCameraTarget", () => {
  it("발표자가 없으면 자기 위치를 그대로 둔다", () => {
    const self = { x: 100, y: 200 };
    expect(placeModeAudienceCameraTarget(self, null)).toEqual(self);
  });

  it("발표자 쪽으로 blend만큼 당긴다", () => {
    const target = placeModeAudienceCameraTarget({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(target.x).toBe(50);
    expect(target.y).toBe(0);
  });

  it("blend 범위를 0~1로 고정한다", () => {
    const target = placeModeAudienceCameraTarget({ x: 0, y: 0 }, { x: 100, y: 0 }, 5);
    expect(target.x).toBe(100);
  });
});

describe("디바운스 상수", () => {
  it("진입 600ms·이탈 1200ms다", () => {
    expect(PLACE_MODE_ENTER_STABLE_MS).toBe(600);
    expect(PLACE_MODE_EXIT_STABLE_MS).toBe(1_200);
  });
});

describe("zone 스키마 workMode 확장", () => {
  it("기본 오피스 맵의 존에 업무 모드가 지정돼 있다", () => {
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-meeting")!.workMode).toBe("conference");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-focus")!.workMode).toBe("focus-desk");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-library")!.workMode).toBe("focus-desk");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-event-hall")!.workMode).toBe("stage");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-studio")!.workMode).toBe("stage");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-lounge")!.workMode).toBe("lounge");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-cafe")!.workMode).toBe("lounge");
    expect(officeZoneById(STUDIO_DEFAULT_OFFICE_ZONES, "zone-lobby")!.workMode).toBeUndefined();
  });

  it("createOfficeZone이 workMode를 살균한다", () => {
    const zone = createOfficeZone({
      id: "zone-test", type: "meeting-room", labelKo: "테스트", labelEn: "Test",
      shape: { kind: "rect", x: 0, y: 0, width: 100, height: 100 },
      workMode: "conference",
    });
    expect(zone?.workMode).toBe("conference");

    const invalid = createOfficeZone({
      id: "zone-test", type: "meeting-room", labelKo: "테스트", labelEn: "Test",
      shape: { kind: "rect", x: 0, y: 0, width: 100, height: 100 },
      workMode: "party",
    });
    expect(invalid).toBeNull();
  });

  it("validateOfficeZones가 잘못된 workMode를 잡는다", () => {
    const zone = createOfficeZone({
      id: "zone-test", type: "meeting-room", labelKo: "테스트", labelEn: "Test",
      shape: { kind: "rect", x: 0, y: 0, width: 100, height: 100 },
      workMode: "conference",
    })!;
    expect(validateOfficeZones([zone], { width: 1280, height: 960 })).toEqual([]);
    const tampered = { ...zone, workMode: "party" } as unknown as typeof zone;
    expect(validateOfficeZones([tampered], { width: 1280, height: 960 }).length).toBeGreaterThan(0);
  });
});
