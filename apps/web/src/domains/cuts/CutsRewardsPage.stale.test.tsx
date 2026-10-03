/**
 * 컷츠 리워드 — 재조회 실패 시 낡은 정산을 신선한 것처럼 두지 않는지 검증.
 */

// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CutsRewardsPage } from "./CutsRewardsPage";
import { useCutsStore } from "./cuts-store";

const apiControl = vi.hoisted(() => ({ shouldFail: false }));

vi.mock("./cuts-rewards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cuts-rewards")>();
  const period = { id: "2026-10", status: "open" as const, poolKrw: 100_000 };
  return {
    ...actual,
    createLocalCutsRewardsApi: () => ({
      listPeriods: async () => {
        if (apiControl.shouldFail) throw new Error("refresh failed");
        return [period];
      },
      getSettlement: async () => ({
        period,
        entries: [],
        totalQualifiedViews: 0,
        unallocatedKrw: 0,
      }),
    }),
  };
});

beforeEach(() => {
  apiControl.shouldFail = false;
  window.localStorage.clear();
  useCutsStore.getState().resetForTests();
});

afterEach(() => {
  cleanup();
});

describe("CutsRewardsPage 재조회 실패", () => {
  it("이미 정산이 보이는 상태에서 재조회가 실패하면 낡은 표시와 함께 오류를 알린다", async () => {
    render(
      <MemoryRouter initialEntries={["/cuts/rewards"]}>
        <CutsRewardsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("정산 요약")).toBeTruthy();

    apiControl.shouldFail = true;
    // 스토어가 바뀌면 어댑터가 재생성돼 재조회가 일어난다.
    act(() => {
      useCutsStore.setState((state) => ({ viewEvents: [...state.viewEvents] }));
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/이전에 계산한 정산을 그대로 보여주고 있어요/)).toBeTruthy();
    // 낡은 요약은 유지된다 (빈 오류 화면으로 교체하지 않는다).
    expect(screen.getByLabelText("정산 요약")).toBeTruthy();
  });
});
