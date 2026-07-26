// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioActiveBrushSummary } from "./StudioActiveBrushSummary";

afterEach(cleanup);

const commonProps = {
  color: "#111111",
  opacity: 0.94,
  stabilizer: 6,
  stabilizerMode: "adaptive" as const,
  strokeWidth: 26,
};

describe("StudioActiveBrushSummary", () => {
  it("renders exact core metadata without loading the full catalogue", () => {
    render(
      <StudioActiveBrushSummary
        {...commonProps}
        brushId="pen"
        brushName="펜(매끈)"
      />
    );

    const summary = screen.getByText("펜(매끈)").closest("[data-studio-active-brush-summary]");
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("ready");
    expect(summary?.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByText("선화 · 원형 촉")).toBeTruthy();
  });

  it("uses an honest loading state before resolving deferred pro metadata", async () => {
    render(
      <StudioActiveBrushSummary
        {...commonProps}
        brushId="heart-stamp"
        brushName="하트 도장"
      />
    );

    const summary = screen.getByText("하트 도장").closest("[data-studio-active-brush-summary]");
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("loading");
    expect(summary?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("프로 브러시 · 정보 불러오는 중")).toBeTruthy();
    expect(screen.queryByText(/사용자 · 원형 촉/u)).toBeNull();

    expect(await screen.findByText("효과 · 입자 촉")).toBeTruthy();
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("loaded");
    expect(summary?.getAttribute("aria-busy")).toBeNull();
  });
});
