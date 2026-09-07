// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioSurfaceState } from "./StudioSurfaceState";

afterEach(cleanup);

describe("StudioSurfaceState", () => {
  it("keeps a static empty state in reading order without announcing every render", () => {
    const { container } = render(
      <StudioSurfaceState
        state="empty"
        title="항목이 없습니다"
        description="새 항목을 추가하세요."
      />,
    );

    const empty = container.querySelector('[data-studio-empty-state="true"]');
    expect(empty).toBeTruthy();
    expect(empty?.getAttribute("data-studio-surface-state")).toBe("empty");
    expect(empty?.getAttribute("data-studio-surface-announcement")).toBe("none");
    expect(empty?.getAttribute("role")).toBeNull();
    expect(empty?.getAttribute("aria-live")).toBeNull();
    expect(screen.getByText("항목이 없습니다")).not.toBeNull();
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
