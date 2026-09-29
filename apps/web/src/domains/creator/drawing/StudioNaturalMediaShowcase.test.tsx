// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioNaturalMediaShowcase,
  type StudioNaturalMediaShowcaseProps,
} from "./StudioNaturalMediaShowcase";
import { STUDIO_NATURAL_MEDIA_PRESETS } from "./studio-natural-media-brushes";

afterEach(cleanup);

function props(
  overrides: Partial<StudioNaturalMediaShowcaseProps> = {},
): StudioNaturalMediaShowcaseProps {
  return {
    onSelectBrush: vi.fn(),
    onStartDrawing: vi.fn(),
    ...overrides,
  };
}

describe("StudioNaturalMediaShowcase", () => {
  it("10종의 브러시 카드를 렌더링한다", { timeout: 30000 }, () => {
    render(<StudioNaturalMediaShowcase {...props()} />);
    for (const preset of STUDIO_NATURAL_MEDIA_PRESETS) {
      expect(
        screen.getByRole("button", { name: `브러시 선택: ${preset.labelKo}` }),
      ).toBeTruthy();
    }
  });

  it("카드를 클릭하면 선택되고 onSelectBrush 가 호출된다", () => {
    const onSelectBrush = vi.fn();
    render(<StudioNaturalMediaShowcase {...props({ onSelectBrush })} />);

    const charcoal = screen.getByRole("button", { name: "브러시 선택: 목탄" });
    expect(charcoal.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(charcoal);

    expect(charcoal.getAttribute("aria-pressed")).toBe("true");
    expect(onSelectBrush).toHaveBeenCalledTimes(1);
    expect(onSelectBrush.mock.calls[0][0].id).toBe("charcoal");
    // 선택 배지가 표시된다
    expect(screen.getByText("선택됨")).toBeTruthy();
  });

  it("핵심 CTA는 선택된 브러시로 onStartDrawing 을 호출한다", () => {
    const onStartDrawing = vi.fn();
    render(<StudioNaturalMediaShowcase {...props({ onStartDrawing })} />);

    fireEvent.click(screen.getByRole("button", { name: "브러시 선택: 목탄" }));
    fireEvent.click(
      screen.getByRole("button", { name: "이 브러시로 그리기 시작" }),
    );

    expect(onStartDrawing).toHaveBeenCalledTimes(1);
    expect(onStartDrawing.mock.calls[0][0].id).toBe("charcoal");
  });

  it("고급 설정은 접혀 있다가 펼쳐진다", () => {
    render(<StudioNaturalMediaShowcase {...props()} />);
    expect(screen.queryByLabelText("스트로크 굵기 배율")).toBeNull();

    const toggle = screen.getByRole("button", { name: "고급 설정" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("스트로크 굵기 배율")).toBeTruthy();
  });

  it("각 카드에 SVG 스트로크 프리뷰가 있다", () => {
    const { container } = render(<StudioNaturalMediaShowcase {...props()} />);
    const previews = container.querySelectorAll(
      'svg[aria-label$="스트로크 미리보기"]',
    );
    expect(previews.length).toBe(STUDIO_NATURAL_MEDIA_PRESETS.length);
    for (const svg of previews) {
      expect(svg.querySelector("path")).toBeTruthy();
    }
  });
});
