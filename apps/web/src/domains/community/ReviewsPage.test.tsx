// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewFeedItem, ReviewsResponse, Title } from "@/shared/lib/types";

import { ReviewsPage } from "./ReviewsPage";

const mocks = vi.hoisted(() => ({
  useApiResource: vi.fn(),
  fetchApiResource: vi.fn(),
}));

vi.mock("@/platform/use-api-resource", () => mocks);
vi.mock("@/shared/components/review-card", () => ({
  ReviewCard: ({ review }: { readonly review: ReviewFeedItem }) => (
    <article data-testid="review-card" data-review-id={review.id} />
  ),
}));
vi.mock("./reviews-components/review-controls", () => ({
  ReviewControls: () => <div data-testid="review-controls" />,
}));

/** jsdom에는 IntersectionObserver가 없으므로 테스트용 스텁을 주입한다. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  private readonly callback: IntersectionObserverCallback;
  readonly targets: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(target: Element): void {
    const index = this.targets.indexOf(target);
    if (index >= 0) this.targets.splice(index, 1);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting }] as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

function makeTitle(): Title {
  return {
    id: "title-1",
    slug: "title-one",
    type: "webtoon",
    title: "작품 하나",
    author: "작가",
    genres: ["판타지"],
    tags: [],
    synopsis: "소개",
    cover: ["#111111", "#222222"],
    status: "ongoing",
    ageRating: "12",
    releaseYear: 2026,
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    stats: {
      views: 1,
      likes: 1,
      bookmarks: 1,
      ratingAvg: 4,
      ratingCount: 1,
      ratingDist: [0, 0, 0, 1, 0],
      rankDelta: 0,
      trendingScore: 50,
      completionRate: 50,
      bingeIndex: 50,
    },
  };
}

const sharedTitle = makeTitle();

function makeReviews(count: number, offset = 0): ReviewFeedItem[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `review-${offset + index}`;
    return {
      id,
      titleId: sharedTitle.id,
      author: `작성자${offset + index}`,
      avatar: "#ffffff",
      rating: 4.5,
      text: `리뷰 ${id}`,
      tags: [],
      spoiler: false,
      likes: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      title: sharedTitle,
    };
  });
}

function makePage(feed: ReviewFeedItem[], nextOffset: number | null): ReviewsResponse {
  return {
    sort: "recent",
    feed,
    nextOffset,
    hasMore: nextOffset !== null,
    topReviewed: [],
    stats: {
      total: feed.length,
      avg: 4.5,
      spoilerPct: 0,
      distinctTitles: 1,
    },
    generatedAt: "2026-09-30T00:00:00.000Z",
    source: "database",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/community/reviews"]}>
      <ReviewsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver as unknown as typeof IntersectionObserver);
  mocks.useApiResource.mockReturnValue({
    data: null,
    loading: false,
    error: null,
    reload: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("ReviewsPage 무한 스크롤 페이지네이션", () => {
  it("첫 페이지는 limit=30&offset=0 으로 요청하고 30개만 누적 렌더한다", async () => {
    mocks.useApiResource.mockReturnValue({
      data: makePage(makeReviews(30), 30),
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(mocks.useApiResource).toHaveBeenCalledWith(
      expect.stringContaining("limit=30&offset=0"),
      expect.any(String),
    );
    const cards = await screen.findAllByTestId("review-card");
    expect(cards).toHaveLength(30);
    // nextOffset이 남아 있으면 센티넬이 붙어 observer가 생성된다.
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it("nextOffset이 null이면 센티넬을 렌더하지 않는다", async () => {
    mocks.useApiResource.mockReturnValue({
      data: makePage(makeReviews(10), null),
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    const cards = await screen.findAllByTestId("review-card");
    expect(cards).toHaveLength(10);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("센티넬이 교차하면 limit/offset으로 다음 페이지를 로드해 누적한다", async () => {
    mocks.useApiResource.mockReturnValue({
      data: makePage(makeReviews(30), 30),
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    mocks.fetchApiResource.mockResolvedValue(makePage(makeReviews(30, 30), null));

    renderPage();

    await screen.findAllByTestId("review-card");
    const [observer] = FakeIntersectionObserver.instances;
    expect(observer).toBeTruthy();

    await act(async () => {
      observer?.trigger(true);
    });

    expect(mocks.fetchApiResource).toHaveBeenCalledWith(
      expect.stringContaining("limit=30&offset=30"),
      expect.any(String),
    );
    const cards = await screen.findAllByTestId("review-card");
    expect(cards).toHaveLength(60);
  });

  it("로드 중 센티넬이 연속으로 교차해도 fetch는 한 번만 나간다", async () => {
    mocks.useApiResource.mockReturnValue({
      data: makePage(makeReviews(30), 30),
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    const pending = deferred<ReviewsResponse>();
    mocks.fetchApiResource.mockReturnValue(pending.promise);

    renderPage();

    await screen.findAllByTestId("review-card");
    const [observer] = FakeIntersectionObserver.instances;
    expect(observer).toBeTruthy();

    // 같은 틱에 두 번 교차 — ref 가드로 중복 호출이 합쳐져야 한다.
    act(() => {
      observer?.trigger(true);
      observer?.trigger(true);
    });
    expect(mocks.fetchApiResource).toHaveBeenCalledTimes(1);

    // 로딩 스피너가 보이는 동안에는 fetch가 끝나기 전이다.
    expect(screen.getByText("리뷰를 더 불러오는 중…")).toBeTruthy();

    await act(async () => {
      pending.resolve(makePage(makeReviews(30, 30), null));
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("review-card")).toHaveLength(60);
    });
  });
});

describe("ReviewsPage 로딩·실패 상태", () => {
  it("첫 페이지를 불러오는 동안 개수와 집계를 0이나 '없음'으로 단정하지 않는다", () => {
    mocks.useApiResource.mockReturnValue({ data: null, loading: true, error: null, reload: vi.fn() });
    const { container } = renderPage();

    expect(container.textContent).not.toMatch(/(^|\D)0\s*개의 리뷰/u);
    expect(screen.queryByText("개의 리뷰")).toBeNull();
    expect(screen.queryByText("아직 집계된 리뷰가 없습니다.")).toBeNull();
    expect(screen.queryByText("아직 등록된 리뷰가 없습니다")).toBeNull();
    expect(screen.getByText("리뷰를 불러오는 중")).toBeTruthy();
    expect(screen.getByText("리뷰 집계를 불러오는 중")).toBeTruthy();
    // 헤더 요약도 0 대신 자리 표시.
    expect([...container.querySelectorAll("dl dd")].every((node) => !/^0/u.test(node.textContent ?? ""))).toBe(true);
  });

  it("실패하면 재시도 블록만 두고 0개·빈 집계를 보여 주지 않는다", () => {
    const reload = vi.fn();
    mocks.useApiResource.mockReturnValue({ data: null, loading: false, error: "리뷰 데이터를 불러오지 못했습니다.", reload });
    renderPage();

    expect(screen.queryByText("개의 리뷰")).toBeNull();
    expect(screen.queryByText("아직 집계된 리뷰가 없습니다.")).toBeNull();
    expect(screen.getByText("리뷰 집계를 지금은 불러올 수 없어요.")).toBeTruthy();
    screen.getByRole("button", { name: "재시도" }).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("응답을 받으면 전체 개수와 현재 표시 개수를 함께 알린다", async () => {
    const page = makePage(makeReviews(30), 30);
    mocks.useApiResource.mockReturnValue({
      data: { ...page, stats: { ...page.stats, total: 120 } },
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    const { container } = renderPage();
    await screen.findAllByTestId("review-card");
    expect(container.textContent).toContain("120개의 리뷰");
    expect(container.textContent).toContain("30개 표시");
  });

  it("조건이 바뀌어 첫 페이지가 새로 오면 이전 조건의 추가 페이지를 버린다", async () => {
    const first = makePage(makeReviews(30), 30);
    mocks.useApiResource.mockReturnValue({ data: first, loading: false, error: null, reload: vi.fn() });
    mocks.fetchApiResource.mockResolvedValue(makePage(makeReviews(30, 30), null));
    const view = renderPage();
    await screen.findAllByTestId("review-card");
    await act(async () => {
      FakeIntersectionObserver.instances[0]?.trigger(true);
    });
    await waitFor(() => expect(screen.getAllByTestId("review-card")).toHaveLength(60));

    const next = makePage(makeReviews(5, 500), null);
    mocks.useApiResource.mockReturnValue({ data: next, loading: false, error: null, reload: vi.fn() });
    view.rerender(
      <MemoryRouter initialEntries={["/community/reviews"]}>
        <ReviewsPage />
      </MemoryRouter>,
    );
    const cards = screen.getAllByTestId("review-card");
    expect(cards).toHaveLength(5);
    expect(cards[0]?.getAttribute("data-review-id")).toBe("review-500");
  });
});
