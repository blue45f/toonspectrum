/**
 * 컷츠 리워드 — 정산 기간이 하나도 없을 때 본문이 비지 않고 빈 상태를 보여주는지 검증.
 */

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CutsRewardsPage } from "./CutsRewardsPage";

vi.mock("./cuts-rewards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cuts-rewards")>();
  return {
    ...actual,
    createLocalCutsRewardsApi: () => ({
      listPeriods: async () => [],
      getSettlement: async () => {
        throw new Error("기간이 없으면 호출되지 않는다");
      },
    }),
  };
});

afterEach(() => {
  cleanup();
});

describe("CutsRewardsPage 빈 기간", () => {
  it("기간이 0개면 요약 대신 빈 상태 안내와 피드 링크를 보여준다", async () => {
    render(
      <MemoryRouter initialEntries={["/cuts/rewards"]}>
        <CutsRewardsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/아직 정산 기간이 열리지 않았어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /피드 보러 가기/ })).toBeTruthy();
    expect(screen.queryByLabelText("정산 요약")).toBeNull();
  });
});
