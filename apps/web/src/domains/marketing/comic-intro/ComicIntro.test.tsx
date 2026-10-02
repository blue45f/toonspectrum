// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComicIntro } from "./ComicIntro";
import { ComicIntroHost } from "./ComicIntroHost";

const SEEN_KEY = "toonstudio-comic-intro-seen-v1";

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ComicIntro", () => {
  it("건너뛰기 버튼을 누르면 바로 끝난다", () => {
    const onDone = vi.fn();
    render(<ComicIntro variant="full" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ESC를 누르면 페이드아웃 뒤 끝난다", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ComicIntro variant="full" onDone={onDone} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("풀 버전은 2.4초가 지나면 저절로 끝난다", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ComicIntro variant="full" onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(2399);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("짧은 버전은 1초가 지나면 저절로 끝난다", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ComicIntro variant="short" onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("ComicIntroHost", () => {
  it("처음 방문이면 풀 버전을 띄우고 끝나면 본 것으로 기록한다", async () => {
    render(<ComicIntroHost />);
    const skip = await screen.findByRole("button", { name: "건너뛰기" });
    expect(screen.getByRole("dialog", { name: "인트로" }).getAttribute("data-comic-intro")).toBe("full");
    fireEvent.click(skip);
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
    expect(screen.queryByRole("dialog", { name: "인트로" })).toBeNull();
  });

  it("이미 본 사용자에게는 짧은 버전을 띄운다", async () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    render(<ComicIntroHost />);
    await screen.findByRole("button", { name: "건너뛰기" });
    expect(screen.getByRole("dialog", { name: "인트로" }).getAttribute("data-comic-intro")).toBe("short");
  });

  it("모션 감소 설정이면 인트로를 띄우지 않는다", async () => {
    mockReducedMotion(true);
    render(<ComicIntroHost />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog", { name: "인트로" })).toBeNull();
  });
});
