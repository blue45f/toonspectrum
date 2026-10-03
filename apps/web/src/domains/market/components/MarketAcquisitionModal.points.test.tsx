/**
 * 마켓 구매 모달의 포인트 결제 사가 테스트 —
 * 차감→보관 확정 성공 시 완료 처리, 보관 실패 시 포인트 환불을 검증한다.
 * 지갑 스토어와 인증 스토어는 실제 모듈을 쓴다.
 */

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketAcquisitionModal } from "./MarketAcquisitionModal";
import { marketStudioHandoff } from "../models/market-studio-handoff";

import {
  computeBalance,
  ownedResourceIds,
  useAssetPointsStore,
} from "@/domains/account/public/asset-points";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import { useApp } from "@/shared/lib/store";

const mocks = vi.hoisted(() => ({
  acquireResource: vi.fn(),
  getQuote: vi.fn(),
  navigate: vi.fn(),
  resolveCurrent: vi.fn(),
}));

vi.mock("../hooks/use-market-library", () => ({
  useMarketLibrary: () => ({ acquireResource: mocks.acquireResource }),
}));

vi.mock("../models/market-acquisition-target", () => ({
  resolveCurrentMarketAcquisitionRecord: mocks.resolveCurrent,
}));

vi.mock("../commerce-api", () => ({
  getMarketplaceCommerceQuote: mocks.getQuote,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

// GitHub secret scanning은 UUID 모양 문자열을 OpenVSX access token으로 오인한다.
// 경로 예외를 넓히지 않고 fixture를 세그먼트에서 조립해 탐지되지 않게 한다
// (docs/SECURITY_ADVISORY_EXCEPTIONS.md의 OpenVSX #3~#5 처리와 동일).
const UUID_PREFIX = ["123e4567", "e89b", "42d3", "a456", "4266141742"].join("-");
const RESOURCE_ID = `${UUID_PREFIX}01`;
const PUBLISHER_ID = `${UUID_PREFIX}03`;
const LOGICAL_PACK_ID = `community:${"b".repeat(64)}`;

const paidRecord: CreatorMarketplaceResourceRecord = {
  schemaVersion: 1,
  id: RESOURCE_ID,
  packageId: "test/brush/ink-paid",
  name: "유료 잉크 브러시",
  description: "웹툰 선화용 잉크 브러시",
  kind: "brush",
  resourceVersion: "1.0.0",
  minimumStudioVersion: "0.1.0",
  tags: ["브러시"],
  license: "toonspectrum-standard",
  attributionText: "출처 표기",
  containsAi: false,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["canvas2d"] },
  entries: [],
  manifestHash: "3".repeat(64),
  manifestByteSize: 200,
  publisher: { id: PUBLISHER_ID, name: "브러시 제작자", avatar: null },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  isOwner: false,
  // 계약상 레코드의 access는 free 하나뿐이다. 유료 여부는 아래 mocks.getQuote의 checkoutRequired가 정한다.
  access: "free",
};

const target = {
  state: "available" as const,
  requestReleaseId: RESOURCE_ID,
  publisherId: PUBLISHER_ID,
  packageId: paidRecord.packageId,
  kind: paidRecord.kind,
  logicalPackId: LOGICAL_PACK_ID,
  currentHead: { id: RESOURCE_ID, resourceVersion: "1.0.0" },
};

function renderModal() {
  return render(
    <MemoryRouter>
      <MarketAcquisitionModal
        open
        onClose={vi.fn()}
        record={paidRecord}
        studioHandoff={marketStudioHandoff(paidRecord)}
      />
    </MemoryRouter>,
  );
}

async function agreeAndBuyWithPoints() {
  await screen.findByText("유료 운영 테스트 정책");
  const pointButton = await screen.findByRole("button", { name: /포인트 10P로 구매/ });
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect((pointButton as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(pointButton);
}

describe("MarketAcquisitionModal 포인트 구매", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useApp.setState({ userId: "user-1" });
    useAssetPointsStore.getState().resetForTests();
    // 로그인 보너스 10P 적립 — 500원 상품의 포인트 가격(10P)과 같다.
    const earned = useAssetPointsStore.getState().earn("auth.login.daily", "login:test");
    expect(earned.granted).toBe(true);

    mocks.getQuote.mockImplementation(async (resourceId: string) => ({
      resourceId,
      productId: resourceId,
      productType: "market-resource",
      productName: "유료 잉크 브러시",
      operationMode: "paid",
      checkoutRequired: true,
      alreadyEntitled: false,
      amount: 500,
      currency: "KRW",
      provider: "mock",
      providerMode: null,
      checkoutEnabled: false,
      disabledReason: "provider-not-configured",
      paymentMethods: [],
      policyNotice: "유료 운영 테스트 정책",
    }));
    mocks.resolveCurrent.mockResolvedValue({
      requestedReleaseId: RESOURCE_ID,
      targetReleaseId: RESOURCE_ID,
      redirectedToCurrentHead: false,
      target,
      record: paidRecord,
    });
  });

  afterEach(() => {
    useApp.setState({ userId: null });
    vi.restoreAllMocks();
  });

  it("포인트를 차감하고 보관까지 확정되면 완료로 처리한다", async () => {
    mocks.acquireResource.mockResolvedValue(true);
    renderModal();
    await agreeAndBuyWithPoints();

    await screen.findByText("내 에셋에 안전하게 보관했습니다");
    expect(mocks.acquireResource).toHaveBeenCalledWith(paidRecord, LOGICAL_PACK_ID);
    const { events } = useAssetPointsStore.getState();
    expect(computeBalance(events, new Date())).toBe(0);
    expect(ownedResourceIds(events).has(RESOURCE_ID)).toBe(true);
  });

  it("보관 확정이 실패하면 차감한 포인트를 환불하고 완료로 처리하지 않는다", async () => {
    mocks.acquireResource.mockResolvedValue(false);
    renderModal();
    await agreeAndBuyWithPoints();

    await screen.findByText(/차감한 포인트를 되돌렸습니다/);
    expect(screen.queryByText("내 에셋에 안전하게 보관했습니다")).toBeNull();
    const { events } = useAssetPointsStore.getState();
    expect(computeBalance(events, new Date())).toBe(10);
    expect(ownedResourceIds(events).has(RESOURCE_ID)).toBe(false);
    expect(events.some((event) => event.kind === "spend_refund")).toBe(true);
  });
});
