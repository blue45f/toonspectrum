// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Dialog from "@radix-ui/react-dialog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./command-palette";
import { CommandPaletteHost } from "./command-palette-host";

import { useUi } from "@/shared/lib/ui-store";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockPush = vi.fn();
vi.mock("@/shared/navigation/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@toonstudio/core/fx", () => ({
  playSfx: vi.fn(),
  getAudioState: () => ({
    sfxEnabled: true,
    bgmEnabled: false,
    muted: false,
    volume: 0.55,
    bgmVolume: 0.48,
  }),
  setSfxEnabled: vi.fn(),
  setBgmEnabled: vi.fn(),
}));

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    mockPush.mockReset();
    useUi.setState({ commandPaletteOpen: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("open이 false일 때는 DOM에 렌더링되지 않는다", () => {
    render(<CommandPalette open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open이 true일 때 다이얼로그와 검색 입력창, 카테고리 탭, 푸터 키보드 힌트를 렌더링한다", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByPlaceholderText(/작품 제목, 작가, 기능 명령, 스튜디오 도구 검색/)).toBeDefined();

    // 탭 확인
    expect(screen.getByRole("tab", { name: /전체/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /작품/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /명령어/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /스튜디오/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /페이지/ })).toBeDefined();

    // 키보드 가이드 확인
    expect(screen.getByText("분류 전환")).toBeDefined();
    expect(screen.getByText("접두사 필터")).toBeDefined();
  });

  it("카테고리 탭 클릭 시 해당 모드로 필터링된다", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const commandTab = screen.getByRole("tab", { name: /명령어/ });
    await act(async () => {
      fireEvent.click(commandTab);
    });

    // 명령어 항목들이 노출되는지 확인
    await waitFor(() => {
      expect(screen.getAllByText("효과음(SFX) 토글").length).toBeGreaterThan(0);
      expect(screen.getByText("현재 페이지 링크 복사")).toBeDefined();
    });
  });

  it("방향키로 검색 범위 탭을 이동하고 Tab의 기본 포커스 이동은 가로채지 않는다", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const allTab = screen.getByRole("tab", { name: "전체" });
    const titlesTab = screen.getByRole("tab", { name: /작품/ });
    fireEvent.keyDown(allTab, { key: "ArrowRight" });

    await waitFor(() => {
      expect(titlesTab.getAttribute("aria-selected")).toBe("true");
    });

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    expect(titlesTab.dispatchEvent(tabEvent)).toBe(true);
    expect(tabEvent.defaultPrevented).toBe(false);
  });

  it("접두사(>) 입력 시 명령어 모드로 자동 전환된다", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByPlaceholderText(/작품 제목, 작가, 기능 명령/);
    await act(async () => {
      fireEvent.input(input, { target: { value: ">링크" } });
      fireEvent.change(input, { target: { value: ">링크" } });
    });

    await waitFor(() => {
      expect(screen.getAllByText("현재 페이지 링크 복사").length).toBeGreaterThan(0);
    });
  });

  it("접두사(/) 입력 시 스튜디오 도구 모드로 자동 전환된다", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByPlaceholderText(/작품 제목, 작가, 기능 명령/);
    await act(async () => {
      fireEvent.input(input, { target: { value: "/펜" } });
      fireEvent.change(input, { target: { value: "/펜" } });
    });

    await waitFor(() => {
      expect(screen.getAllByText("G펜 / 잉크 브러시").length).toBeGreaterThan(0);
    });
  });

  it("닫기 버튼(배경) 클릭 시 onOpenChange(false)를 호출한다", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />);

    const backdrop = screen.getByRole("button", { name: /close|닫기/i });
    fireEvent.click(backdrop);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("CommandPaletteHost", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    useUi.setState({ commandPaletteOpen: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Cmd+K 단축키 입력 시 팔레트 열림 상태가 토글된다", () => {
    render(<CommandPaletteHost />);

    expect(useUi.getState().commandPaletteOpen).toBe(false);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useUi.getState().commandPaletteOpen).toBe(true);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useUi.getState().commandPaletteOpen).toBe(false);
  });

  it("입력창 밖에서 '/' 키 입력 시 팔레트가 열린다", () => {
    render(<CommandPaletteHost />);

    expect(useUi.getState().commandPaletteOpen).toBe(false);

    fireEvent.keyDown(document.body, { key: "/" });
    expect(useUi.getState().commandPaletteOpen).toBe(true);
  });

  it("input 요소 안에서 '/' 키 입력 시에는 팔레트가 열리지 않는다", () => {
    render(
      <div>
        <CommandPaletteHost />
        <input data-testid="test-input" />
      </div>
    );

    const input = screen.getByTestId("test-input");
    fireEvent.keyDown(input, { key: "/" });

    expect(useUi.getState().commandPaletteOpen).toBe(false);
  });

  it("검색어 입력 후 Escape로 닫고 검색을 연 버튼에 초점을 복원한다", async () => {
    render(<>
      <button type="button" onClick={() => useUi.getState().openCommandPalette()}>도구 검색</button>
      <CommandPaletteHost />
    </>);
    const trigger = screen.getByRole("button", { name: "도구 검색" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = await screen.findByRole("combobox");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "브러시" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("범위 탭과 닫기 버튼에서도 종료 후 매번 사용한 검색 버튼으로 돌아간다", async () => {
    render(<>
      <button type="button" onClick={() => useUi.getState().openCommandPalette()}>헤더 검색</button>
      <button type="button" onClick={() => useUi.getState().openCommandPalette()}>홈 검색</button>
      <CommandPaletteHost />
    </>);
    const headerTrigger = screen.getByRole("button", { name: "헤더 검색" });
    headerTrigger.focus();
    fireEvent.click(headerTrigger);
    await screen.findByRole("combobox");
    const tab = screen.getByRole("tab", { name: "전체" });
    tab.focus();
    fireEvent.keyDown(tab, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(headerTrigger));

    const homeTrigger = screen.getByRole("button", { name: "홈 검색" });
    homeTrigger.focus();
    fireEvent.click(homeTrigger);
    await screen.findByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: /close|닫기/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(homeTrigger));
  });

  it("한글 조합 중의 Escape는 검색창을 닫지 않는다", async () => {
    render(<CommandPaletteHost />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");

    fireEvent.keyDown(input, { key: "Escape", isComposing: true });

    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(useUi.getState().commandPaletteOpen).toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tab과 Shift+Tab은 검색 모달의 끝과 처음에서만 순환한다", async () => {
    render(<>
      <button type="button">배경 작업</button>
      <CommandPaletteHost />
    </>);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    const first = screen.getByRole("button", { name: /close|닫기/i });
    const buttons = dialog.querySelectorAll<HTMLButtonElement>("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(last, forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    fireEvent(first, backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    const input = screen.getByRole("combobox");
    input.focus();
    const withinDialog = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(input, withinDialog);
    expect(withinDialog.defaultPrevented).toBe(false);
  });

  it("다음 모달이 열린 뒤 검색이 닫혀도 새 모달의 초점을 가로채지 않는다", async () => {
    function frame(nextOpen = false) {
      return <>
        <button type="button" onClick={() => useUi.getState().openCommandPalette()}>검색 열기</button>
        <CommandPaletteHost />
        <Dialog.Root open={nextOpen}>
          <Dialog.Portal><Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>다음 작업</Dialog.Title>
            <button type="button">다음 작업 실행</button>
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
      </>;
    }
    const view = render(frame());
    const trigger = screen.getByRole("button", { name: "검색 열기" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("combobox");
    view.rerender(frame(true));
    const nextAction = screen.getByRole("button", { name: "다음 작업 실행" });
    expect(document.activeElement).toBe(nextAction);

    await act(async () => {
      useUi.getState().closeCommandPalette();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(nextAction);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
