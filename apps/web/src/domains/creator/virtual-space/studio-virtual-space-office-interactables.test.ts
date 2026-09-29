import { describe, expect, it } from "vitest";
import {
  activateOfficeObject,
  findNearestOfficeObject,
  officeActionText,
  officeInteractionNotice,
  shouldStandUp,
  STANDING_SEAT_STATE,
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
