/**
 * 에셋 포인트 지갑 페이지 테스트 — 게스트 로그인 유도, 로그인 보너스 자동 적립,
 * 잔액·내역 표시를 검증한다.
 */

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetPointsWalletPage } from "./AssetPointsWalletPage";
import { useAssetPointsStore } from "./asset-points-store";
import { awardCutsClipPublished } from "./asset-points-triggers";

const authState = vi.hoisted(() => ({ userId: null as string | null }));
const requestAuthModalOpen = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: authState.userId }),
}));

vi.mock("@/shared/lib/i18n-core", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen,
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AssetPointsWalletPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.userId = null;
  requestAuthModalOpen.mockClear();
  useAssetPointsStore.getState().resetForTests();
});

describe("게스트", () => {
  it("잔액 대신 로그인 유도를 보여주고, 누르면 로그인 모달을 요청한다", () => {
    renderPage();
    expect(screen.getByText("포인트 지갑")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하기" }));
    expect(requestAuthModalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: "asset-points-wallet", mode: "login" }),
    );
    expect(useAssetPointsStore.getState().events).toHaveLength(0);
  });
});

describe("로그인 사용자", () => {
  it("첫 방문에 로그인 보너스가 자동 적립되고 잔액·내역에 보인다", () => {
    authState.userId = "user-1";
    renderPage();
    expect(screen.getByText(/로그인 보너스 \+10P/)).toBeTruthy();
    // 적립 안내 카드와 내역 목록 양쪽에 라벨이 보인다.
    expect(screen.getAllByText("하루 첫 로그인 보너스")).toHaveLength(2);
    expect(useAssetPointsStore.getState().events).toHaveLength(1);
  });

  it("구매 내역과 포인트로 산 에셋 수가 보인다", () => {
    authState.userId = "user-1";
    awardCutsClipPublished("clip-1");
    const spent = useAssetPointsStore.getState().spendForResource({
      resourceId: "res-1",
      resourceName: "수채화 브러시 팩",
      pointPrice: 30,
    });
    expect(spent.ok).toBe(true);

    renderPage();
    expect(screen.getByText(/에셋 구매 · 수채화 브러시 팩/)).toBeTruthy();
    expect(screen.getByText("포인트로 산 에셋")).toBeTruthy();
  });
});
