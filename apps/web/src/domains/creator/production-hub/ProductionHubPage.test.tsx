// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  ProductionEpisodeRoomPage,
  ProductionLandingPage,
  ProductionProjectPage,
} from "./ProductionHubPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("webtoon production collaboration UI", () => {
  it("presents the production operating model and opens the sample project", () => {
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("이야기의 의도부터");
    expect(screen.getByRole("link", { name: /샘플 프로젝트 열기/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/overview");
    expect(screen.getByText("작가 간 인수인계")).toBeTruthy();
  });

  it("renders the project dashboard from one shared aggregate", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
        <Routes>
          <Route path="/production/projects/:projectId/overview" element={<ProductionProjectPage surface="overview" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("밤의 우편배달부");
    expect(screen.getByText("차단 질문")).toBeTruthy();
    expect(screen.getByRole("link", { name: /episode-12/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes/episode-12");
    expect(screen.getByText(/append-only 원장/u)).toBeTruthy();
  });

  it("keeps role perspective and canonical production data separate", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/planning"]}>
        <Routes>
          <Route path="/production/projects/:projectId/planning" element={<ProductionProjectPage surface="planning" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: /역할 관점/u }), { target: { value: "story" } });
    expect(screen.getByText("Project Brief")).toBeTruthy();
    expect(screen.getByText("Series Master")).toBeTruthy();
    expect(screen.getByText("Creative Charter")).toBeTruthy();
    expect(screen.getByText("창작 결정권 매트릭스")).toBeTruthy();
    expect(screen.getByText("돌아온 봉투")).toBeTruthy();
    expect(screen.getAllByText("강민서").length).toBeGreaterThan(0);
    expect(screen.getAllByText("윤하림").length).toBeGreaterThan(0);
  });

  it("resolves a blocking handoff question without silently approving the handoff", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/episodes/episode-12"]}>
        <Routes>
          <Route path="/production/projects/:projectId/episodes/:episodeId" element={<ProductionEpisodeRoomPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("마지막 컷 전에도 봉투 뒷면의 문양은 보여도 되나요?")).toBeTruthy();
    const decision = screen.getByRole("button", { name: "결정 기록" });
    expect((decision as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: /역할 관점/u }), { target: { value: "story" } });
    expect((decision as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(decision);
    await waitFor(() => expect(screen.getByText(/문양은 보여도 되지만/u)).toBeTruthy());
    expect(screen.getByRole("heading", { name: /episode-12 공동 Episode Room/u })).toBeTruthy();
  });

  it("shows procurement, agreement, delivery and unverified external payment as separate states", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/procurement"]}>
        <Routes>
          <Route path="/production/projects/:projectId/procurement" element={<ProductionProjectPage surface="procurement" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("문라이트 배경 스튜디오")).toBeTruthy();
    expect(screen.getByText("계약·마일스톤")).toBeTruthy();
    expect(screen.getByText("납품·청구·지급 증빙")).toBeTruthy();
    expect(screen.getByText("지급 기록 · 검증 대기")).toBeTruthy();
    expect(screen.queryByText("지급 검증 완료")).toBeNull();
  });

});
