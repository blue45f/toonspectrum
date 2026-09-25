// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProductionSampleJourneyGuide } from "./ProductionSampleJourneyGuide";

const STORAGE_KEY = "toonstudio:production-sample-journey:v1";

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function renderGuide() {
  return render(
    <MemoryRouter>
      <ProductionSampleJourneyGuide />
    </MemoryRouter>,
  );
}

describe("ProductionSampleJourneyGuide", () => {
  it("presents the complete sample workflow without mixing it into user projects", () => {
    renderGuide();

    expect(screen.getByRole("heading", { name: "밤의 우편배달부 12화를 따라 제작 전 과정을 확인하세요" })).toBeTruthy();
    expect(screen.getByText("진행 0/6")).toBeTruthy();
    expect(screen.getByRole("link", { name: /1\. 작품 브리프 확인/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/planning");
    expect(screen.getByText(/샘플은 내 프로젝트와 분리됩니다/u)).toBeTruthy();
  });

  it("persists progress in the current browser session", () => {
    const view = renderGuide();
    fireEvent.click(screen.getByRole("link", { name: /샘플 제작 흐름 시작/u }));

    expect(screen.getByText("진행 1/6")).toBeTruthy();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("1");

    view.unmount();
    renderGuide();
    expect(screen.getByText("진행 1/6")).toBeTruthy();
    expect(screen.getByRole("link", { name: /다음 단계 열기/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes");
  });
});
