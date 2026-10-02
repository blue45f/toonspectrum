/**
 * 마켓 포인트 구매 옵션 테스트 — 게스트 로그인 유도, 잔액 부족 안내,
 * 잔액 충분 시 구매 버튼, 이미 구매한 에셋 표시를 검증한다.
 * 지갑 스토어는 실제 모듈을 쓰고 매 테스트마다 초기화한다.
 */

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketPointPurchaseOption } from "./MarketPointPurchaseOption";
import { useAssetPointsStore } from "@/domains/account/asset-points";

const authState = vi.hoisted(() => ({ userId: null as string | null }));
const requestAuthModalOpen = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: authState.userId }),
}));

vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen,
}));

const RESOURCE_ID = "123e4567-e89b-42d3-a456-426614174101";

function renderOption(overrides: Partial<{
  agreed: boolean;
  submitting: boolean;
  onPurchase: () => void;
}> = {}) {
  return render(
    <MemoryRouter>
      <MarketPointPurchaseOption
        resourceId={RESOURCE_ID}
        resourceName="잉크 브러시"
        krwAmount={500}
        agreed={overrides.agreed ?? true}
        submitting={overrides.submitting ?? false}
        onPurchase={overrides.onPurchase ?? (() => {})}
      />
    </MemoryRouter>,
  );
}

function earnLoginBonus() {
  const result = useAssetPointsStore.getState().earn("auth.login.daily", "login:test");
  expect(result.granted).toBe(true);
}

beforeEach(() => {
  authState.userId = null;
  requestAuthModalOpen.mockClear();
  useAssetPointsStore.getState().resetForTests();
});

describe("MarketPointPurchaseOption", () => {
  it("게스트에게는 로그인 유도를 보여주고, 누르면 로그인 모달을 요청한다", () => {
    renderOption();
    expect(screen.getByText(/포인트 지갑은 로그인 후 이용할 수 있어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하고 포인트 쓰기" }));
    expect(requestAuthModalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: "market-point-purchase", mode: "login" }),
    );
  });

  it("잔액이 부족하면 부족분과 적립 방법 링크를 안내한다", () => {
    authState.userId = "user-1";
    renderOption();
    // 500원 → 10P, 잔액 0P
    expect(screen.getByText(/포인트가 10P 부족해요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "적립 방법 보기" }).getAttribute("href")).toBe(
      "/account/points",
    );
    expect(screen.queryByRole("button", { name: /포인트 .*P로 구매/ })).toBeNull();
  });

  it("잔액이 충분하면 구매 버튼을 보여주고, 동의 전에는 비활성화한다", () => {
    authState.userId = "user-1";
    earnLoginBonus(); // +10P
    const onPurchase = vi.fn();
    const { rerender } = renderOption({ agreed: false, onPurchase });
    const button = screen.getByRole("button", { name: /포인트 10P로 구매/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <MemoryRouter>
        <MarketPointPurchaseOption
          resourceId={RESOURCE_ID}
          resourceName="잉크 브러시"
          krwAmount={500}
          agreed
          submitting={false}
          onPurchase={onPurchase}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /포인트 10P로 구매/ }));
    expect(onPurchase).toHaveBeenCalledTimes(1);
  });

  it("이미 포인트로 산 에셋이면 구매 버튼 대신 보유 안내를 보여준다", () => {
    authState.userId = "user-1";
    earnLoginBonus();
    const spend = useAssetPointsStore.getState().spendForResource({
      resourceId: RESOURCE_ID,
      resourceName: "잉크 브러시",
      pointPrice: 10,
    });
    expect(spend.ok).toBe(true);
    renderOption();
    expect(screen.getByText(/이미 포인트로 구매한 에셋이에요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /포인트 .*P로 구매/ })).toBeNull();
  });
});
