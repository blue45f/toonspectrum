// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateGalleryPage } from "../CreateGalleryPage";

import { useApp } from "@/shared/lib/store";

import type { SeriesSummary, WorkSummary } from "@/platform/creator-client";

const creatorClient = vi.hoisted(() => ({
  listWorks: vi.fn(),
  listSeries: vi.fn(),
  listFollowingFeed: vi.fn(),
  listChallenges: vi.fn(),
  createSeries: vi.fn(),
}));

vi.mock("@/platform/creator-client", () => ({
  ...creatorClient,
  challengeDday: () => null,
  updateSeries: vi.fn(),
}));

// 공간 캠퍼스·공용 여정 링크는 이 화면의 목록 동작과 무관하므로 가볍게 대체한다.
vi.mock("@/shared/components/spatial-campus/CampusObjectSource", () => ({ CampusObjectSource: () => null }));
vi.mock("@/shared/components/public-creative", () => ({ CreativeJourneyLinks: () => null }));

function work(id: string, title: string): WorkSummary {
  return {
    id,
    title,
    description: "",
    cover: "",
    tags: ["로맨스"],
    format: "upload",
    titleId: null,
    status: "published",
    author: { id: "author", name: "작가", avatar: "#7c5cfc" },
    likes: 3,
    comments: 1,
    views: 10,
    liked: false,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function series(index: number): SeriesSummary {
  return {
    id: `s${index}`,
    title: `연재 시리즈 ${index}`,
    description: "",
    cover: "",
    tags: [],
    status: "ongoing",
    showcaseEnabled: true,
    author: { id: "author", name: "작가", avatar: "#7c5cfc" },
    episodes: 3,
    views: 10,
    likes: 2,
    latestEpisodeAt: null,
    isOwner: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderGallery(entry = "/showcase") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CreateGalleryPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  creatorClient.listWorks.mockResolvedValue([work("w1", "첫 작품"), work("w2", "두 번째 작품")]);
  creatorClient.listSeries.mockResolvedValue([]);
  creatorClient.listFollowingFeed.mockResolvedValue([]);
  creatorClient.listChallenges.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useApp.setState({ userId: null });
});

describe("CreateGalleryPage", () => {
  it("첫 화면은 한 문장 가치와 주요 행동 하나·보조 행동 하나로 시작한다", () => {
    renderGallery();
    const hero = screen.getByRole("region", { name: "창작 갤러리" });
    expect(within(hero).getByRole("heading", { level: 1, name: "창작 갤러리" })).toBeTruthy();
    expect(within(hero).getByRole("link", { name: "웹툰 그리기" }).getAttribute("href")).toBe("/studio");
    expect(within(hero).getByRole("link", { name: "작품 올리기" }).getAttribute("href")).toContain("/studio");
    // 챌린지·승인본 전시는 보조 바로가기로 옮겨 도달 경로를 유지한다.
    const shortcuts = within(hero).getByRole("navigation", { name: "갤러리 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "창작 챌린지" }).getAttribute("href")).toBe("/showcase/challenges");
    expect(within(shortcuts).getByRole("link", { name: "승인본 전시" }).getAttribute("href")).toBe("/showcase/reviews");
    // 예시 아트는 실제 게시 작품과 구분된다고 밝힌다.
    expect(within(hero).getByText(/실제 게시 작품과 구분됩니다/u)).toBeTruthy();
  });

  it("작품 유형 필터는 이름 있는 묶음이고, 팔로잉 탭에서는 정렬·필터를 숨긴다", async () => {
    renderGallery();
    const contentType = screen.getByRole("group", { name: "작품 유형" });
    fireEvent.click(within(contentType).getByRole("button", { name: "웹툰·만화" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/showcase?content=webtoon"));

    fireEvent.click(within(screen.getByRole("tablist", { name: "작품 보기" })).getByRole("tab", { name: "팔로잉" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "정렬" })).toBeNull());
    expect(screen.queryByRole("group", { name: "작품 유형" })).toBeNull();
  });

  it("서버에 닿지 못하면 빨간 오류 대신 재시도와 다음 행동을 함께 보여 준다", async () => {
    creatorClient.listWorks.mockRejectedValue(new Error("일부 온라인 기능을 일시적으로 사용할 수 없습니다."));
    creatorClient.listChallenges.mockRejectedValue(new Error("offline"));
    renderGallery();

    const state = await screen.findByText("작품 목록을 잠시 불러올 수 없어요");
    const panel = state.closest("[data-slot='showcase-unavailable']");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("role")).toBe("status");
    const scope = within(panel as HTMLElement);
    expect(scope.getByRole("link", { name: "웹툰 그리기" }).getAttribute("href")).toBe("/studio");
    expect(scope.getByRole("link", { name: "창작 챌린지 보기" }).getAttribute("href")).toBe("/showcase/challenges");
    expect(scope.getByText(/일부 온라인 기능을 일시적으로 사용할 수 없습니다/u)).toBeTruthy();
    // 추천 영역은 같은 실패를 중복 경고하지 않는다.
    expect(screen.getAllByText("작품 목록을 잠시 불러올 수 없어요")).toHaveLength(1);

    creatorClient.listWorks.mockResolvedValue([work("w1", "첫 작품")]);
    fireEvent.click(scope.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("작품 1개")).toBeTruthy();
  });

  it("보기 탭은 WAI-ARIA 탭 패턴과 키보드 이동을 지원한다", async () => {
    renderGallery();
    const tablist = screen.getByRole("tablist", { name: "작품 보기" });
    const allWorks = within(tablist).getByRole("tab", { name: "전체 작품" });
    expect(allWorks.getAttribute("aria-selected")).toBe("true");
    expect(allWorks.getAttribute("tabindex")).toBe("0");
    expect(within(tablist).getByRole("tab", { name: "시리즈" }).getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(allWorks.id);

    fireEvent.keyDown(allWorks, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/showcase?tab=series"));
    expect(within(tablist).getByRole("tab", { name: "시리즈" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(within(tablist).getByRole("tab", { name: "시리즈" }), { key: "End" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/showcase?tab=saved"));
  });

  it("정렬은 탭이 아닌 눌림 상태 버튼 그룹이며 결과 수를 알려 준다", async () => {
    renderGallery();
    expect(await screen.findByText("작품 2개")).toBeTruthy();
    const sort = screen.getByRole("group", { name: "정렬" });
    expect(within(sort).getByRole("button", { name: "최신" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(sort).getByRole("button", { name: "인기" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/showcase?sort=likes"));
    await waitFor(() => expect(creatorClient.listWorks).toHaveBeenCalledWith(expect.objectContaining({ sort: "likes" }), expect.any(AbortSignal)));
  });

  it("적용된 필터를 칩으로 보여 주고 한 번에 지울 수 있다", async () => {
    renderGallery("/showcase?tag=%EB%A1%9C%EB%A7%A8%EC%8A%A4&content=webtoon&portfolio=1");
    const active = screen.getByRole("group", { name: "적용된 필터" });
    expect(within(active).getByRole("button", { name: "#로맨스 태그 필터 해제" })).toBeTruthy();
    expect(within(active).getByRole("button", { name: "작품 유형 필터 해제" })).toBeTruthy();
    // 필터가 걸린 동안에는 추천 영역을 숨겨 결과에 집중시킨다.
    expect(creatorClient.listChallenges).not.toHaveBeenCalled();

    fireEvent.click(within(active).getByRole("button", { name: "필터 모두 지우기" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/showcase"));
    expect(screen.queryByRole("group", { name: "적용된 필터" })).toBeNull();
  });

  it("조건에 맞는 작품이 없으면 필터 초기화와 만들기 행동을 안내한다", async () => {
    creatorClient.listWorks.mockResolvedValue([]);
    renderGallery("/showcase?content=process");
    expect(await screen.findByText("조건에 맞는 창작물이 아직 없습니다.")).toBeTruthy();
    const clearButtons = screen.getAllByRole("button", { name: "필터 모두 지우기" });
    expect(clearButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "창작 스튜디오로 만들기" }).getAttribute("href")).toBe("/studio");
  });

  it("작품이 많으면 12개까지만 먼저 그리고 더 보기로 이어 붙인다", async () => {
    creatorClient.listWorks.mockResolvedValue(Array.from({ length: 15 }, (_, index) => work(`w${index}`, `작품 ${index}`)));
    // 필터가 걸리면 추천 영역이 빠져 본 목록의 카드만 센다.
    renderGallery("/showcase?content=webtoon");
    const panel = await screen.findByRole("tabpanel");
    await waitFor(() => expect(within(panel).getAllByRole("heading", { level: 3 })).toHaveLength(12));
    expect(within(panel).getByText("작품 15개")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "더 보기 · 남은 작품 3개" }));
    expect(within(panel).getAllByRole("heading", { level: 3 })).toHaveLength(15);
    expect(within(panel).queryByRole("button", { name: /더 보기/u })).toBeNull();
  });

  it("시리즈 탭도 처음 6개만 그리고 더 보기로 이어 붙인다", async () => {
    creatorClient.listSeries.mockResolvedValue(Array.from({ length: 8 }, (_, index) => series(index)));
    renderGallery("/showcase?tab=series");
    const panel = await screen.findByRole("tabpanel");
    await waitFor(() => expect(within(panel).getAllByRole("heading", { level: 3 })).toHaveLength(6));

    fireEvent.click(within(panel).getByRole("button", { name: "더 보기 · 남은 시리즈 2개" }));
    expect(within(panel).getAllByRole("heading", { level: 3 })).toHaveLength(8);
  });

  it("로그인하지 않으면 시리즈 만들기 진입을 보이지 않는다", async () => {
    renderGallery("/showcase?tab=series");
    await screen.findByText("아직 연재 시리즈가 없습니다.");
    expect(screen.queryByRole("button", { name: "연재 시작 마법사" })).toBeNull();
    expect(screen.queryByRole("button", { name: "새 시리즈 만들기" })).toBeNull();
  });

  it("작가는 시리즈 탭에서 연재 시작 마법사를 열고 나중에 하기로 돌아올 수 있다", async () => {
    useApp.setState({ userId: "me" });
    renderGallery("/showcase?tab=series");
    fireEvent.click(await screen.findByRole("button", { name: "연재 시작 마법사" }));
    expect(await screen.findByTestId("series-launch-wizard")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));
    expect(screen.queryByTestId("series-launch-wizard")).toBeNull();
    expect(screen.getByRole("button", { name: "연재 시작 마법사" })).toBeTruthy();
    // 빠른 만들기 폼도 같은 자리에 그대로 있다.
    fireEvent.click(screen.getByRole("button", { name: "새 시리즈 만들기" }));
    expect(screen.getByRole("textbox", { name: "시리즈 제목" })).toBeTruthy();
  });

  it("마법사로 시리즈를 만들면 목록 맨 앞에 보이고 첫 회차로 바로 이어 간다", async () => {
    useApp.setState({ userId: "me" });
    const made = { ...series(99), title: "옥상 방과후", isOwner: true };
    creatorClient.createSeries.mockResolvedValue(made);
    renderGallery("/showcase?tab=series");
    fireEvent.click(await screen.findByRole("button", { name: "연재 시작 마법사" }));
    await screen.findByTestId("series-launch-wizard");

    // 하단 이동 버튼의 이름은 정확히 "다음"이다(‘다음 할 일’ 안내 버튼과 구분된다).
    const next = () => fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("장르"), { target: { value: "romance" } });
    fireEvent.change(screen.getByLabelText("한 줄 소개"), { target: { value: "옥상에서 만난 두 사람" } });
    fireEvent.change(screen.getByLabelText("시놉시스"), { target: { value: "시작과 갈등과 결말" } });
    next();
    fireEvent.change(screen.getByLabelText("시리즈 제목"), { target: { value: "옥상 방과후" } });
    next();
    fireEvent.change(screen.getByLabelText("첫 회차 제목"), { target: { value: "1화" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /원고 이미지 준비됨/u }));
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: /발행 규격 점검 통과/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: /발행 일정 결정/u }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "연재 시작하기" }));

    const notice = await screen.findByRole("region", { name: "‘옥상 방과후’ 시리즈를 열었어요" });
    expect(creatorClient.createSeries).toHaveBeenCalledTimes(1);
    expect(within(notice).getByRole("link", { name: "첫 회차 만들기" }).getAttribute("href")).toBe("/studio?seriesId=s99");
    expect(within(notice).getByRole("link", { name: "이미지 올려 발행" }).getAttribute("href")).toBe("/studio?seriesId=s99&mode=upload");
    expect(within(notice).getByRole("link", { name: "시리즈 페이지 보기" }).getAttribute("href")).toBe("/create/series/s99");
    // 방금 만든 시리즈가 목록 맨 앞에 보인다.
    expect(screen.getByRole("heading", { level: 3, name: "옥상 방과후" })).toBeTruthy();

    fireEvent.click(within(notice).getByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByRole("region", { name: "‘옥상 방과후’ 시리즈를 열었어요" })).toBeNull();
  });
});
