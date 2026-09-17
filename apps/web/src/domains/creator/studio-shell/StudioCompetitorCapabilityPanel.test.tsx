// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioCompetitorCapabilityPanel } from "./StudioCompetitorCapabilityPanel";

afterEach(cleanup);

describe("StudioCompetitorCapabilityPanel", () => {
  it("shows repository completion without fabricating external validation", () => {
    const { container } = render(<StudioCompetitorCapabilityPanel locale="ko" />);

    expect(screen.getByText("전문 제작 기능 구현·검증 원장")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("외부 검증 대기 12건 보기")).toBeTruthy();
    expect(container.querySelector("section")?.getAttribute("data-replacement-claim-allowed"))
      .toBe("false");
  });

  it("keeps the external validation list available to assistive technology", () => {
    render(<StudioCompetitorCapabilityPanel locale="en" />);

    expect(screen.getByText("Show 12 pending external validations")).toBeTruthy();
    expect(screen.getByText(/Golden PSD corpus round-trip/u)).toBeTruthy();
    expect(screen.getByText(/professional creator must complete/u)).toBeTruthy();
  });

  it("uses the compact presentation without expanding the pending list", () => {
    render(<StudioCompetitorCapabilityPanel locale="ko" compact />);

    expect(screen.queryByText("외부 검증 대기 12건 보기")).toBeNull();
    expect(screen.getByText("구현 누락")).toBeTruthy();
  });
});
