// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LearnPage } from "./LearnPage";
import { ASSET_POINTS_STORAGE_KEY, type PointLedgerEvent } from "./learning-class-points";
import { CLASS_ENROLLMENT_STORAGE_KEY } from "./learning-classes";

const mocks = vi.hoisted(() => ({
  ensureAccount: vi.fn((_action: string) => true),
  session: {
    data: null as null | { user: { id: string } },
    status: "unauthenticated",
  },
}));

vi.mock("@/domains/auth/public/account-gate", () => ({
  useAccountGate: () => ({ ensureAccount: mocks.ensureAccount }),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({
    data: mocks.session.data,
    status: mocks.session.status,
    ready: true,
    update: async () => null,
  }),
}));

function renderClasses() {
  return render(
    <MemoryRouter initialEntries={["/learn/classes"]}>
      <Routes>
        <Route path="/learn/*" element={<LearnPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function login() {
  mocks.session.data = { user: { id: "user-1" } };
  mocks.session.status = "authenticated";
}

/** M-4 지갑 스토어와 같은 봉투로 포인트를 심는다. */
function seedPoints(amount: number) {
  const now = new Date();
  const events: PointLedgerEvent[] = [
    {
      id: "ape_000001",
      kind: "earn",
      amount,
      activityKey: "cuts.clip.published",
      sourceRef: "seed",
      occurredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
  window.localStorage.setItem(
    ASSET_POINTS_STORAGE_KEY,
    JSON.stringify({ state: { events, nextSeq: 2 }, version: 0 }),
  );
}

function storedPointEvents(): PointLedgerEvent[] {
  const raw = window.localStorage.getItem(ASSET_POINTS_STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { state?: { events?: PointLedgerEvent[] } };
  return parsed.state?.events ?? [];
}

function storedEnrollments(): Record<string, { status: string; pointPricePaid?: number }> {
  const raw = window.localStorage.getItem(CLASS_ENROLLMENT_STORAGE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { enrollments?: Record<string, { status: string }> };
  return parsed.enrollments ?? {};
}

beforeEach(() => {
  mocks.ensureAccount.mockReset();
  mocks.ensureAccount.mockReturnValue(true);
  mocks.session.data = null;
  mocks.session.status = "unauthenticated";
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("클래스 페이지", () => {
  it("포인트 가격과 무료 클래스, 커리큘럼과 연결 강좌 진도를 보여준다", () => {
    renderClasses();
    expect(screen.getByRole("heading", { name: /완성까지 가는 클래스/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "첫 회차 완성 마스터클래스" })).toBeTruthy();
    expect(screen.getByText("990P")).toBeTruthy();
    expect(screen.getByText("활동 포인트로 등록")).toBeTruthy();
    expect(screen.getByText("무료")).toBeTruthy();
    expect(screen.getByText("포인트 없이 바로 등록")).toBeTruthy();
    expect(screen.queryByText(/99,000원/u)).toBeNull();
    expect(screen.queryByText(/사전 신청/u)).toBeNull();
    expect(screen.queryByText(/청구/u)).toBeNull();
    expect(screen.getByText(/포인트는 활동으로 모아요/u)).toBeTruthy();
    expect(screen.getByText(/내 포인트/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /한 문장에서 세 컷의 이야기로/u }).getAttribute("href")).toBe("/learn/lessons/story-board");
    expect(screen.getAllByText(/연결 강좌 0\/5 완료/u)).toHaveLength(2);
  });

  it("게스트가 등록하면 일반 계정 게이트가 막고 등록·차감은 일어나지 않는다", () => {
    mocks.ensureAccount.mockReturnValue(false);
    seedPoints(2_000);
    renderClasses();
    fireEvent.click(screen.getAllByRole("button", { name: "수강 등록하기" })[0]);
    expect(mocks.ensureAccount).toHaveBeenCalledWith("save");
    expect(mocks.ensureAccount).not.toHaveBeenCalledWith("payment");
    expect(screen.queryByRole("button", { name: "포인트 사용하고 등록" })).toBeNull();
    expect(window.localStorage.getItem(CLASS_ENROLLMENT_STORAGE_KEY)).toBeNull();
    expect(storedPointEvents().filter((event) => event.kind === "spend")).toHaveLength(0);
  });

  it("포인트가 부족하면 차감 없이 부족분과 포인트 모으는 법을 안내한다", () => {
    login();
    seedPoints(100);
    renderClasses();
    fireEvent.click(screen.getAllByRole("button", { name: "수강 등록하기" })[0]);

    const guide = screen.getByRole("group", { name: /포인트 부족 안내/u });
    expect(guide.textContent).toContain("890P");
    expect(guide.textContent).toContain("990P");
    expect(guide.textContent).toContain("100P");
    expect(guide.textContent).toContain("하루 첫 로그인 10P");
    expect(guide.textContent).toContain("현금으로 살 수 없");
    expect(storedEnrollments()["first-episode-masterclass"]).toBeUndefined();
    expect(storedPointEvents().filter((event) => event.kind === "spend")).toHaveLength(0);
  });

  it("포인트가 충분하면 확인 단계를 거쳐 차감하고 등록하며, 취소하면 환불된다", async () => {
    login();
    seedPoints(2_000);
    renderClasses();

    fireEvent.click(screen.getAllByRole("button", { name: "수강 등록하기" })[0]);
    const confirm = screen.getByRole("group", { name: /등록 확인/u });
    expect(confirm.textContent).toContain("2,000P");
    expect(confirm.textContent).toContain("1,010P");
    fireEvent.click(screen.getByRole("button", { name: "포인트 사용하고 등록" }));

    expect(await screen.findByText(/수강 중/u)).toBeTruthy();
    expect(screen.getByText(/990P를 사용해 수강 등록이 완료됐습니다/u)).toBeTruthy();
    expect(storedEnrollments()["first-episode-masterclass"]?.status).toBe("enrolled");
    expect(storedEnrollments()["first-episode-masterclass"]?.pointPricePaid).toBe(990);
    const spends = storedPointEvents().filter((event) => event.kind === "spend");
    expect(spends).toHaveLength(1);
    expect(spends[0].resourceId).toBe("class:first-episode-masterclass");
    expect(screen.getByText(/내 수강 클래스 1건/u)).toBeTruthy();
    expect(screen.getByText("1,010P")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "수강 취소" }));
    expect(await screen.findByText(/수강을 취소하고 990P를 돌려받았습니다/u)).toBeTruthy();
    expect(storedEnrollments()["first-episode-masterclass"]?.status).toBe("cancelled");
    expect(storedPointEvents().filter((event) => event.kind === "spend_refund")).toHaveLength(1);
    expect(screen.getByText("2,000P")).toBeTruthy();
  });

  it("무료 클래스는 확인 단계 없이 바로 등록되고 포인트는 차감되지 않는다", async () => {
    login();
    renderClasses();

    fireEvent.click(screen.getAllByRole("button", { name: "수강 등록하기" })[1]);

    expect(await screen.findByText(/무료로 수강 등록이 완료됐습니다/u)).toBeTruthy();
    expect(storedEnrollments()["visual-finish-class"]?.status).toBe("enrolled");
    expect(storedEnrollments()["visual-finish-class"]?.pointPricePaid).toBe(0);
    expect(storedPointEvents()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "포인트 사용하고 등록" })).toBeNull();
  });
});
