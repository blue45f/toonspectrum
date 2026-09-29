// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildUserListEntries,
  StudioVirtualSpaceUserList,
  type StudioSpaceUserSnapshot,
  type StudioUserListZoneLabel,
} from "./StudioVirtualSpaceUserList";

afterEach(cleanup);

const zones: readonly StudioUserListZoneLabel[] = [
  { id: "drawing", labelKo: "드로잉 아틀리에", labelEn: "Drawing Atelier" },
  { id: "review", labelKo: "리뷰 시어터", labelEn: "Review Theater" },
];

const users: readonly StudioSpaceUserSnapshot[] = [
  { id: "u2", name: "밍", zoneId: "review", activity: "focused" },
  { id: "u1", name: "지우", zoneId: "drawing", activity: "available" },
  { id: "u3", name: "하늘", zoneId: null, activity: "away" },
  { id: "self", name: "나", zoneId: "drawing", activity: "reviewing" },
];

describe("buildUserListEntries", () => {
  it("나를 맨 앞에, 나머지는 구역 이름·이름 순으로 정렬한다", () => {
    const entries = buildUserListEntries(users, zones, "self");
    expect(entries.map((entry) => entry.id)).toEqual(["self", "u1", "u2", "u3"]);
    expect(entries[0]?.isSelf).toBe(true);
    expect(entries[0]?.zoneLabelKo).toBe("드로잉 아틀리에");
  });

  it("구역 정보가 없으면 라벨이 비고 뒤로 간다", () => {
    const entries = buildUserListEntries(users, zones, "self");
    const outside = entries.find((entry) => entry.id === "u3");
    expect(outside?.zoneLabelKo).toBe("");
    expect(outside?.zoneLabelEn).toBe("");
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const snapshot = [...users];
    buildUserListEntries(users, zones, "self");
    expect([...users]).toEqual(snapshot);
  });
});

describe("StudioVirtualSpaceUserList", () => {
  it("이름·구역·상태를 한글로 렌더한다", () => {
    render(<StudioVirtualSpaceUserList users={users} zones={zones} selfId="self" />);
    expect(screen.getByLabelText("작업 중인 사용자")).not.toBeNull();
    expect(screen.getAllByText("드로잉 아틀리에")).not.toHaveLength(0);
    expect(screen.getByText("리뷰 시어터")).not.toBeNull();
    expect(screen.getByText("구역 밖")).not.toBeNull();
    expect(screen.getByText("집중 중")).not.toBeNull();
    expect(screen.getByText("작업 가능")).not.toBeNull();
    expect(screen.getByText("자리 비움")).not.toBeNull();
    expect(screen.getByText("검토 중")).not.toBeNull();
    // 나 표시: 이름 옆에 (나) 마커
    const selfRow = document.querySelector('li[data-user-id="self"]');
    expect(selfRow?.textContent).toContain("(나)");
  });

  it("사용자가 없으면 빈 상태를 보여준다", () => {
    render(<StudioVirtualSpaceUserList users={[]} zones={zones} />);
    expect(screen.getByText("현재 공간에 표시할 사용자가 없어요.")).not.toBeNull();
  });
});
