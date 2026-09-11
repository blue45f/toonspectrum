// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioFeatureOperationsPanel } from "./StudioFeatureOperationsPanel";

afterEach(cleanup);

describe("StudioFeatureOperationsPanel", () => {
  it("makes rights, passport and font operations reachable from the project", () => {
    render(
      <MemoryRouter>
        <StudioFeatureOperationsPanel
          projectId="series/한글"
          section="assets"
          view="rights"
          locale="ko"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "프로젝트 기능과 실제 작업 연결" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "에셋 품질 여권" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "사용 권리와 출처 그래프" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "폰트·글리프·임베딩 검사" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /출력 전 검사로 이동/u }).getAttribute("href"))
      .toBe("/studio/p/series%2F%ED%95%9C%EA%B8%80/export?view=preflight");
  });

  it("keeps publishing capabilities in the export workflow", () => {
    render(
      <MemoryRouter>
        <StudioFeatureOperationsPanel
          projectId="project-1"
          section="export"
          view="preflight"
          locale="en"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Publishing connectors" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reproducible export packages" })).toBeTruthy();
  });

  it("renders nothing for views without advanced operations", () => {
    const { container } = render(
      <MemoryRouter>
        <StudioFeatureOperationsPanel
          projectId="project-1"
          section="overview"
          view="dashboard"
          locale="ko"
        />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("");
  });
});
