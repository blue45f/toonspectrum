// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioSurfaceState } from "./StudioSurfaceState";

afterEach(cleanup);

describe("StudioSurfaceState", () => {
  it("announces an empty result that appears after search or filtering", () => {
    const { container } = render(
      <StudioSurfaceState
        state="empty"
        title="일치하는 항목이 없습니다"
        description="검색어를 바꿔 보세요."
      />,
    );

    const empty = container.querySelector('[data-studio-empty-state="true"]');
    expect(empty?.getAttribute("data-studio-surface-announcement")).toBe("polite");
    expect(screen.getByRole("status").textContent).toContain("일치하는 항목이 없습니다");
  });

  it("lets a permanently static empty card stay in reading order without a live region", () => {
    const { container } = render(
      <StudioSurfaceState
        state="empty"
        announce="none"
        title="아직 프로젝트가 없습니다"
      />,
    );

    const empty = container.querySelector('[data-studio-empty-state="true"]');
    expect(empty?.getAttribute("data-studio-surface-announcement")).toBe("none");
    expect(empty?.getAttribute("role")).toBeNull();
    expect(empty?.getAttribute("aria-live")).toBeNull();
  });

  it("announces errors assertively and loading as a polite busy status", () => {
    const { rerender } = render(
      <StudioSurfaceState state="error" title="불러오지 못했습니다" />,
    );
    expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");

    rerender(<StudioSurfaceState state="loading" title="불러오는 중" />);
    const loading = screen.getByRole("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("renders optional visual media without changing the state announcement contract", () => {
    const { container } = render(
      <StudioSurfaceState
        state="empty"
        announce="none"
        title="배경이 아직 없어요"
        visual={{ src: "/brand/theme-scenes/ink-studio.svg", objectPosition: "center 45%" }}
      />,
    );

    const visual = container.querySelector('[data-studio-surface-visual="true"]');
    const image = visual?.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/brand/theme-scenes/ink-studio.svg");
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");
    expect(image?.getAttribute("alt")).toBe("");
    expect(container.querySelector('[data-studio-surface-announcement="none"]')).toBeTruthy();
  });

  it("allows a caller to announce a newly appeared blocked state", () => {
    render(
      <StudioSurfaceState
        state="blocked"
        announce="polite"
        title="이미지 레이어가 필요해요"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("이미지 레이어가 필요해요");
  });
});
