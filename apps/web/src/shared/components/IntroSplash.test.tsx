// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntroSplash } from "./IntroSplash";

const SESSION_KEY = "toonstudio-intro-shown";

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

describe("IntroSplash 접근성", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("prefers-reduced-motion 사용자는 애니메이션 인트로를 건너뛰고 세션을 본 것으로 기록한다", () => {
    installMatchMedia(true);
    sessionStorage.clear();

    const { container } = render(<IntroSplash />);

    expect(container.firstChild).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("true");
  });

  it("재방문 세션에서는 인트로를 렌더링하지 않는다", () => {
    installMatchMedia(false);
    sessionStorage.setItem(SESSION_KEY, "true");

    const { container } = render(<IntroSplash />);

    expect(container.firstChild).toBeNull();
  });
});
