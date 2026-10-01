// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateGalleryPage } from "../CreateGalleryPage";

import type { WorkSummary } from "@/platform/creator-client";

const creatorClient = vi.hoisted(() => ({
  listWorks: vi.fn(),
  listSeries: vi.fn(),
  listFollowingFeed: vi.fn(),
  listChallenges: vi.fn(),
}));

vi.mock("@/platform/creator-client", () => ({
  ...creatorClient,
  challengeDday: () => null,
  createSeries: vi.fn(),
  updateSeries: vi.fn(),
}));

// 공간 캠퍼스·공용 여정 링크·브랜드 인트로는 이 화면의 목록 동작과 무관하므로 가볍게 대체한다.
vi.mock("@/shared/components/spatial-campus/CampusObjectSource", () => ({ CampusObjectSource: () => null }));
vi.mock("@/shared/components/public-creative", () => ({ CreativeJourneyLinks: () => null }));
vi.mock("../WebtoonGalleryIntro", () => ({ WebtoonGalleryIntro: () => <h1>갤러리</h1> }));

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
});

describe("CreateGalleryPage", () => {
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
});
