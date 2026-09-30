import { describe, expect, it } from "vitest";
import {
  autoClearInMeeting,
  autoSetInMeeting,
  removeUserStatus,
  setUserStatus,
  sortUserStatuses,
  userStatusBadge,
} from "./studio-virtual-space-user-status";

describe("userStatusBadge", () => {
  it("4종 상태 뱃지", () => {
    expect(userStatusBadge("in-meeting").ko).toBe("회의 중");
    expect(userStatusBadge("away").en).toBe("Away");
    expect(userStatusBadge("break").emoji).toBe("☕");
    expect(userStatusBadge("available").ko).toBe("작업 중");
  });
});

describe("setUserStatus / removeUserStatus", () => {
  it("불변 업데이트", () => {
    const m0 = new Map();
    const m1 = setUserStatus(m0, "a", "away", 100, 200);
    expect(m0.has("a")).toBe(false);
    expect(m1.get("a")).toMatchObject({ status: "away", returnAt: 200 });
  });

  it("없는 항목 삭제는 그대로 반환", () => {
    const m0 = new Map();
    expect(removeUserStatus(m0, "x")).toBe(m0);
  });

  it("삭제 동작", () => {
    const m1 = setUserStatus(new Map(), "a", "break", 100);
    const m2 = removeUserStatus(m1, "a");
    expect(m2.has("a")).toBe(false);
  });
});

describe("autoSetInMeeting / autoClearInMeeting", () => {
  it("진입 시 회의 중으로 자동 전환", () => {
    const m1 = setUserStatus(new Map(), "a", "available", 100);
    const m2 = autoSetInMeeting(m1, "a", 200);
    expect(m2.get("a")?.status).toBe("in-meeting");
  });

  it("이미 회의 중이면 그대로", () => {
    const m1 = setUserStatus(new Map(), "a", "in-meeting", 100);
    expect(autoSetInMeeting(m1, "a", 200)).toBe(m1);
  });

  it("퇴장 시 작업 중으로 복귀", () => {
    const m1 = setUserStatus(new Map(), "a", "in-meeting", 100);
    const m2 = autoClearInMeeting(m1, "a", 200);
    expect(m2.get("a")?.status).toBe("available");
  });

  it("수동 away는 덮어쓰지 않음", () => {
    const m1 = setUserStatus(new Map(), "a", "away", 100);
    expect(autoClearInMeeting(m1, "a", 200)).toBe(m1);
  });
});

describe("sortUserStatuses", () => {
  it("회의 중 → 휴식 → 자리비움 → 작업 중 순", () => {
    let m = new Map();
    m = setUserStatus(m, "w", "available", 100);
    m = setUserStatus(m, "m", "in-meeting", 100);
    m = setUserStatus(m, "a", "away", 100);
    m = setUserStatus(m, "b", "break", 100);
    const sorted = sortUserStatuses(m);
    expect(sorted.map((e) => e.sessionId)).toEqual(["m", "b", "a", "w"]);
  });
});
