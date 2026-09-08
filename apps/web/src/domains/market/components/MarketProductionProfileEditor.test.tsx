// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  mergeMarketProductionProfile,
} from "../models/market-production-fit";

import { MarketProductionProfileEditor } from "./MarketProductionProfileEditor";

afterEach(cleanup);

describe("MarketProductionProfileEditor", () => {
  it("edits declared production constraints without implying project mutation", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <MarketProductionProfileEditor
        profile={DEFAULT_MARKET_PRODUCTION_PROFILE}
        onChange={onChange}
        onReset={onReset}
      />,
    );

    expect(screen.getByRole("heading", { name: "내 제작 조건" })).toBeTruthy();
    expect(screen.getByText(/결제, 획득, 설치 또는 원고를 변경하지 않습니다/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/현재 Studio 버전/), {
      target: { value: "2.3.0" },
    });
    expect(onChange).toHaveBeenCalledWith({ studioVersion: "2.3.0" });

    fireEvent.click(screen.getByRole("button", { name: "엄격한 원본" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      aiPolicy: "exclude",
      provenancePolicy: "original-only",
      deliveryPolicy: "self-contained",
    }));
  });

  it("marks invalid version input and reports blocked persistence", () => {
    render(
      <MarketProductionProfileEditor
        profile={mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
          studioVersion: "latest",
        })}
        onChange={vi.fn()}
        onReset={vi.fn()}
        persistenceAvailable={false}
      />,
    );

    expect(screen.getByLabelText(/현재 Studio 버전/).getAttribute("aria-invalid"))
      .toBe("true");
    expect(screen.getByText(/SemVer/)).toBeTruthy();
    expect(screen.getByText(/이 탭을 닫으면 조건이 초기화될 수 있습니다/)).toBeTruthy();
  });
});
