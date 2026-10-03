// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSupporterPayments } from "./AdminSupporterPayments";

const api = vi.hoisted(
  () =>
    vi.fn<
      (path: string, uid: string, options?: RequestInit) => Promise<unknown>
    >(),
);
vi.mock("./admin-client", async (original) => ({
  ...(await original<typeof import("./admin-client")>()),
  adminFetch: api,
}));

const settings = {
  id: "settings-1",
  monthlyGoalAmount: 500_000,
  publicWallEnabled: true,
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const emptyList = {
  items: [],
  total: 0,
  summary: { totalAmount: 0, doneCount: 0, waitingCount: 0, canceledCount: 0 },
};

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminSupporterPayments 상태 표면 정합", () => {
  it("목록 로드 실패 시 오류 배너만 남고 로딩 스피너가 함께 주장하지 않는다", async () => {
    api.mockImplementation((path) =>
      path.endsWith("/settings")
        ? Promise.resolve(settings)
        : Promise.reject(new Error("목록을 불러오지 못했습니다.")),
    );
    render(<AdminSupporterPayments uid="admin" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("목록을 불러오지 못했습니다.");
    // AdminSpinner(role=status, aria-label 불러오는 중)가 실패 화면에 남으면 안 된다.
    expect(screen.queryByRole("status", { name: "불러오는 중" })).toBeNull();
  });

  it("설정 로드 실패 시 입력이 잠기고 설정 섹션의 재시도가 설정만 다시 불러온다", async () => {
    let settingsCalls = 0;
    api.mockImplementation((path) => {
      if (path.endsWith("/settings")) {
        settingsCalls += 1;
        return settingsCalls === 1
          ? Promise.reject(new Error("설정을 불러오지 못했습니다."))
          : Promise.resolve(settings);
      }
      return Promise.resolve(emptyList);
    });
    render(<AdminSupporterPayments uid="admin" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("설정을 불러오지 못했습니다.");
    const saveButton = screen.getByRole("button", { name: /설정 저장/ });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText(/현재 목표 ₩500,000/)).toBeTruthy();
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    expect(settingsCalls).toBe(2);
  });

  it("목록 로딩 중에는 요약 수치를 실제 0으로 표시하지 않는다", async () => {
    const pending = Promise.withResolvers<unknown>();
    api.mockImplementation((path) =>
      path.endsWith("/settings") ? Promise.resolve(settings) : pending.promise,
    );
    render(<AdminSupporterPayments uid="admin" />);
    expect(await screen.findByText(/현재 목표 ₩500,000/)).toBeTruthy();
    expect(screen.queryByText("₩0")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("조회 중…")).toBeTruthy();
  });
});
