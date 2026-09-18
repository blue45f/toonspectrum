// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionLandingPage } from "./ProductionLandingPage";
import {
  ProductionEpisodeRoomPage,
  ProductionProjectPage,
} from "./ProductionHubPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("webtoon production collaboration UI", () => {
  it("presents the production operating model and opens the sample project", () => {
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("흩어진 웹툰 제작");
    expect(screen.getByRole("link", { name: /기능 미리 보기/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/overview");
    expect(screen.getAllByText("작업 넘기기").length).toBeGreaterThan(0);
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
    expect(screen.getByRole("heading", { name: "프로젝트 운영 조종석" })).toBeTruthy();
    expect(screen.getByText("막힌 질문")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오늘의 운영 판단" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "회차 공정 매트릭스" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "팀 작업량" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /12화.*돌아온 봉투/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes/episode-12");
    expect(screen.getByText(/수정할 수 없는 기록/u)).toBeTruthy();
  });

  it("keeps role perspective and canonical production data separate", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/planning"]}>
        <Routes>
          <Route path="/production/projects/:projectId/planning" element={<ProductionProjectPage surface="planning" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: /내 역할/u }), { target: { value: "story" } });
    expect(screen.getByText("작품 한눈에 보기")).toBeTruthy();
    expect(screen.getByText("작품 공통 설정")).toBeTruthy();
    expect(screen.getByText("창작 합의")).toBeTruthy();
    expect(screen.getByText("창작 결정권 매트릭스")).toBeTruthy();
    expect(screen.getAllByText("돌아온 봉투").length).toBeGreaterThan(0);
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
    fireEvent.change(screen.getByRole("combobox", { name: /내 역할/u }), { target: { value: "story" } });
    expect((decision as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(decision);
    await waitFor(() => expect(screen.getByText(/문양은 보여도 되지만/u)).toBeTruthy());
    expect(screen.getByRole("heading", { name: /episode-12 공동 회차 작업실/u })).toBeTruthy();
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

  it("edits a locked episode through a new visual planning revision", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/planning"]}>
        <Routes>
          <Route path="/production/projects/:projectId/planning" element={<ProductionProjectPage surface="planning" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Visual Planning Workspace")).toBeTruthy();
    const title = screen.getByRole("textbox", { name: "회차 제목" }) as HTMLInputElement;
    expect(title.value).toBe("돌아온 봉투");
    fireEvent.change(title, { target: { value: "돌아온 봉투 · 수정안" } });
    fireEvent.blur(title);
    await waitFor(() => expect((screen.getByRole("textbox", { name: "회차 제목" }) as HTMLInputElement).value).toBe("돌아온 봉투 · 수정안"));
    expect(screen.getAllByText("초안 r4").length).toBeGreaterThan(0);
  });

  it("reorders locked cuts through queued draft revisions", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/planning"]}>
        <Routes>
          <Route path="/production/projects/:projectId/planning" element={<ProductionProjectPage surface="planning" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("group", { name: "컷 순서 이동" }).textContent).toContain("1/2");
    fireEvent.click(screen.getByRole("button", { name: "다음 컷으로 이동" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "컷 순서 이동" }).textContent).toContain("2/2"));
    expect(screen.getByText("저장됨")).toBeTruthy();
  });

  it("edits production task status from the schedule surface", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/schedule"]}>
        <Routes>
          <Route path="/production/projects/:projectId/schedule" element={<ProductionProjectPage surface="schedule" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "일정·용량 작업실" })).toBeTruthy();
    const status = screen.getByRole("combobox", { name: "12화 콘티와 세로 리듬 상태" }) as HTMLSelectElement;
    fireEvent.change(status, { target: { value: "blocked" } });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "12화 콘티와 세로 리듬 상태" }) as HTMLSelectElement).value).toBe("blocked"));
    expect(screen.getByText("저장됨")).toBeTruthy();
  });

  it("opens the production command palette without hijacking ordinary typing", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/planning"]}>
        <Routes>
          <Route path="/production/projects/:projectId/planning" element={<ProductionProjectPage surface="planning" />} />
        </Routes>
      </MemoryRouter>,
    );
    const editor = screen.getByRole("textbox", { name: "회차 제목" });
    fireEvent.keyDown(editor, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog", { name: "제작 관리 빠른 이동" })).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "제작 관리 빠른 이동" })).toBeTruthy();
    const search = screen.getByRole("textbox", { name: "제작 관리 메뉴, 회차, 작업 검색" });
    fireEvent.change(search, { target: { value: "일정" } });
    expect(screen.getByRole("option", { name: /일정/u })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "제작 관리 빠른 이동" })).toBeNull();
  });

  it("renders visual review controls and records an eligible production-lane decision", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/review"]}>
        <Routes>
          <Route path="/production/projects/:projectId/review" element={<ProductionProjectPage surface="review" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "원고 비교·주석·승인" })).toBeTruthy();
    const approve = screen.getByRole("button", { name: "승인" });
    fireEvent.click(approve);
    await waitFor(() => expect(screen.getByText("저장됨")).toBeTruthy());
  });

  it("runs a role-based production task through its review gate", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/production"]}>
        <Routes>
          <Route path="/production/projects/:projectId/production" element={<ProductionProjectPage surface="production" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "직군별 제작 셀과 인수인계를 한 화면에서" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "팀 구성" }));
    expect(screen.getByRole("heading", { name: "직군별 팀 커버리지" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "직군 보드" }));
    fireEvent.click(screen.getByRole("button", { name: /12화 에셋·AI·크레딧 권리 검수/u }));
    const review = await screen.findByRole("button", { name: "검수 요청" });
    expect((review as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(review);
    await waitFor(() => expect(screen.getByRole("button", { name: "승인 처리" })).toBeTruthy());
    expect(screen.getByText("저장됨")).toBeTruthy();
  });

  it("shows the webtoon pipeline and parallel art handoffs", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/production"]}>
        <Routes>
          <Route path="/production/projects/:projectId/production" element={<ProductionProjectPage surface="production" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "공정 흐름" }));
    expect(screen.getByRole("heading", { name: "웹툰 표준 공정" })).toBeTruthy();
    expect(screen.getByText("캐릭터·선화")).toBeTruthy();
    expect(screen.getAllByText("배경·3D").length).toBeGreaterThan(0);
    expect(screen.getByText("입력: 선화 + 배경")).toBeTruthy();
  });

  it("operates episode deadlines, standard stages and episode-scoped music from one surface", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/episodes"]}>
        <Routes>
          <Route path="/production/projects/:projectId/episodes" element={<ProductionProjectPage surface="episodes" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "연재·회차 운영실" })).toBeTruthy();
    expect(screen.getByText("준비 버퍼")).toBeTruthy();
    expect(screen.getByText("오늘의 운영 판단")).toBeTruthy();

    const episode12 = screen.getByRole("article", { name: "12화 연재 운영" });
    expect(within(episode12).getByRole("link", { name: "회차 음악" }).getAttribute("href"))
      .toBe("/studio/assets/audio?workId=sample-work&episodeId=episode-12");

    const episode13 = screen.getByRole("article", { name: "13화 연재 운영" });
    const deadline = within(episode13).getByLabelText("13화 게시 마감") as HTMLInputElement;
    expect(deadline.value).toBe("");
    expect(within(episode13).getByText("표준 공정 8개 미등록")).toBeTruthy();
    fireEvent.change(deadline, { target: { value: "2026-10-02T18:00" } });
    fireEvent.click(within(episode13).getByRole("button", { name: "표준 공정 구성" }));
    await waitFor(() => expect(screen.getByText("저장됨")).toBeTruthy());
    await waitFor(() => expect(within(screen.getByRole("article", { name: "13화 연재 운영" })).queryByText("표준 공정 8개 미등록")).toBeNull());
  });

});
