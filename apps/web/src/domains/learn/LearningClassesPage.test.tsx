// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LearnPage } from "./LearnPage";
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

describe("유료 클래스 페이지", () => {
  it("클래스 가격과 커리큘럼, 연결 강좌 진도를 보여준다", () => {
    renderClasses();
    expect(screen.getByRole("heading", { name: /완성까지 가는 클래스/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "첫 회차 완성 마스터클래스" })).toBeTruthy();
    expect(screen.getByText("99,000원")).toBeTruthy();
    expect(screen.getByText("159,000원")).toBeTruthy();
    expect(screen.getByText(/38% 할인 예정가/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /한 문장에서 세 컷의 이야기로/u }).getAttribute("href")).toBe("/learn/lessons/story-board");
    expect(screen.getAllByText(/연결 강좌 0\/5 완료/u)).toHaveLength(2);
    expect(screen.getByText(/결제 오픈 전, 사전 신청 기간/u)).toBeTruthy();
  });

  it("게스트가 신청하면 계정 게이트가 막고 신청은 접수되지 않는다", () => {
    mocks.ensureAccount.mockReturnValue(false);
    renderClasses();
    fireEvent.click(screen.getAllByRole("button", { name: "수강 신청하기" })[0]);
    expect(mocks.ensureAccount).toHaveBeenCalledWith("payment");
    expect(screen.queryByRole("button", { name: "사전 신청 확정" })).toBeNull();
    expect(window.localStorage.getItem(CLASS_ENROLLMENT_STORAGE_KEY)).toBeNull();
  });

  it("로그인 사용자는 확인 단계를 거쳐 사전 신청하고 취소할 수 있다", async () => {
    mocks.session.data = { user: { id: "user-1" } };
    mocks.session.status = "authenticated";
    renderClasses();

    fireEvent.click(screen.getAllByRole("button", { name: "수강 신청하기" })[0]);
    expect(screen.getByText(/지금은 어떤 금액도 청구되지 않습니다/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "사전 신청 확정" }));

    expect(await screen.findByText(/사전 신청 완료/u)).toBeTruthy();
    const stored = JSON.parse(window.localStorage.getItem(CLASS_ENROLLMENT_STORAGE_KEY) ?? "{}") as {
      enrollments?: Record<string, { status: string }>;
    };
    expect(stored.enrollments?.["first-episode-masterclass"]?.status).toBe("applied");
    expect(screen.getByText(/내 사전 신청 1건/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "신청 취소" }));
    expect(screen.queryByText(/사전 신청 완료/u)).toBeNull();
    const after = JSON.parse(window.localStorage.getItem(CLASS_ENROLLMENT_STORAGE_KEY) ?? "{}") as {
      enrollments?: Record<string, { status: string }>;
    };
    expect(after.enrollments?.["first-episode-masterclass"]?.status).toBe("cancelled");
  });
});
