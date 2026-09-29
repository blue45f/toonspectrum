// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioStyleAttributionBadge } from "./StudioStyleAttributionBadge";

afterEach(() => {
  cleanup();
});

describe("StudioStyleAttributionBadge", () => {
  it("권리자 표기와 작품명을 표시합니다", () => {
    render(
      <StudioStyleAttributionBadge
        attribution={{ ownerLabel: "© 김툰 (본인 작품)", workTitle: "별빛 고교" }}
        styleName="나의 웹툰체"
      />,
    );
    const badge = screen.getByTestId("studio-style-attribution-badge");
    expect(badge.textContent).toContain("© 김툰 (본인 작품)");
    expect(badge.textContent).toContain("별빛 고교");
    expect(badge.textContent).toContain("나의 웹툰체");
    expect(badge.textContent).toContain("본인 작품 확인 완료");
  });

  it("스크린 리더가 출처를 읽을 수 있는 note 역할을 가집니다", () => {
    render(<StudioStyleAttributionBadge attribution={{ ownerLabel: "© 김툰 (본인 작품)" }} />);
    expect(screen.getByRole("note", { name: "스타일 출처 표시" })).toBeDefined();
  });
});
