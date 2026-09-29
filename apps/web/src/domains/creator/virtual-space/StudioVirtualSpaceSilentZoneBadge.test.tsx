// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceSilentZoneBadge } from "./StudioVirtualSpaceSilentZoneBadge";
import { createSilentZone } from "./studio-virtual-space-silent-zone";

const ZONE = createSilentZone({ id: "focus-room", name: "집중 작업실", rect: { x: 0, y: 0, width: 400, height: 300 } })!;

describe("StudioVirtualSpaceSilentZoneBadge", () => {
  it("구역 안에 있을 때 뱃지를 표시한다", () => {
    render(<StudioVirtualSpaceSilentZoneBadge zone={ZONE} mutedByZone />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/집중 작업실/)).toBeTruthy();
    expect(screen.getByText(/마이크가 자동으로 꺼졌어요/)).toBeTruthy();
  });

  it("구역 밖에서는 숨긴다", () => {
    const { container } = render(<StudioVirtualSpaceSilentZoneBadge zone={null} mutedByZone={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("음소되지 않았으면 안내 문구를 숨긴다", () => {
    render(<StudioVirtualSpaceSilentZoneBadge zone={ZONE} mutedByZone={false} />);
    expect(screen.queryByText(/마이크가 자동으로 꺼졌어요/)).toBeNull();
    expect(screen.getByText(/조용한 구역/)).toBeTruthy();
  });
});
