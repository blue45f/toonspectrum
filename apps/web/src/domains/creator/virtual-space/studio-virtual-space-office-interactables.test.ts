import { describe, expect, it } from "vitest";
import {
  activateOfficeObject,
  findNearestOfficeObject,
  officeActionText,
  officeActionTextForState,
  officeFurnitureInitialState,
  officeFurnitureStateKey,
  officeInteractionNotice,
  shouldStandUp,
  STANDING_SEAT_STATE,
  STUDIO_OFFICE_OBJECT_REGISTRY,
  type StudioOfficeObject,
} from "./studio-virtual-space-office-interactables";

const DESK: StudioOfficeObject = {
  id: "desk-1",
  kind: "desk",
  position: { x: 100, y: 100 },
  radius: 40,
  labelKo: "내 책상",
  labelEn: "My desk",
  seatPoint: { x: 100, y: 120 },
};

const CAFE: StudioOfficeObject = {
  id: "cafe-1",
  kind: "cafeteria",
  position: { x: 500, y: 500 },
  radius: 60,
  labelKo: "카페테리아",
  labelEn: "Cafeteria",
};

describe("findNearestOfficeObject", () => {
  it("가까운 오브젝트를 찾는다", () => {
    const found = findNearestOfficeObject([DESK, CAFE], { x: 105, y: 105 });
    expect(found?.id).toBe("desk-1");
  });

  it("범위 밖이면 null이다", () => {
    const found = findNearestOfficeObject([DESK], { x: 900, y: 900 });
    expect(found).toBeNull();
  });
});

describe("officeActionText", () => {
  it("종류별 액션 문구를 반환한다", () => {
    expect(officeActionText(DESK).ko).toBe("앉기");
    expect(officeActionText(CAFE).ko).toBe("휴식하기");
  });
});

describe("activateOfficeObject", () => {
  it("책상에 앉는다", () => {
    const { result, seatState } = activateOfficeObject(DESK, STANDING_SEAT_STATE, "available", 1000);
    expect(result.kind).toBe("sit");
    expect(seatState.seated).toBe(true);
    expect(seatState.deskId).toBe("desk-1");
    if (result.kind === "sit") {
      expect(result.seatPoint).toEqual({ x: 100, y: 120 });
    }
  });

  it("앉은 책상을 다시 누르면 일어난다", () => {
    const seated = { seated: true, deskId: "desk-1", seatPoint: { x: 100, y: 120 } } as const;
    const { result, seatState } = activateOfficeObject(DESK, seated, "available", 1000);
    expect(result.kind).toBe("stand");
    expect(seatState.seated).toBe(false);
  });

  it("카페테리아에서 휴식 상태가 된다", () => {
    const { result, userStatus } = activateOfficeObject(CAFE, STANDING_SEAT_STATE, "available", 1000);
    expect(result.kind).toBe("rest");
    expect(userStatus).toBe("break");
  });

  it("휴식 중 다시 누르면 복귀한다", () => {
    const { result, userStatus } = activateOfficeObject(CAFE, STANDING_SEAT_STATE, "break", 1000);
    expect(result.kind).toBe("stop-rest");
    expect(userStatus).toBe("available");
  });

  it("휴식하면 앉은 상태가 해제된다", () => {
    const seated = { seated: true, deskId: "desk-1", seatPoint: { x: 100, y: 120 } } as const;
    const { seatState } = activateOfficeObject(CAFE, seated, "available", 1000);
    expect(seatState.seated).toBe(false);
  });

  it("회의실 문은 회의 중 상태가 된다", () => {
    const door: StudioOfficeObject = {
      id: "door-1",
      kind: "meeting-door",
      position: { x: 300, y: 300 },
      radius: 50,
      labelKo: "회의실 A",
      labelEn: "Meeting Room A",
    };
    const { result, userStatus } = activateOfficeObject(door, STANDING_SEAT_STATE, "available", 1000);
    expect(result.kind).toBe("enter-meeting");
    expect(userStatus).toBe("in-meeting");
  });
});

describe("shouldStandUp", () => {
  it("앉은 위치에서 멀어지면 일어난다", () => {
    const seated = { seated: true, deskId: "desk-1", seatPoint: { x: 100, y: 120 } } as const;
    expect(shouldStandUp(seated, { x: 200, y: 200 }, true)).toBe(true);
  });

  it("앉은 위치 근처에서는 유지된다", () => {
    const seated = { seated: true, deskId: "desk-1", seatPoint: { x: 100, y: 120 } } as const;
    expect(shouldStandUp(seated, { x: 105, y: 125 }, true)).toBe(false);
  });

  it("움직이지 않으면 유지된다", () => {
    const seated = { seated: true, deskId: "desk-1", seatPoint: { x: 100, y: 120 } } as const;
    expect(shouldStandUp(seated, { x: 500, y: 500 }, false)).toBe(false);
  });
});

describe("officeInteractionNotice", () => {
  it("앉기 알림 문구를 반환한다", () => {
    const notice = officeInteractionNotice({ kind: "sit", objectId: "desk-1", seatPoint: { x: 0, y: 0 } }, "내 책상", "My desk");
    expect(notice?.ko).toContain("내 책상");
  });
});

const CHAIR: StudioOfficeObject = {
  id: "chair-1",
  kind: "chair",
  position: { x: 100, y: 100 },
  radius: 40,
  labelKo: "휴게 의자",
  labelEn: "Lounge chair",
  seatPoint: { x: 100, y: 120 },
};
const DOOR: StudioOfficeObject = { id: "door-1", kind: "door", position: { x: 200, y: 200 }, radius: 40, labelKo: "문", labelEn: "Door" };
const LIGHT: StudioOfficeObject = { id: "light-1", kind: "light-switch", position: { x: 300, y: 300 }, radius: 40, labelKo: "조명", labelEn: "Light" };
const COFFEE: StudioOfficeObject = { id: "coffee-1", kind: "coffee-machine", position: { x: 400, y: 400 }, radius: 40, labelKo: "커피 머신", labelEn: "Coffee machine" };

describe("신규 가구 상태 머신", () => {
  it("의자에 앉고 일어난다", () => {
    const sit = activateOfficeObject(CHAIR, STANDING_SEAT_STATE, "available", 1000);
    expect(sit.result.kind).toBe("sit");
    expect(sit.seatState.seated).toBe(true);
    expect(sit.furnitureState?.stateKey).toBe("chair:occupied");
    const stand = activateOfficeObject(CHAIR, sit.seatState, "available", 2000, sit.furnitureState ?? undefined);
    expect(stand.result.kind).toBe("stand");
    expect(stand.furnitureState?.stateKey).toBe("chair:empty");
  });

  it("문은 열림/닫힘을 토글한다", () => {
    const opened = activateOfficeObject(DOOR, STANDING_SEAT_STATE, "available", 1000);
    expect(opened.result).toMatchObject({ kind: "toggle-door", open: true });
    expect(opened.furnitureState?.stateKey).toBe("door:open");
    const closed = activateOfficeObject(DOOR, STANDING_SEAT_STATE, "available", 2000, opened.furnitureState ?? undefined);
    expect(closed.result).toMatchObject({ kind: "toggle-door", open: false });
    expect(closed.furnitureState?.stateKey).toBe("door:closed");
  });

  it("조명은 켜기/끄기를 토글한다", () => {
    const on = activateOfficeObject(LIGHT, STANDING_SEAT_STATE, "available", 1000);
    expect(on.result).toMatchObject({ kind: "toggle-light", on: true });
    const off = activateOfficeObject(LIGHT, STANDING_SEAT_STATE, "available", 2000, on.furnitureState ?? undefined);
    expect(off.result).toMatchObject({ kind: "toggle-light", on: false });
  });

  it("커피머신은 내리기→추출 중→가져가기 순서로 전이한다", () => {
    const brewing = activateOfficeObject(COFFEE, STANDING_SEAT_STATE, "available", 1000);
    expect(brewing.result.kind).toBe("brew-coffee");
    expect(brewing.furnitureState?.stateKey).toBe("coffee:brewing");
    // 추출 중 다시 누르면 상태 유지
    const still = activateOfficeObject(COFFEE, STANDING_SEAT_STATE, "available", 2000, brewing.furnitureState ?? undefined);
    expect(still.furnitureState?.stateKey).toBe("coffee:brewing");
    // 8초 경과 후 활성화하면 추출 완료로 올려 take-coffee
    const ready = activateOfficeObject(COFFEE, STANDING_SEAT_STATE, "available", 10_000, brewing.furnitureState ?? undefined);
    expect(ready.result.kind).toBe("take-coffee");
    expect(ready.furnitureState?.stateKey).toBe("coffee:idle");
  });

  it("상태 의존 액션 문구를 반환한다", () => {
    expect(officeActionTextForState(CHAIR, "chair:occupied").ko).toBe("일어서기");
    expect(officeActionTextForState(DOOR, "door:open").ko).toBe("닫기");
    expect(officeActionTextForState(LIGHT, "light:off").ko).toBe("켜기");
    expect(officeActionTextForState(COFFEE, "coffee:ready").ko).toBe("커피 가져가기");
  });

  it("신규 결과 알림 문구를 반환한다", () => {
    expect(officeInteractionNotice({ kind: "toggle-door", objectId: "door-1", open: true }, "문", "Door")?.ko).toContain("열었어요");
    expect(officeInteractionNotice({ kind: "toggle-light", objectId: "light-1", on: true }, "조명", "Light")?.ko).toContain("켰어요");
    expect(officeInteractionNotice({ kind: "brew-coffee", objectId: "coffee-1" }, "커피 머신", "Coffee machine")?.ko).toContain("내리는 중");
    expect(officeInteractionNotice({ kind: "take-coffee", objectId: "coffee-1" }, "커피 머신", "Coffee machine")?.ko).toContain("가져갔어요");
  });

  it("가구 초기 상태를 반환한다", () => {
    expect(officeFurnitureInitialState("chair")).toBe("chair:empty");
    expect(officeFurnitureInitialState("door")).toBe("door:closed");
    expect(officeFurnitureInitialState("light-switch")).toBe("light:off");
    expect(officeFurnitureInitialState("coffee-machine")).toBe("coffee:idle");
    expect(officeFurnitureStateKey("door", undefined)).toBe("door:closed");
    expect(officeFurnitureStateKey("coffee-machine", { stateKey: "coffee:brewing", changedAt: 1000 }, 9001)).toBe("coffee:ready");
    expect(officeFurnitureStateKey("coffee-machine", { stateKey: "coffee:brewing", changedAt: 1000 }, 5000)).toBe("coffee:brewing");
  });
});

describe("STUDIO_OFFICE_OBJECT_REGISTRY", () => {
  it("최소 8종의 가구를 포함한다", () => {
    const kinds = new Set(STUDIO_OFFICE_OBJECT_REGISTRY.map((entry) => entry.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(8);
    expect(STUDIO_OFFICE_OBJECT_REGISTRY.length).toBeGreaterThanOrEqual(8);
  });
});
