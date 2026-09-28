// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FanCafePanel } from "./fan-cafe-panel";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  state: { userId: null as string | null, sessionToken: null as string | null },
}));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get, post: vi.fn() },
  getApiErrorMessage: async () =>
    "일부 온라인 기능을 일시적으로 사용할 수 없습니다.",
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));
vi.mock("@/shared/hooks/use-celebrate", () => ({ useCelebrate: () => vi.fn() }));
vi.mock("@/shared/components/spatial-campus/CampusObjectSource", () => ({
  CampusObjectSource: () => null,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/community"]}>
      <FanCafePanel scope="all" targetLabel="통합" />
    </MemoryRouter>,
  );
}

describe("FanCafePanel outage states", () => {
  it("shows a load failure without claiming there are no posts", async () => {
    mocks.get.mockRejectedValueOnce(new Error("unavailable"));

    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("현재 글이 없다는 뜻은 아닙니다");
    expect(screen.queryByText("아직 팬카페 글이 없습니다.")).toBeNull();
    expect(within(alert).getByRole("button")).toBeTruthy();
  });

  it("shows the true empty state only after a successful empty response", async () => {
    mocks.get.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("첫 대화를 기다리고 있습니다")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

vi.mock("./fan-cafe-post-card", () => ({ default: ({ post }: { post: { title: string } }) => <article>{post.title}</article> }));
const cachedPost = { id: "cached", title: "이미 읽던 대화", tags: ["구도"], createdAt: "2026-09-28T00:00:00.000Z", replyCount: 0 };
describe("목록 복구와 필터 유지", () => {
  it("새로고침 실패가 마지막 대화를 숨기지 않는다", async () => {
    mocks.get.mockResolvedValueOnce({ items: [cachedPost], hasMore: false, nextCursor: null });
    renderPanel();
    await screen.findByText(cachedPost.title);
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await screen.findByText("최신 글을 확인하지 못해 마지막으로 불러온 목록을 표시합니다.");
    expect(screen.getByText(cachedPost.title)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("태그 검색 결과가 비어도 선택을 유지하고 초기화할 수 있다", async () => {
    mocks.get.mockResolvedValueOnce({ items: [cachedPost], hasMore: false, nextCursor: null });
    renderPanel();
    const tag = await screen.findByRole("button", { name: "#구도" });
    mocks.get.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });
    fireEvent.click(tag);
    await screen.findByText("검색 조건에 맞는 글이 없습니다.");
    const url = new URL(String(mocks.get.mock.calls.at(-1)?.[0]), "https://local.invalid");
    expect(url.searchParams.get("tag")).toBe("구도");
    mocks.get.mockResolvedValueOnce({ items: [cachedPost], hasMore: false, nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
    await screen.findByText(cachedPost.title);
    expect(new URL(String(mocks.get.mock.calls.at(-1)?.[0]), "https://local.invalid").searchParams.has("tag")).toBe(false);
  });
});

it("바뀐 필터 요청이 실패하면 이전 조건의 글을 결과처럼 표시하지 않는다", async () => {
  mocks.get.mockResolvedValueOnce({ items: [cachedPost], hasMore: false, nextCursor: null });
  renderPanel();
  const tag = await screen.findByRole("button", { name: "#구도" });
  mocks.get.mockRejectedValueOnce(new Error("필터 조회 실패"));
  fireEvent.click(tag);
  await screen.findByRole("alert");
  expect(screen.queryByText(cachedPost.title)).toBeNull();
});
