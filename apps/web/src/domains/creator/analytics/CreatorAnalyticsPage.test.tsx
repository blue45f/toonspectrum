// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatorAnalyticsPage } from "./CreatorAnalyticsPage";

// API 미배선(404) 상황을 시뮬레이션 — 클라이언트 목 데이터 폴백 경로를 탄다.
vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({
    data: null,
    loading: false,
    error: null,
    notFound: true,
    reload: vi.fn(),
  }),
  NotFoundError: class NotFoundError extends Error {},
}));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) =>
    selector({ lang: "ko" }),
  useT:
    () =>
    (key: string, fallbackOrValues?: string | Record<string, string | number>) =>
      typeof fallbackOrValues === "string" ? fallbackOrValues : key,
}));

afterEach(cleanup);

describe("CreatorAnalyticsPage", () => {
  it("KPI 카드 4종을 렌더한다", () => {
    render(<CreatorAnalyticsPage />);
    // "조회수" 등은 회차 테이블 컬럼 헤더에도 쓰이므로 getAllByText로 확인
    for (const label of ["조회수", "좋아요", "댓글", "구독 전환율"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("이탈 지점 콜아웃에 7화를 강조한다", () => {
    render(<CreatorAnalyticsPage />);
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("이탈 지점");
    // "7화에서 독자가 떨어졌어요 · -X%" — 텍스트가 여러 엘리먼트에 나뉘어 있으므로 textContent로 확인
    expect(note.textContent).toContain("7화");
    expect(note.textContent).toContain("에서 독자가 떨어졌어요");
  });

  it("리텐션 곡선과 유입 경로·회차 테이블을 렌더한다", () => {
    render(<CreatorAnalyticsPage />);
    expect(screen.getByText("회차별 리텐션 곡선")).toBeTruthy();
    expect(screen.getByText("유입 경로")).toBeTruthy();
    expect(screen.getByText("회차별 성과")).toBeTruthy();
    // 이탈 지점 행 강조 배지
    expect(screen.getAllByText("이탈").length).toBeGreaterThan(0);
  });

  it("기간 선택(7일/30일/90일)이 동작한다", () => {
    render(<CreatorAnalyticsPage />);
    const button7 = screen.getByRole("radio", { name: "7일" });
    expect(button7.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(button7);
    expect(
      screen.getByRole("radio", { name: "7일" }).getAttribute("aria-checked")
    ).toBe("true");
    // 기간이 바뀌어도 대시보드 구조는 유지된다
    expect(screen.getByText("회차별 리텐션 곡선")).toBeTruthy();
  });

  it("목업 데이터 배지를 표시한다", () => {
    render(<CreatorAnalyticsPage />);
    expect(screen.getByText("목업 데이터")).toBeTruthy();
  });
});
