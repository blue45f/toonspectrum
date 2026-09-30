// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateChallengesPage } from "../CreateChallengesPage";

import type { ChallengeSummary } from "@/platform/creator-client";

const creatorClient = vi.hoisted(() => ({
  listChallenges: vi.fn(),
  getChallenge: vi.fn(),
}));

vi.mock("@/platform/creator-client", () => ({
  ...creatorClient,
  challengeDday: () => 5,
}));

vi.mock("@toonstudio/core/fx", () => ({ useFx: () => ({ sfx: vi.fn(), burstAt: vi.fn() }) }));
vi.mock("@/shared/components/shimmer-title", () => ({
  ShimmerTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/components/reveal-on-scroll", () => ({
  RevealOnScroll: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/shared/components/count-up", () => ({
  CountUp: ({ value }: { value: number }) => <span>{value}</span>,
}));

const ONGOING: ChallengeSummary = {
  id: "c1",
  slug: "autumn",
  title: "가을밤 산책",
  theme: "가을밤 거리를 한 컷으로",
  startsAt: null,
  endsAt: "2026-10-05T00:00:00.000Z",
  state: "ongoing",
  entries: 0,
  createdAt: "2026-09-20T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/showcase/challenges"]}>
      <CreateChallengesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  creatorClient.listChallenges.mockResolvedValue([ONGOING]);
  creatorClient.getChallenge.mockResolvedValue({ ...ONGOING, works: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateChallengesPage", () => {
  it("참여 방법 3단계와 갤러리로 돌아가는 길을 보여 준다", async () => {
    renderPage();
    const steps = screen.getByRole("list", { name: "챌린지 참여 방법" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "창작 갤러리" })[0]?.getAttribute("href")).toBe("/showcase");
    expect(await screen.findByRole("button", { name: /가을밤 산책/u })).toBeTruthy();
  });

  it("참여작이 없으면 스튜디오 참여 행동을 함께 안내한다", async () => {
    renderPage();
    expect(await screen.findByText("아직 참여작이 없습니다.")).toBeTruthy();
    const joinLinks = screen.getAllByRole("link", { name: "스튜디오에서 참여하기" });
    expect(joinLinks.every((link) => link.getAttribute("href") === "/studio?challengeId=c1")).toBe(true);
  });

  it("참여작 불러오기 실패를 ‘참여작 없음’으로 오표시하지 않고 재시도를 제공한다", async () => {
    creatorClient.getChallenge.mockRejectedValueOnce(new Error("일시적으로 사용할 수 없습니다."));
    renderPage();
    expect(await screen.findByText("참여작을 잠시 불러올 수 없어요")).toBeTruthy();
    expect(screen.queryByText("아직 참여작이 없습니다.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("아직 참여작이 없습니다.")).toBeTruthy();
    expect(creatorClient.getChallenge).toHaveBeenCalledTimes(2);
  });

  it("챌린지 목록을 불러오지 못하면 다음 행동과 함께 연결 상태를 알린다", async () => {
    creatorClient.listChallenges.mockRejectedValueOnce(new Error("offline"));
    renderPage();
    const title = await screen.findByText("챌린지를 잠시 불러올 수 없어요");
    const panel = title.closest("[data-slot='showcase-unavailable']") as HTMLElement;
    expect(within(panel).getByRole("link", { name: "웹툰 그리기" }).getAttribute("href")).toBe("/studio");
    expect(within(panel).getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});
