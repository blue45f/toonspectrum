// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ENTRY_INTRO_FADE_MS,
  ENTRY_INTRO_HOLD_MS,
  ENTRY_INTRO_REDUCED_HOLD_MS,
  ENTRY_INTRO_SKIP_FADE_MS,
  EntryIntro,
} from "./EntryIntro";
import { ENTRY_INTRO_SESSION_KEY } from "./entry-intro-session";

function installMatchMedia(reduced: boolean) {
  const mql = {
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return mql;
}

describe("EntryIntro", () => {
  beforeEach(() => {
    sessionStorage.clear();
    installMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("첫 방문이면 현행 워드마크와 태그라인을 그리고 세션에 본 것으로 기록한다", () => {
    const { container } = render(<EntryIntro />);

    expect(container.textContent).toContain("Toon");
    expect(container.textContent).toContain("Studio");
    expect(container.textContent).toContain("Stories Come to Life");
    // 구 브랜드 표기가 남아 있지 않다.
    expect(container.textContent).not.toContain("SPECTRUM");
    expect(container.textContent).not.toContain("Beta Service");
    expect(sessionStorage.getItem(ENTRY_INTRO_SESSION_KEY)).toBe("true");
  });

  it("이미 본 세션에서는 인트로를 렌더링하지 않는다", () => {
    sessionStorage.setItem(ENTRY_INTRO_SESSION_KEY, "true");

    const { container } = render(<EntryIntro />);

    expect(container.firstChild).toBeNull();
  });

  it("sessionStorage가 차단돼도 인트로가 앱 진입을 막지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { container } = render(<EntryIntro />);

    expect(container.firstChild).toBeNull();
  });

  it("본 세션의 SSR 마크업은 비어 있다(본문이 먼저 그려진다)", () => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => "true", setItem: () => undefined },
    });

    expect(renderToStaticMarkup(createElement(EntryIntro))).toBe("");
  });

  it("전체 길이가 1.8초를 넘지 않고 끝나면 완전히 사라진다", () => {
    expect(ENTRY_INTRO_HOLD_MS + ENTRY_INTRO_FADE_MS).toBeLessThanOrEqual(1800);
    vi.useFakeTimers();

    const { container } = render(<EntryIntro />);
    expect(container.firstChild).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_HOLD_MS);
    });
    // 유지 시간이 끝나면 페이드 단계 — 아직 DOM에 있다.
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("키 입력 즉시 건너뛰고, 원래 유지 시간이 지나도 다시 나타나지 않는다", () => {
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_FADE_MS);
    });
    expect(container.firstChild).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_HOLD_MS + ENTRY_INTRO_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("포인터 입력으로도 건너뛴다", () => {
    vi.useFakeTimers();
    const { container } = render(<EntryIntro />);

    fireEvent.pointerDown(window);
    expect(container.querySelector("[data-phase='fade']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_SKIP_FADE_MS);
    });
    expect(container.firstChild).toBeNull();
  });

  it("prefers-reduced-motion에서는 정적 카드를 짧게만 보여주고 세션을 기록한다", () => {
    installMatchMedia(true);
    vi.useFakeTimers();

    const { container } = render(<EntryIntro />);
    expect(container.firstChild).not.toBeNull();
    expect(sessionStorage.getItem(ENTRY_INTRO_SESSION_KEY)).toBe("true");

    act(() => {
      vi.advanceTimersByTime(ENTRY_INTRO_REDUCED_HOLD_MS - 1);
    });
    expect(container.firstChild).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.firstChild).toBeNull();
  });

  it("once=false면 이미 본 세션에서도 마운트마다 그린다", () => {
    sessionStorage.setItem(ENTRY_INTRO_SESSION_KEY, "true");

    const { container } = render(<EntryIntro once={false} />);

    expect(container.firstChild).not.toBeNull();
  });
});

describe("EntryIntro 소스 계약", () => {
  it("Three.js·랜덤 선택 없이 CSS 연출만 쓰고 본문 입력을 막지 않는다", () => {
    const tsx = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/shared/components/EntryIntro.tsx"),
      "utf8",
    );
    const css = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/shared/components/EntryIntro.module.css"),
      "utf8",
    );

    expect(tsx).not.toContain("three");
    expect(tsx).not.toContain("Math.random");
    expect(tsx).not.toContain("RandomIntro");
    expect(tsx).not.toContain("SplashScreen");
    expect(tsx).not.toContain("IntroSplash");
    expect(css).toContain("pointer-events: none");
  });
});
