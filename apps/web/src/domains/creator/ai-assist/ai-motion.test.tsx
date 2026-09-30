// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { staggerDelay, useCountUp, useScrollReveal } from "./ai-motion";

function mockReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("staggerDelay", () => {
  it("인덱스 기반 딜레이를 반환한다", () => {
    const restore = mockReducedMotion(false);
    try {
      expect(staggerDelay(0)).toEqual({ transitionDelay: "0ms" });
      expect(staggerDelay(2)).toEqual({ transitionDelay: "180ms" });
    } finally {
      restore();
    }
  });

  it("reduced-motion에서는 딜레이가 0이다", () => {
    const restore = mockReducedMotion(true);
    try {
      expect(staggerDelay(5)).toEqual({ transitionDelay: "0ms" });
    } finally {
      restore();
    }
  });
});

describe("useScrollReveal", () => {
  it("IntersectionObserver가 없으면 즉시 visible이다", () => {
    function Probe() {
      const { ref, visible } = useScrollReveal<HTMLDivElement>();
      return <div ref={ref} data-testid="probe" data-visible={visible ? "yes" : "no"} />;
    }
    // jsdom에는 IntersectionObserver가 없다
    expect("IntersectionObserver" in window).toBe(false);
    render(<Probe />);
    expect(screen.getByTestId("probe").getAttribute("data-visible")).toBe("yes");
  });
});

describe("useCountUp", () => {
  it("목표 숫자까지 카운트업한다", async () => {
    const restore = mockReducedMotion(false);
    // jsdom의 rAF는 콜백을 실행하지 않을 수 있어 setTimeout 기반으로 스텁
    const originalRaf = window.requestAnimationFrame;
    const originalCaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
    try {
      function Counter() {
        const value = useCountUp(8, 60);
        return <span data-testid="count">{value}</span>;
      }
      render(<Counter />);
      await waitFor(() => {
        expect(screen.getByTestId("count").textContent).toBe("8");
      });
    } finally {
      restore();
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCaf;
    }
  });

  it("reduced-motion에서는 즉시 목표값이다", () => {
    const restore = mockReducedMotion(true);
    try {
      function Counter() {
        const value = useCountUp(8, 60);
        return <span data-testid="count">{value}</span>;
      }
      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("8");
    } finally {
      restore();
    }
  });
});
