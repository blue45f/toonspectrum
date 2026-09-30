// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FortuneReveal } from "./FortuneReveal";

describe("FortuneReveal", () => {
  afterEach(() => {
    cleanup();
  });

  it("점수와 라벨을 렌더한다", () => {
    render(
      <FortuneReveal score={82} label="이달의 운세 지수">
        <p>요약 텍스트</p>
      </FortuneReveal>
    );
    expect(screen.getByText("이달의 운세 지수")).toBeTruthy();
    expect(screen.getByText("요약 텍스트")).toBeTruthy();
    // 게이지에 접근 가능한 값이 있다 (role=meter, aria-valuenow)
    const meter = screen.getByRole("meter", { name: "이달의 운세 지수" });
    expect(meter.getAttribute("aria-valuenow")).toBe("82");
  });

  it("reduced motion에서는 별빛 캔버스를 렌더하지 않는다", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })
    );
    const { container } = render(
      <FortuneReveal score={70} label="올해의 운세 지수">
        <p>내용</p>
      </FortuneReveal>
    );
    expect(container.querySelector("canvas")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("점수가 0~100 범위를 벗어나면 클램프된다", () => {
    render(
      <FortuneReveal score={150} label="테스트">
        <p>내용</p>
      </FortuneReveal>
    );
    const meter = screen.getByRole("meter", { name: "테스트" });
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
  });
});
