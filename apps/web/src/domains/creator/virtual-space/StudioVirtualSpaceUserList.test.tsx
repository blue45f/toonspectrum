// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("인원 수를 role=status로 안내한다", () => {
    render(<StudioVirtualSpaceUserList users={users} zones={zones} selfId="self" />);
    expect(screen.getByRole("status").textContent).toContain("총 4명 작업 중");
  });

  it("명시적 사용자 상태가 활동 표시를 덮어쓴다", () => {
    const usersWithStatus: readonly StudioSpaceUserSnapshot[] = [
      { id: "u1", name: "지우", zoneId: "drawing", activity: "available", userStatus: "in-meeting" },
    ];
    render(<StudioVirtualSpaceUserList users={usersWithStatus} zones={zones} selfId="nobody" />);
    const row = document.querySelector('li[data-user-id="u1"]');
    expect(row?.getAttribute("aria-label")).toContain("회의 중");
    const dot = row?.querySelector('span[aria-hidden="true"]');
    // #f87171 (in-meeting) — 활동색(#34d399)이 아니다
    expect(dot?.getAttribute("style")).toContain("248, 113, 113");
    expect(dot?.getAttribute("style")).not.toContain("52, 211, 153");
  });

  it("buildUserListEntries가 userStatus를 전달한다 (없으면 null)", () => {
    const entries = buildUserListEntries(users, zones, "self");
    expect(entries.every((entry) => entry.userStatus === null)).toBe(true);
    const withStatus = buildUserListEntries(
      [{ id: "u1", name: "지우", zoneId: null, activity: "focused", userStatus: "break" }],
      zones,
      "self",
    );
    expect(withStatus[0]?.userStatus).toBe("break");
  });

  it("방향키로 항목 간 포커스를 이동하고 끝에서 랩어라운드한다", () => {
    render(<StudioVirtualSpaceUserList users={users} zones={zones} selfId="self" />);
    // 정렬: self, u1, u2, u3
    const list = document.querySelector("ul.studio-vspace-user-list");
    const first = document.querySelector<HTMLElement>('li[data-user-id="self"]');
    const second = document.querySelector<HTMLElement>('li[data-user-id="u1"]');
    const last = document.querySelector<HTMLElement>('li[data-user-id="u3"]');
    expect(list).not.toBeNull();
    first?.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(list!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(list!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    // 첫 항목에서 위로 가면 마지막으로 랩어라운드
    fireEvent.keyDown(list!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(last);
    // 마지막에서 아래로 가면 처음으로 랩어라운드
    fireEvent.keyDown(list!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
  });

  it("Home·End로 양 끝으로 이동한다", () => {
    render(<StudioVirtualSpaceUserList users={users} zones={zones} selfId="self" />);
    const list = document.querySelector("ul.studio-vspace-user-list");
    const first = document.querySelector<HTMLElement>('li[data-user-id="self"]');
    const last = document.querySelector<HTMLElement>('li[data-user-id="u3"]');
    first?.focus();
    fireEvent.keyDown(list!, { key: "End" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(list!, { key: "Home" });
    expect(document.activeElement).toBe(first);
  });

  it("목록이 줄어들어도 탭 순서가 유효한 항목을 가리킨다", () => {
    const { rerender } = render(<StudioVirtualSpaceUserList users={users} zones={zones} selfId="self" />);
    const list = document.querySelector("ul.studio-vspace-user-list");
    const last = document.querySelector<HTMLElement>('li[data-user-id="u3"]');
    last?.focus();
    fireEvent.keyDown(list!, { key: "End" });
    expect(document.activeElement?.getAttribute("tabindex")).toBe("0");
    // 마지막 항목만 남기고 목록 축소 — roving tabindex가 남은 항목으로 보정된다
    rerender(<StudioVirtualSpaceUserList users={[users[3]!]} zones={zones} selfId="self" />);
    const remaining = document.querySelectorAll("ul.studio-vspace-user-list li");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.getAttribute("tabindex")).toBe("0");
  });

  it("선택 콜백이 있으면 Enter·선택 버튼으로 팀원을 고르고 나는 고르지 않는다", () => {
    const onActivate = vi.fn();
    render(<StudioVirtualSpaceUserList users={users} zones={zones} selfId="self" onActivate={onActivate} />);
    const list = document.querySelector<HTMLElement>("ul.studio-vspace-user-list");
    if (!list) throw new Error("목록이 필요합니다.");
    expect(list.getAttribute("aria-label")).toContain("Enter로 선택");
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledExactlyOnceWith("u1");
    const select = screen.getByRole("button", { name: "밍 선택" });
    expect(select.tabIndex).toBe(-1);
    fireEvent.click(select);
    expect(onActivate).toHaveBeenLastCalledWith("u2");
    expect(screen.queryByRole("button", { name: "나 선택" })).toBeNull();
  });
});
