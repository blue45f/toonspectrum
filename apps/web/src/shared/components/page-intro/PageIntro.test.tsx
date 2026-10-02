// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { introItemProps, PAGE_INTRO_DURATION_MS } from "./page-intro-utils";
import { PageIntro } from "./PageIntro";

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

function renderIntro(initialPath = "/market") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PageIntro variant="market">
        <p>본문 콘텐츠</p>
      </PageIntro>
    </MemoryRouter>,
  );
}

function veil(): HTMLElement | null {
  return document.querySelector(".page-intro__veil");
}

beforeEach(() => {
  stubMatchMedia(false);
  window.sessionStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PageIntro", () => {
  it("진입 시 베일을 보여주고 1초 내외로 자동으로 닫는다", () => {
    renderIntro();
    expect(veil()).not.toBeNull();
    expect(document.querySelector('[data-page-intro="playing"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(PAGE_INTRO_DURATION_MS + 250);
    });
    expect(veil()).toBeNull();
    expect(document.querySelector('[data-page-intro="done"]')).not.toBeNull();
  });

  it("ESC를 누르면 즉시 건너뛴다", () => {
    renderIntro();
    expect(veil()).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(veil()).toBeNull();
  });

  it("베일을 클릭하면 즉시 건너뛴다", () => {
    renderIntro();
    const target = veil();
    expect(target).not.toBeNull();
    fireEvent.click(target!);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(veil()).toBeNull();
  });

  it("세션에서 이미 본 페이지는 베일을 생략한다", () => {
    window.sessionStorage.setItem("ts-page-intro:v1:/market", "1");
    renderIntro("/market");
    expect(veil()).toBeNull();
  });

  it("다른 페이지는 각자 1회씩 재생한다", () => {
    window.sessionStorage.setItem("ts-page-intro:v1:/market", "1");
    renderIntro("/market/browse");
    expect(veil()).not.toBeNull();
  });

  it("prefers-reduced-motion이면 베일을 렌더하지 않는다", () => {
    stubMatchMedia(true);
    renderIntro();
    expect(veil()).toBeNull();
    expect(document.querySelector('[data-page-intro="done"]')).not.toBeNull();
  });

  it("인트로가 끝나면 세션에 기록한다", () => {
    renderIntro();
    act(() => {
      vi.advanceTimersByTime(PAGE_INTRO_DURATION_MS + 250);
    });
    expect(window.sessionStorage.getItem("ts-page-intro:v1:/market")).toBe("1");
  });

  it("본문 children은 항상 렌더한다", () => {
    const { getByText } = renderIntro();
    expect(getByText("본문 콘텐츠")).not.toBeNull();
  });

  it("베일은 장식 요소로 보조기술 트리에서 제외한다", () => {
    renderIntro();
    expect(veil()?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("introItemProps", () => {
  it("스태거 인덱스를 style 변수로 전달한다", () => {
    const props = introItemProps(3);
    expect(props["data-intro-item"]).toBeDefined();
    expect((props.style as Record<string, number>)["--intro-index"]).toBe(3);
  });

  it("인덱스 상한을 둬 전체 연출이 1초를 넘지 않게 한다", () => {
    const props = introItemProps(99);
    expect((props.style as Record<string, number>)["--intro-index"]).toBeLessThanOrEqual(12);
  });
});
