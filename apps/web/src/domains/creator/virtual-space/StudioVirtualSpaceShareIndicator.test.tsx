// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceShareIndicator } from "./StudioVirtualSpaceShareIndicator";

afterEach(cleanup);

describe("StudioVirtualSpaceShareIndicator", () => {
  it("공유 경로와 대역폭 힌트를 표시한다", () => {
    render(<StudioVirtualSpaceShareIndicator sharerLabel="김작가" route="bubble" bandwidth="balanced" />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/김작가/)).toBeTruthy();
    expect(screen.getByText(/버블 공유/)).toBeTruthy();
    expect(screen.getByText(/1280p\/15fps/)).toBeTruthy();
    expect(screen.getByText(/로컬 미리보기/)).toBeTruthy();
  });

  it("방송 경로를 표시한다", () => {
    render(<StudioVirtualSpaceShareIndicator sharerLabel="김작가" route="broadcast" bandwidth="full" />);
    expect(screen.getByText(/전체 방송/)).toBeTruthy();
  });

  it("대역폭 변경을 콜백으로 전달한다", () => {
    const onBandwidthChange = vi.fn();
    render(
      <StudioVirtualSpaceShareIndicator sharerLabel="김작가" route="bubble" bandwidth="balanced" onBandwidthChange={onBandwidthChange} />,
    );
    fireEvent.change(screen.getByLabelText(/대역폭 선택/), { target: { value: "low" } });
    expect(onBandwidthChange).toHaveBeenCalledWith("low");
  });

  it("콜백이 없으면 선택 UI를 숨긴다", () => {
    render(<StudioVirtualSpaceShareIndicator sharerLabel="김작가" route="bubble" bandwidth="low" />);
    expect(screen.queryByLabelText(/대역폭 선택/)).toBeNull();
  });
});
