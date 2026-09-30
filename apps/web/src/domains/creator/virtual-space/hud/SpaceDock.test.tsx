// @vitest-environment jsdom
import { Search } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_SPACE_EMOTES } from "../studio-virtual-space-emote-catalog";
import { SpaceDock } from "./SpaceDock";
import type { SpaceDockPopover } from "./space-dock-model";

afterEach(cleanup);

type DockProps = ComponentProps<typeof SpaceDock>;

function Harness(overrides: Partial<DockProps>) {
  const [popover, setPopover] = useState<SpaceDockPopover | null>(null);
  return <SpaceDock
    self={{ identity: "alice", name: "Alice", activity: "available", avatarIndex: 0 }}
    media={{ available: false, onOpen: vi.fn() }}
    panel={null}
    mapOpen={false}
    peopleBadge={{ nearby: 0, incoming: 0 }}
    popover={popover}
    moreItems={[]}
    workLauncher={<button type="button">작업 시작</button>}
    panelId="side-panel"
    onPopover={setPopover}
    onActivity={vi.fn()}
    onEditCharacter={vi.fn()}
    onEmote={vi.fn()}
    onTogglePanel={vi.fn()}
    onToggleMap={vi.fn()}
    onExit={vi.fn()}
    {...overrides}
  />;
}

describe("SpaceDock", () => {
  it("하나의 도구 막대에 상태·미디어·리액션·패널·지도·더보기·작업 시작·나가기를 순서대로 둔다", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: "가상 스튜디오 도구" });
    const names = within(toolbar).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(names).toEqual([
      "내 상태: 대화 가능 · Alice", "마이크", "카메라", "화면 공유", "리액션", "대화", "참가자", "지도", "꾸미기", "더보기", "작업 시작", "나가기",
    ]);
    for (const button of within(toolbar).getAllByRole("button")) expect(button.getAttribute("type")).toBe("button");
  });

  it("대화 연결 전 미디어 버튼은 포커스는 받되 비활성 사유를 읽어 준다", () => {
    const onOpen = vi.fn();
    render(<Harness media={{ available: false, onOpen }} />);
    const mic = screen.getByRole("button", { name: "마이크" });
    expect(mic.getAttribute("aria-disabled")).toBe("true");
    expect(mic.hasAttribute("disabled")).toBe(false);
    expect(document.getElementById(mic.getAttribute("aria-describedby") ?? "")?.textContent).toBe("팀 프로젝트 공간에서 대화가 연결되면 쓸 수 있어요");
    fireEvent.click(mic);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("연결된 팀 공간에서는 미디어 버튼을 활성 버튼으로 둔다", () => {
    render(<Harness media={{ available: true, onOpen: vi.fn() }} />);
    expect(screen.getByRole("button", { name: "카메라" }).hasAttribute("aria-disabled")).toBe(false);
  });

  it("리액션 팝오버는 16종을 보여 주고 고르면 닫힌 뒤 이모트를 알린다", () => {
    const onEmote = vi.fn();
    render(<Harness onEmote={onEmote} />);
    fireEvent.click(screen.getByRole("button", { name: "리액션" }));
    const picker = screen.getByRole("group", { name: "리액션 16종" });
    expect(within(picker).getAllByRole("button")).toHaveLength(STUDIO_SPACE_EMOTES.length);
    fireEvent.click(within(picker).getByRole("button", { name: "손 흔들기 (단축키 1)" }));
    expect(onEmote).toHaveBeenCalledExactlyOnceWith("wave");
    expect(screen.queryByRole("group", { name: "리액션 16종" })).toBeNull();
  });

  it("패널 버튼은 현재 패널과 상세 화면을 눌림 상태로 표시한다", () => {
    const onTogglePanel = vi.fn();
    const view = render(<Harness panel="team" onTogglePanel={onTogglePanel} />);
    expect(screen.getByRole("button", { name: "참가자" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "대화" }).getAttribute("aria-pressed")).toBe("false");
    view.rerender(<Harness panel="board" onTogglePanel={onTogglePanel} />);
    expect(screen.getByRole("button", { name: "대화" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));
    expect(onTogglePanel).toHaveBeenCalledExactlyOnceWith("build");
    expect(screen.getByRole("button", { name: "참가자" }).getAttribute("aria-controls")).toBe("side-panel");
  });

  it("받은 요청이 있으면 근처 인원보다 요청 수를 강조해 알린다", () => {
    const view = render(<Harness peopleBadge={{ nearby: 2, incoming: 0 }} />);
    expect(within(screen.getByRole("button", { name: "참가자" })).getByText("근처 2명")).toBeTruthy();
    view.rerender(<Harness peopleBadge={{ nearby: 2, incoming: 1 }} />);
    expect(within(screen.getByRole("button", { name: "참가자" })).getByText("받은 요청 1건")).toBeTruthy();
  });

  it("더보기 메뉴 항목은 고르면 메뉴를 닫고, 비활성 항목은 사유만 보여 준다", () => {
    const onSearch = vi.fn();
    const onDisabled = vi.fn();
    render(<Harness moreItems={[
      { id: "search", labelKo: "방·사람 찾기", labelEn: "Find", icon: Search, group: "space", shortcut: "Ctrl K", onSelect: onSearch },
      { id: "locked", labelKo: "잠긴 기능", labelEn: "Locked", icon: Search, group: "help", onSelect: onDisabled,
        disabledReasonKo: "팀 공간에서만 쓸 수 있어요", disabledReasonEn: "Team spaces only" },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    const locked = document.querySelector<HTMLButtonElement>('[data-menu-item="locked"]');
    if (!locked) throw new Error("잠긴 메뉴 항목이 필요합니다.");
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(locked);
    expect(onDisabled).not.toHaveBeenCalled();
    const search = document.querySelector<HTMLButtonElement>('[data-menu-item="search"]');
    if (!search) throw new Error("찾기 메뉴 항목이 필요합니다.");
    fireEvent.click(search);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-menu-item="search"]')).toBeNull();
  });

  it("내 상태 메뉴에서 상태를 바꾸고 캐릭터 편집으로 이어진다", () => {
    const onActivity = vi.fn();
    const onEditCharacter = vi.fn();
    render(<Harness onActivity={onActivity} onEditCharacter={onEditCharacter} />);
    fireEvent.click(screen.getByRole("button", { name: "내 상태: 대화 가능 · Alice" }));
    const status = screen.getByRole("radiogroup", { name: "내 상태" });
    expect(within(status).getByRole("radio", { name: "대화 가능" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(status).getByRole("radio", { name: "집중 작업 중" }));
    expect(onActivity).toHaveBeenCalledExactlyOnceWith("focused");
    fireEvent.click(screen.getByRole("button", { name: "내 상태: 대화 가능 · Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "캐릭터·이름 바꾸기" }));
    expect(onEditCharacter).toHaveBeenCalledOnce();
  });
  it("내 상태 라디오 그룹은 화살표로 선택을 옮기며 메뉴를 닫지 않는다", () => {
    const onActivity = vi.fn();
    render(<Harness onActivity={onActivity} />);
    fireEvent.click(screen.getByRole("button", { name: "내 상태: 대화 가능 · Alice" }));
    const available = screen.getByRole("radio", { name: "대화 가능" });
    expect(available.tabIndex).toBe(0);
    expect(screen.getByRole("radio", { name: "자리 비움" }).tabIndex).toBe(-1);
    fireEvent.keyDown(available, { key: "ArrowUp" });
    expect(onActivity).toHaveBeenCalledExactlyOnceWith("away");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "자리 비움" }));
    expect(screen.getByRole("radiogroup", { name: "내 상태" })).toBeTruthy();
  });
});
