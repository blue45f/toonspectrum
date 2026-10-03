/**
 * 컷츠 리워드 — 정산 조회 중에는 공용 로딩 표면이 뜨는지 검증.
 * 수제 스켈레톤으로 되돌아가면 이 테스트가 깨진다.
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
      listPeriods: () => new Promise<never>(() => undefined),
      getSettlement: async () => {
        throw new Error("로딩 중에는 호출되지 않는다");
      },
    }),
  };
});

afterEach(() => {
  cleanup();
});

describe("CutsRewardsPage 로딩", () => {
  it("조회가 끝나기 전에는 공용 로딩 표면(카드 스켈레톤)을 보여준다", () => {
    render(
      <MemoryRouter initialEntries={["/cuts/rewards"]}>
        <CutsRewardsPage />
      </MemoryRouter>,
    );
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("정산을 계산하는 중이에요");
    expect(document.querySelector('[data-slot="loading-state"]')).toBeTruthy();
  });
});
