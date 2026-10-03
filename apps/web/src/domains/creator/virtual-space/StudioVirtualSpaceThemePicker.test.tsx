// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceThemePicker } from "./StudioVirtualSpaceThemePicker";
import { STUDIO_SPACE_THEMES } from "./studio-virtual-space-theme";

afterEach(() => cleanup());

// 첫 렌더에서 i18n 런타임 초기화가 느릴 수 있어 여유를 둔다.
vi.setConfig({ testTimeout: 30000 });

describe("StudioVirtualSpaceThemePicker", () => {
  it("테마 5종을 모두 보여 주고 현재 테마가 눌린 상태로 표시된다", () => {
    render(<StudioVirtualSpaceThemePicker value="modern-office" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(STUDIO_SPACE_THEMES.length);
    for (const theme of STUDIO_SPACE_THEMES) {
      expect(screen.getByText(theme.labelKo)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /모던 오피스/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /네온 나이트/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("테마를 누르면 해당 키로 onChange가 호출된다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceThemePicker value="modern-office" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /가든 테라스/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("garden-terrace");
  });

  it("썸네일이 테마 팔레트(그라데이션·바닥·벽)를 인라인 스타일로 그린다", () => {
    const { container } = render(<StudioVirtualSpaceThemePicker value="neon-night" onChange={vi.fn()} />);
    const neonButton = container.querySelector('[data-space-theme="neon-night"]');
    expect(neonButton).toBeTruthy();
    const thumb = neonButton?.querySelector(".studio-theme-picker__thumb") as HTMLElement | null;
    expect(thumb?.style.background).toContain("linear-gradient");
    const floor = neonButton?.querySelector(".studio-theme-picker__floor") as HTMLElement | null;
    expect(floor?.style.background).toBeTruthy();
  });
});
