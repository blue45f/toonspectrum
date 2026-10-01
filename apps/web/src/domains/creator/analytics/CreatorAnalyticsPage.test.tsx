// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorAnalyticsPage } from "./CreatorAnalyticsPage";
import { buildClientMockAnalytics } from "./mock-analytics";

interface MockApiState {
  data: unknown;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  appError: { kind: string } | null;
  stale: boolean;
}

const api = vi.hoisted(() => ({
  state: {
    data: null,
    loading: false,
    error: null,
    notFound: true,
    appError: null,
    stale: false,
  } as MockApiState,
  reload: vi.fn(),
}));

vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ ...api.state, reload: api.reload }),
  NotFoundError: class NotFoundError extends Error {},
}));

const auth = vi.hoisted(() => ({ requestAuthModalOpen: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-modal-intent", () => auth);

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) =>
    selector({ lang: "ko" }),
  useT:
    () =>
    (key: string, fallbackOrValues?: string | Record<string, string | number>) =>
      typeof fallbackOrValues === "string" ? fallbackOrValues : key,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatorAnalyticsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // 기본: API 미배선(404) — 번들 예시 데이터 경로를 탄다.
  api.state = { data: null, loading: false, error: null, notFound: true, appError: null, stale: false };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreatorAnalyticsPage", () => {
  it("KPI 카드 4종을 지표 정의·비교 기준과 함께 렌더한다", () => {
    renderPage();
    for (const label of ["조회수", "좋아요", "댓글", "구독 전환율"]) {
      expect(screen.getByRole("article", { name: label })).toBeTruthy();
    }
    expect(screen.getByText("새 구독자 ÷ 조회수")).toBeTruthy();
    expect(screen.getAllByText("직전 30일 대비").length).toBeGreaterThanOrEqual(4);
  });

  it("예시 데이터는 상단 안내와 카드별 ‘예시’ 표시로 실제 수치와 구분한다", () => {
    renderPage();
    const note = screen.getByRole("note", { name: "예시 데이터 안내" });
    expect(note.textContent).toContain("예시 데이터입니다 · 실제 독자 수치가 아닙니다");
    expect(note.textContent).toContain("실제 집계 서버가 아직 연결되지 않아");
    expect(within(note).getByRole("link", { name: /작품 발행하러 가기/u }).getAttribute("href")).toBe("/studio/publish");
    for (const label of ["조회수", "좋아요", "댓글", "구독 전환율"]) {
      expect(within(screen.getByRole("article", { name: label })).getByText("예시")).toBeTruthy();
    }
    expect(screen.queryByText("목업 데이터")).toBeNull();
  });

  it("이탈 지점 콜아웃에 7화를 강조하고 점검 항목과 다음 행동을 제시한다", () => {
    renderPage();
    const note = screen.getByRole("note", { name: "이탈 지점" });
    expect(note.textContent).toContain("7화");
    expect(note.textContent).toContain("에서 독자가 떨어졌어요");
    expect(note.textContent).toContain("먼저 확인해 보세요");
    expect(within(note).getByRole("link", { name: /스튜디오에서 회차 다듬기/u }).getAttribute("href")).toBe("/studio");
  });

  it("리텐션 곡선과 유입 경로·회차 표, 다음 행동 카드를 렌더한다", () => {
    renderPage();
    expect(screen.getByText("회차별 리텐션 곡선")).toBeTruthy();
    expect(screen.getByText("유입 경로")).toBeTruthy();
    expect(screen.getByRole("table", { name: "회차별 성과" })).toBeTruthy();
    expect(screen.getAllByText("이탈").length).toBeGreaterThan(0);
    const next = screen.getByRole("region", { name: "지표를 보고 이어서 할 일" });
    expect(within(next).getByRole("link", { name: /썸네일·제목 실험/u }).getAttribute("href")).toBe("/studio/growth");
    expect(within(next).getByRole("link", { name: /홍보영상 만들기/u }).getAttribute("href")).toBe("/showcase/promo");
  });

  it("기간 선택은 클릭과 방향키로 바뀌고 기간 범위를 알려 준다", () => {
    renderPage();
    expect(screen.getByText(/최근 30일 ·/u)).toBeTruthy();
    const button7 = screen.getByRole("radio", { name: "7일" });
    expect(button7.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(button7);
    expect(screen.getByRole("radio", { name: "7일" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/최근 7일 ·/u)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("radio", { name: "7일" }), { key: "End" });
    expect(screen.getByRole("radio", { name: "90일" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "90일" }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("radio", { name: "7일" }).getAttribute("tabindex")).toBe("-1");
  });

  it("시리즈는 이름으로 고르고 선택값이 실제 시리즈 id를 따른다", () => {
    renderPage();
    const select = screen.getByLabelText("시리즈") as HTMLSelectElement;
    const series = buildClientMockAnalytics("30d").series;
    expect(select.value).toBe(series[0]?.id);
    expect(select.options).toHaveLength(series.length);
    fireEvent.change(select, { target: { value: series[1]?.id } });
    expect((screen.getByLabelText("시리즈") as HTMLSelectElement).value).toBe(series[1]?.id);
  });

  it("서버 오류에는 예시를 몰래 채우지 않고, 사용자가 고르면 예시와 실제 데이터 재요청을 제공한다", () => {
    api.state = { data: null, loading: false, error: "일시적으로 사용할 수 없습니다.", notFound: false, appError: { kind: "unreachable" }, stale: false };
    renderPage();
    expect(screen.getByText("애널리틱스를 잠시 불러올 수 없어요")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "조회수" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(api.reload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "예시 데이터로 둘러보기" }));
    const note = screen.getByRole("note", { name: "예시 데이터 안내" });
    expect(note.textContent).toContain("연결을 기다리는 동안");
    fireEvent.click(within(note).getByRole("button", { name: "실제 데이터 다시 불러오기" }));
    expect(api.reload).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("note", { name: "예시 데이터 안내" })).toBeNull();
  });

  it("로그인이 필요하면 로그인 안내와 예시 둘러보기를 제공한다", () => {
    api.state = { data: null, loading: false, error: "로그인이 필요합니다.", notFound: false, appError: { kind: "unauthorized" }, stale: false };
    renderPage();
    expect(screen.getByText("로그인하면 내 작품의 지표를 볼 수 있어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하기" }));
    expect(auth.requestAuthModalOpen).toHaveBeenCalledWith(expect.objectContaining({ source: "creator-analytics" }));
  });

  it("실제 집계 데이터에는 예시 표시를 붙이지 않는다", () => {
    api.state = { data: { ...buildClientMockAnalytics("30d"), mock: false }, loading: false, error: null, notFound: false, appError: null, stale: false };
    renderPage();
    expect(screen.queryByRole("note", { name: "예시 데이터 안내" })).toBeNull();
    expect(within(screen.getByRole("article", { name: "조회수" })).queryByText("예시")).toBeNull();
  });
});
