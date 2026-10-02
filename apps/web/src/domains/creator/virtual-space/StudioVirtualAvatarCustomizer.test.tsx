// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioVirtualAvatarCustomizer } from "./StudioVirtualAvatarCustomizer";
import { STUDIO_CHARACTER_PART_PRESETS } from "./studio-virtual-space-character-parts";
import { parseStudioVirtualAvatarProfile } from "./studio-virtual-space-avatar-store";

const STORAGE_KEY = "toonspectrum:virtual-space-avatar-profile:v1";

function readSavedProfile(): Record<string, unknown> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe("StudioVirtualAvatarCustomizer", () => {
  // jsdom에는 window.matchMedia가 없어 미리보기 피규어의 reduced-motion 감지가 깨진다.
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.matchMedia = originalMatchMedia;
  });

  it("파츠 섹션·프리셋·랜덤/초기화 버튼을 한국어로 보여준다", () => {
    render(<StudioVirtualAvatarCustomizer identity="tester" />);
    expect(screen.getByRole("heading", { name: "내 아바타 꾸미기" })).toBeTruthy();
    for (const legend of ["피부색", "헤어스타일", "헤어 색상", "의상", "의상 색상", "액세서리", "표정", "프리셋"]) {
      expect(screen.getByText(legend), legend).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /랜덤 아바타 만들기/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /아바타 꾸미기 초기화/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "걷기 애니메이션" })).toBeTruthy();
  });

  it("8개 피부색·12개 헤어스타일·10개 액세서리·7개 프리셋 버튼을 제공한다", () => {
    render(<StudioVirtualAvatarCustomizer identity="tester" />);
    const skinFieldset = screen.getByText("피부색").closest("fieldset");
    expect(skinFieldset?.querySelectorAll("button")).toHaveLength(8);
    const hairFieldset = screen.getByText("헤어스타일").closest("fieldset");
    expect(hairFieldset?.querySelectorAll("button")).toHaveLength(12);
    const accessoryFieldset = screen.getByText("액세서리").closest("fieldset");
    expect(accessoryFieldset?.querySelectorAll("button")).toHaveLength(10);
    const presetFieldset = screen.getByText("프리셋").closest("fieldset");
    expect(presetFieldset?.querySelectorAll("button")).toHaveLength(7);
    for (const preset of STUDIO_CHARACTER_PART_PRESETS) {
      expect(presetFieldset?.querySelectorAll("button").length).toBe(7);
      expect(screen.getByRole("button", { name: preset.labelKo }), preset.key).toBeTruthy();
    }
  });

  it("헤어스타일을 고르면 저장소에 저장된다", () => {
    render(<StudioVirtualAvatarCustomizer identity="tester" />);
    fireEvent.click(screen.getByRole("button", { name: "트윈테일" }));
    expect(readSavedProfile()?.hairStyle).toBe("twin");
    // aria-pressed로 선택 상태가 표시된다.
    expect(screen.getByRole("button", { name: "트윈테일" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("프리셋을 고르면 프리셋 파츠가 저장된다", () => {
    render(<StudioVirtualAvatarCustomizer identity="tester" />);
    fireEvent.click(screen.getByRole("button", { name: "바리스타 룩" }));
    const saved = readSavedProfile();
    expect(saved?.hairStyle).toBe("bun");
    expect(saved?.outfitStyle).toBe("apron");
    expect(saved?.accessory).toBe("headband");
    expect(saved?.skin).toBe("oklch(0.86 0.07 48)");
    expect(parseStudioVirtualAvatarProfile(saved)).not.toBeNull();
  });

  it("랜덤 버튼은 유효한 프로필을 저장하고 초기화는 지운다", () => {
    render(<StudioVirtualAvatarCustomizer identity="tester" />);
    fireEvent.click(screen.getByRole("button", { name: /랜덤 아바타 만들기/ }));
    const saved = readSavedProfile();
    expect(parseStudioVirtualAvatarProfile(saved)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /아바타 꾸미기 초기화/ }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("미리보기 방향 버튼으로 피규어 방향이 바뀐다", () => {
    const view = render(<StudioVirtualAvatarCustomizer identity="tester" />);
    const figure = view.container.querySelector("svg[data-avatar-direction]");
    expect(figure?.getAttribute("data-avatar-direction")).toBe("down");
    fireEvent.click(screen.getByRole("button", { name: "미리보기 방향: 왼쪽" }));
    expect(view.container.querySelector("svg[data-avatar-direction]")?.getAttribute("data-avatar-direction")).toBe("left");
  });

  it("걷기 애니메이션 체크박스를 토글할 수 있다", () => {
    render(<StudioVirtualAvatarCustomizer identity="tester" />);
    const checkbox = screen.getByRole("checkbox", { name: "걷기 애니메이션" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it("jsdom 캔버스 미지원 시 스프라이트 미리보기 이미지가 생략된다", () => {
    const view = render(<StudioVirtualAvatarCustomizer identity="tester" />);
    expect(view.container.querySelector("img")).toBeNull();
  });
});
