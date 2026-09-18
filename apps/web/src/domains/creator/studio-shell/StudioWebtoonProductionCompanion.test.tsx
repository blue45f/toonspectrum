// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioWebtoonProductionCompanion } from "./StudioWebtoonProductionCompanion";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioWebtoonProductionCompanion", () => {
  it("shows production guidance for the current project view and persists helper checks", async () => {
    const renderPanel = () => render(
      <MemoryRouter>
        <StudioWebtoonProductionCompanion
          projectId="series/한글"
          section="production"
          view="pipeline"
          locale="ko"
        />
      </MemoryRouter>,
    );

    const first = renderPanel();
    expect(screen.getByRole("heading", { name: "현재 화면과 연결된 실제 제작 단계" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "공정 분해·배정" })).toBeTruthy();

    const check = screen.getByRole("button", { name: /모든 컷에 다음 담당자가 정해졌다/u });
    expect(check.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(check);
    expect(check.getAttribute("aria-pressed")).toBe("true");

    const pipelineLink = screen.getByRole("link", { name: /제작 단계/u });
    expect(pipelineLink.getAttribute("href")).toContain("/studio/p/series%2F");
    expect(pipelineLink.getAttribute("href")).toContain("view=pipeline");

    first.unmount();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /모든 컷에 다음 담당자가 정해졌다/u }).getAttribute("aria-pressed"))
        .toBe("true");
    });
  });

  it("stays hidden when the current project view has no mapped webtoon stage", () => {
    const { container } = render(
      <MemoryRouter>
        <StudioWebtoonProductionCompanion projectId="project-1" section="overview" view="summary" locale="ko" />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe("");
  });
});
