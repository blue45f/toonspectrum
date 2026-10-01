import { describe, expect, it } from "vitest";

import {
  teammateListNextIndex,
  teammateStatusBadge,
} from "./studio-virtual-space-teammates";

describe("teammateStatusBadge", () => {
  it("활동 기준으로 배지를 만든다", () => {
    expect(teammateStatusBadge("focused")).toMatchObject({
      dotColor: "#60a5fa",
      labelKo: "집중 중 · 요청 쉬는 중",
    });
    expect(teammateStatusBadge("away")).toMatchObject({ labelKo: "자리비움" });
  });

  it("명시적 사용자 상태가 활동을 덮어쓴다", () => {
    expect(teammateStatusBadge("available", "in-meeting")).toMatchObject({
      dotColor: "#f87171",
      labelKo: "회의 중",
      labelEn: "In a meeting",
    });
    expect(teammateStatusBadge("focused", "break")).toMatchObject({ labelKo: "휴식 중" });
  });

  it("null 상태는 활동을 그대로 쓴다", () => {
    expect(teammateStatusBadge("reviewing", null)).toMatchObject({ labelKo: "원고 검토 중" });
  });
});

describe("teammateListNextIndex", () => {
  it("방향키로 이동하고 끝에서 랩어라운드한다", () => {
    expect(teammateListNextIndex(0, 3, "ArrowDown")).toBe(1);
    expect(teammateListNextIndex(2, 3, "ArrowDown")).toBe(0);
    expect(teammateListNextIndex(0, 3, "ArrowUp")).toBe(2);
    expect(teammateListNextIndex(1, 3, "ArrowUp")).toBe(0);
  });

  it("Home·End로 양 끝으로 이동한다", () => {
    expect(teammateListNextIndex(2, 3, "Home")).toBe(0);
    expect(teammateListNextIndex(0, 3, "End")).toBe(2);
  });

  it("빈 목록에서는 0을 반환한다", () => {
    expect(teammateListNextIndex(0, 0, "ArrowDown")).toBe(0);
  });

  it("범위를 벗어난 현재 인덱스를 보정한다", () => {
    expect(teammateListNextIndex(9, 3, "ArrowDown")).toBe(0);
    expect(teammateListNextIndex(-2, 3, "ArrowUp")).toBe(2);
  });
});
