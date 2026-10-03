// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionLandingPage } from "./ProductionLandingPage";
import {
  ProductionEpisodeRoomPage,
  ProductionProjectPage,
} from "./ProductionHubPage";
import { resetProductionDemoSession } from "./production-demo-adapter";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // 샘플 변경은 같은 탭의 페이지 사이에서 유지되므로 테스트마다 처음 상태로 되돌린다.
  resetProductionDemoSession();
});

describe("webtoon production collaboration UI", () => {
  it("leads first-time visitors into the sample flow without fake metrics", () => {
    render(<MemoryRouter><ProductionLandingPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("웹툰 제작을 한 흐름으로");
    expect(screen.getByRole("link", { name: /샘플 프로젝트로 체험하기/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/overview");
    expect(screen.getByRole("link", { name: "사람·권한" }).getAttribute("href")).toBe("/team/people");
    // 샘플은 샘플이라고 표시하고, 근거 없는 숫자 대신 실제로 따라갈 흐름을 보여 준다.
    expect(screen.getAllByText("예시 데이터").length).toBeGreaterThan(0);
    const flow = screen.getByRole("heading", { name: "샘플로 따라가는 협업 흐름" }).closest("section");
    expect(flow).not.toBeNull();
    const steps = within(flow as HTMLElement).getAllByRole("link");
    expect(steps.map((link) => link.getAttribute("href"))).toEqual([
      "/production/projects/sample-project/overview",
      "/production/projects/sample-project/production?boardLayout=process",
      "/production/projects/sample-project/episodes/episode-12",
      "/production/projects/sample-project/episodes/episode-12?roomView=compare",
    ]);
    expect(screen.queryByText("100%")).toBeNull();
  });

  it("opens the project on a four-part dashboard and keeps operations detail one click away", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
        <Routes>
          <Route path="/production/projects/:projectId/overview" element={<ProductionProjectPage surface="overview" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("밤의 우편배달부");
    expect(screen.getByRole("heading", { name: "전체 진행률" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "마감 임박 회차" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "내 할 일" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "최근 피드백" })).toBeTruthy();
    // 막힌 질문이 있으면 "지금 할 일"이 그 회차 룸으로 곧장 안내한다.
    expect(screen.getByText("막힌 질문에 먼저 답해 주세요")).toBeTruthy();
    expect(screen.getByRole("link", { name: /회차 룸에서 답하기/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes/episode-12");
    expect(screen.getByRole("link", { name: /12화 · 돌아온 봉투/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/episodes/episode-12");
    // 샘플 안내와 탭 설명·다음 단계가 함께 보인다.
    expect(screen.getAllByText("샘플 프로젝트").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /다음 단계:.*공정 보드 열기/u }).getAttribute("href"))
      .toBe("/production/projects/sample-project/production");
    // 운영 상세는 접혀 있다가 열 때 그린다.
    expect(screen.queryByRole("heading", { name: "프로젝트 운영 조종석" })).toBeNull();
    const details = screen.getByText("운영 상세 보기").closest("details");
    expect(details).not.toBeNull();
    (details as HTMLDetailsElement).open = true;
    fireEvent(details as HTMLDetailsElement, new Event("toggle"));
    expect(await screen.findByRole("heading", { name: "프로젝트 운영 조종석" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오늘의 운영 판단" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "회차 공정 매트릭스" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "팀 작업량" })).toBeTruthy();
  });

  it("puts the five core surfaces first and the rest under More", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
        <Routes>
          <Route path="/production/projects/:projectId/overview" element={<ProductionProjectPage surface="overview" />} />
        </Routes>
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "프로젝트 메뉴" });
    const more = within(nav).getByText("더보기").closest("details");
    expect(more).not.toBeNull();
    const coreLinks = within(nav).getAllByRole("link").filter((link) => !(more as HTMLElement).contains(link));
    expect(coreLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/production/projects/sample-project/overview",
      "/production/projects/sample-project/production",
      "/production/projects/sample-project/episodes",
      "/production/projects/sample-project/manuscripts",
      "/production/projects/sample-project/review",
    ]);
    expect(within(more as HTMLElement).getAllByRole("link")).toHaveLength(8);
    expect(within(more as HTMLElement).getAllByRole("link")[0]?.getAttribute("href")).toBe(
      "/production/projects/sample-project/activity",
    );
    expect(coreLinks[0]?.getAttribute("aria-current")).toBe("page");
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
    expect(screen.getByRole("heading", { level: 1, name: "12화 · 돌아온 봉투" })).toBeTruthy();
    expect(screen.getByText("마지막 컷 전에도 봉투 뒷면의 문양은 보여도 되나요?")).toBeTruthy();
    const decision = screen.getByRole("button", { name: "결정 기록" });
    expect((decision as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: /내 역할/u }), { target: { value: "story" } });
    expect((decision as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(decision);
    await waitFor(() => expect(screen.queryByRole("button", { name: "결정 기록" })).toBeNull());
    expect(screen.getByText(/문양은 보여도 되지만/u)).toBeTruthy();
    // 질문에 답해도 작업 넘기기나 검수 승인이 자동으로 바뀌지 않는다.
    expect(screen.getByText("이 브라우저에 반영됨")).toBeTruthy();
    expect(screen.getAllByText("대기").length).toBeGreaterThan(0);
  });

  it("locks an approval while a required-fix pin is open and records it after the pin is resolved", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/episodes/episode-12"]}>
        <Routes>
          <Route path="/production/projects/:projectId/episodes/:episodeId" element={<ProductionEpisodeRoomPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "원고 검수" })).toBeTruthy();
    expect(screen.getAllByText("예시 원고·코멘트").length).toBeGreaterThan(0);
    const approve = screen.getByRole("button", { name: "시각 연출 승인" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("필수 수정 핀 1개를 먼저 해결해야 승인할 수 있습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /핀 \d, 긴급/u }));
    fireEvent.click(screen.getByRole("button", { name: "해결하기" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "시각 연출 승인" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "시각 연출 승인" }));
    await waitFor(() => expect(screen.getByText("내 역할의 승인이 이미 기록되었습니다.")).toBeTruthy());
  });

  it("opens the version compare tab from the room link", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/episodes/episode-12?roomView=compare"]}>
        <Routes>
          <Route path="/production/projects/:projectId/episodes/:episodeId" element={<ProductionEpisodeRoomPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("tab", { name: /버전 비교/u }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("pcv-root")).toBeTruthy();
    expect(screen.getByRole("button", { name: /비포·애프터/u })).toBeTruthy();
  });

  it("exposes the integrated manuscript, version, feedback, sharing and AI workspace", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/manuscripts"]}>
        <Routes>
          <Route path="/production/projects/:projectId/manuscripts" element={<ProductionProjectPage surface="manuscripts" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "툰스튜디오에 통합된 제작 기능" })).toBeTruthy();
    expect(screen.getByText("이미지·텍스트 공정")).toBeTruthy();
    expect(screen.getByText("불변 버전·최종본")).toBeTruthy();
    expect(screen.getByText("페이지·컷 피드백")).toBeTruthy();
    expect(screen.getByText("보호 공유·모바일 검수")).toBeTruthy();
    expect(screen.getByText("다중 형식 내보내기")).toBeTruthy();
    expect(screen.getByText("AI 제작 보조")).toBeTruthy();
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
    // 제목 입력은 즉시 보이지만 새 초안(4차)은 저장 대기열을 거친 뒤 표시된다.
    expect((await screen.findAllByText("초안 · 4차")).length).toBeGreaterThan(0);
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
    expect(screen.getByText("이 브라우저에 반영됨")).toBeTruthy();
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
    expect(screen.getByText("이 브라우저에 반영됨")).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText("이 브라우저에 반영됨")).toBeTruthy());
  });

  it("runs a role-based production task through its review gate", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/production"]}>
        <Routes>
          <Route path="/production/projects/:projectId/production" element={<ProductionProjectPage surface="production" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "역할별 작업실" }));
    expect(screen.getByRole("heading", { name: "직군별 제작 셀과 인수인계를 한 화면에서" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "팀 구성" }));
    expect(screen.getByRole("heading", { name: "담당 역할별 팀 커버리지" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "직군 보드" }));
    fireEvent.click(screen.getByRole("button", { name: /12화 에셋·AI·크레딧 권리 검수/u }));
    const review = await screen.findByRole("button", { name: "검수 요청" });
    expect((review as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(review);
    await waitFor(() => expect(screen.getByRole("button", { name: "승인 처리" })).toBeTruthy());
    expect(screen.getByText("이 브라우저에 반영됨")).toBeTruthy();
  });

  it("shows the webtoon pipeline and parallel art handoffs", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/production"]}>
        <Routes>
          <Route path="/production/projects/:projectId/production" element={<ProductionProjectPage surface="production" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "역할별 작업실" }));
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
    await waitFor(() => expect(screen.getByText("이 브라우저에 반영됨")).toBeTruthy());
    await waitFor(() => expect(within(screen.getByRole("article", { name: "13화 연재 운영" })).queryByText("표준 공정 8개 미등록")).toBeNull());
  });

});
