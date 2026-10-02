/**
 * 컷츠 리워드 펀드 대시보드 테스트 — 로딩 뒤 요약·내역·기간 전환 렌더 검증.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CutsRewardsPage } from "./CutsRewardsPage";
import { useCutsStore } from "./cuts-store";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/cuts/rewards"]}>
      <CutsRewardsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useCutsStore.getState().resetForTests();
});

afterEach(() => {
  cleanup();
});

describe("CutsRewardsPage", () => {
  it("게스트에게는 데모 안내를, 요약에는 예상 정산액을 보여준다", async () => {
    renderPage();
    expect(screen.getByText(/게스트로 데모 정산을 보는 중/)).toBeTruthy();
    const summary = await screen.findByLabelText("정산 요약");
    expect(within(summary).getByText("예상 정산액")).toBeTruthy();
    expect(summary.textContent).toMatch(/[\d,]+원/);
    // 클립별 내역 표에 행이 있다.
    const table = screen.getByRole("table");
    expect(table.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  });

  it("지난 기간을 고르면 확정 정산액으로 바뀐다", async () => {
    renderPage();
    await screen.findByLabelText("정산 요약");
    fireEvent.click(screen.getByRole("button", { name: /2026년 9월/ }));
    await waitFor(() => {
      expect(screen.getByText("확정 정산액")).toBeTruthy();
    });
  });

  it("받는 사람 목록에 팬 리믹스를 만든 팬도 들어 있다", async () => {
    renderPage();
    await screen.findByLabelText("정산 요약");
    const select = screen.getByLabelText(/받는 사람/) as HTMLSelectElement;
    const labels = [...select.options].map((option) => option.textContent ?? "");
    expect(labels.some((label) => label.includes("seed-fan"))).toBe(true);
    expect(labels.some((label) => label.includes("박구름"))).toBe(true);
  });
});
