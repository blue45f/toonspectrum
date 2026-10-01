// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionSampleJourneyGuide } from "./ProductionSampleJourneyGuide";
import type { ProductionSampleLocation } from "./production-sample-journey";

afterEach(() => cleanup());

function renderGuide(location: ProductionSampleLocation) {
  return render(
    <MemoryRouter>
      <ProductionSampleJourneyGuide location={location} />
    </MemoryRouter>,
  );
}

describe("ProductionSampleJourneyGuide", () => {
  it("labels the sample as example data that stays in this browser", () => {
    renderGuide("overview");
    expect(screen.getByRole("heading", { name: "밤의 우편배달부 12화로 협업 흐름 체험하기" })).toBeTruthy();
    expect(screen.getByText("샘플 프로젝트")).toBeTruthy();
    expect(screen.getByText(/사람·일정·원고는 모두 예시입니다/u)).toBeTruthy();
    expect(screen.getByText(/새로고침하면 처음 상태로 돌아갑니다/u)).toBeTruthy();
  });

  it("follows the production flow and marks the current step from the address", () => {
    renderGuide("production");
    const steps = within(screen.getByRole("list", { name: "체험 순서" })).getAllByRole("link");
    expect(steps.map((link) => link.getAttribute("href"))).toEqual([
      "/production/projects/sample-project/overview",
      "/production/projects/sample-project/production",
      "/production/projects/sample-project/episodes/episode-12",
      "/production/projects/sample-project/manuscripts",
      "/production/projects/sample-project/review",
      "/production/projects/sample-project/settings",
    ]);
    expect(steps[1]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: /다음:\s*회차 룸/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes/episode-12");
  });

  it("starts from the first step outside the tour and ends at the production home", () => {
    const view = renderGuide("planning");
    expect(screen.getByRole("link", { name: /체험 시작\s*개요/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/overview");
    view.unmount();
    renderGuide("settings");
    expect(screen.getByRole("link", { name: /체험 끝/u }).getAttribute("href")).toBe("/production");
  });
});
