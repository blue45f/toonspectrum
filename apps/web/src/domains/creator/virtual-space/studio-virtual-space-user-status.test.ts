import { describe, expect, it } from "vitest";
import {
  autoClearInMeeting,
  autoSetInMeeting,
  diffUserStatuses,
  removeUserStatus,
  setUserStatus,
  sortUserStatuses,
  STUDIO_USER_STATUSES,
  userStatusBadge,
  userStatusChangeCopy,
  userStatusesFromPresence,
  type StudioUserStatusEntry,
} from "./studio-virtual-space-user-status";
import { parseStudioPresenceUserStatus } from "./studio-virtual-space-presence";

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
    let m: ReadonlyMap<string, StudioUserStatusEntry> = new Map();
    m = setUserStatus(m, "w", "available", 100);
    m = setUserStatus(m, "m", "in-meeting", 100);
    m = setUserStatus(m, "a", "away", 100);
    m = setUserStatus(m, "b", "break", 100);
    const sorted = sortUserStatuses(m);
    expect(sorted.map((e) => e.sessionId)).toEqual(["m", "b", "a", "w"]);
  });
});

describe("상태 값 동기화 검증", () => {
  it("도메인 STATUS 집합과 presence wire allowlist가 일치한다", () => {
    for (const status of STUDIO_USER_STATUSES) {
      expect(parseStudioPresenceUserStatus(status)).toBe(status);
    }
    expect(parseStudioPresenceUserStatus("bogus")).toBeUndefined();
    expect(parseStudioPresenceUserStatus("")).toBeUndefined();
  });
});

describe("diffUserStatuses", () => {
  it("바뀐 항목만 뽑는다", () => {
    const before = setUserStatus(new Map(), "a", "available", 1_000);
    const after = setUserStatus(
      setUserStatus(before, "a", "in-meeting", 2_000),
      "b",
      "away",
      2_000,
    );
    const changes = diffUserStatuses(before, after);
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.sessionId === "a")).toMatchObject({
      previous: "available",
      next: "in-meeting",
    });
    expect(changes.find((c) => c.sessionId === "b")?.previous).toBeNull();
  });

  it("변경이 없으면 빈 배열이다", () => {
    const map = setUserStatus(new Map(), "a", "available", 1_000);
    expect(diffUserStatuses(map, map)).toHaveLength(0);
  });
});

describe("userStatusChangeCopy", () => {
  const bt = (ko: string, _en: string) => ko;

  it("상태 변경 문구를 만든다", () => {
    const copy = userStatusChangeCopy(
      bt,
      { sessionId: "a", previous: "available", next: "in-meeting", at: 2_000 },
      "지민",
    );
    expect(copy).toContain("지민");
    expect(copy).toContain("회의 중");
  });

  it("신규 참가자는 입장 문구를 만든다", () => {
    const copy = userStatusChangeCopy(
      bt,
      { sessionId: "b", previous: null, next: "break", at: 2_000 },
      "준",
    );
    expect(copy).toContain("입장");
    expect(copy).toContain("휴식 중");
  });
});

describe("userStatusesFromPresence", () => {
  it("presence 스냅샷의 userStatus를 상태 맵으로 동기화한다", () => {
    const map = userStatusesFromPresence(
      [
        { sessionId: "a", userStatus: "in-meeting" },
        { sessionId: "b" },
        { sessionId: "c", userStatus: null },
      ],
      5_000,
    );
    expect(map.get("a")).toMatchObject({ status: "in-meeting", updatedAt: 5_000 });
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(false);
  });
});
