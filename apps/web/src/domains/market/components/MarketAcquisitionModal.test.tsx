// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketAcquisitionModal } from "./MarketAcquisitionModal";
import { marketStudioHandoff, marketStudioResourceHref } from "../models/market-studio-handoff";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

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

const HISTORICAL_ID = "123e4567-e89b-42d3-a456-426614174101";
const CURRENT_ID = "123e4567-e89b-42d3-a456-426614174102";
const PUBLISHER_ID = ["123e4567", "e89b", "42d3", "a456", "426614174103"].join("-");
const LOGICAL_PACK_ID = `community:${"a".repeat(64)}`;

function record(
  id: string,
  version: string,
  license: CreatorMarketplaceResourceRecord["license"],
  attributionText: string,
): CreatorMarketplaceResourceRecord {
  return {
    schemaVersion: 1,
    id,
    packageId: "test/brush/ink",
    name: `잉크 브러시 ${version}`,
    description: "웹툰 선화용 잉크 브러시",
    kind: "brush",
    resourceVersion: version,
    minimumStudioVersion: "0.1.0",
    tags: ["브러시", "잉크"],
    license,
    attributionText,
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [],
    manifestHash: version === "1.0.0" ? "1".repeat(64) : "2".repeat(64),
    manifestByteSize: 200,
    publisher: {
      id: PUBLISHER_ID,
      name: "브러시 제작자",
      avatar: null,
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    isOwner: false,
    access: "free",
  };
}

const historicalRecord = record(
  HISTORICAL_ID,
  "1.0.0",
  "toonspectrum-standard",
  "이전 버전 출처",
);
const currentRecord = record(CURRENT_ID, "2.0.0", "cc0-1.0", "현재 버전 출처");
const target = {
  state: "available" as const,
  requestReleaseId: HISTORICAL_ID,
  publisherId: PUBLISHER_ID,
  packageId: historicalRecord.packageId,
  kind: historicalRecord.kind,
  logicalPackId: LOGICAL_PACK_ID,
  currentHead: {
    id: CURRENT_ID,
    resourceVersion: currentRecord.resourceVersion,
  },
};

async function agreeAndSubmit(buttonName: string | RegExp): Promise<void> {
  fireEvent.click(screen.getByRole("checkbox"));
  const button = screen.getByRole("button", { name: buttonName }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

describe("MarketAcquisitionModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.acquireResource.mockResolvedValue(true);
    mocks.getQuote.mockImplementation(async (resourceId: string) => ({
      resourceId,
      productId: resourceId,
      productType: "market-resource",
      productName: "테스트 에셋",
      operationMode: "free",
      checkoutRequired: false,
      alreadyEntitled: false,
      amount: 0,
      currency: "KRW",
      provider: "mock",
      providerMode: null,
      checkoutEnabled: false,
      disabledReason: null,
      paymentMethods: [],
      policyNotice: "무료 운영 테스트 정책",
    }));
    mocks.resolveCurrent
      .mockResolvedValueOnce({
        requestedReleaseId: HISTORICAL_ID,
        targetReleaseId: CURRENT_ID,
        redirectedToCurrentHead: true,
        target,
        record: currentRecord,
      })
      .mockResolvedValueOnce({
        requestedReleaseId: CURRENT_ID,
        targetReleaseId: CURRENT_ID,
        redirectedToCurrentHead: false,
        target: { ...target, requestReleaseId: CURRENT_ID },
        record: currentRecord,
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires fresh consent for the resolved current release and installs that exact release", async () => {
    const onClose = vi.fn();
    const onAcquiredSuccess = vi.fn();
    render(
      <MarketAcquisitionModal
        open
        onClose={onClose}
        record={historicalRecord}
        studioHandoff={marketStudioHandoff(historicalRecord)}
        onAcquiredSuccess={onAcquiredSuccess}
      />,
    );

    await screen.findByText("무료 운영 테스트 정책");
    await agreeAndSubmit("내 에셋에 추가");

    await screen.findByText(/현재 공개 버전 v2\.0\.0으로 설치 대상이 변경되었습니다/);
    expect(mocks.acquireResource).not.toHaveBeenCalled();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("현재 버전 출처", { exact: false })).toBeTruthy();
    expect(screen.queryByText("이전 버전 출처", { exact: false })).toBeNull();

    await screen.findByText("무료 운영 테스트 정책");
    await agreeAndSubmit(/현재 v2\.0\.0 조건 확인 후 추가/);

    await screen.findByText("내 에셋에 안전하게 보관했습니다");
    expect(mocks.resolveCurrent).toHaveBeenNthCalledWith(
      1,
      historicalRecord,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.resolveCurrent).toHaveBeenNthCalledWith(
      2,
      currentRecord,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.acquireResource).toHaveBeenCalledWith(
      currentRecord,
      LOGICAL_PACK_ID,
    );
    expect(onAcquiredSuccess).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", {
      name: "Studio에서 v2.0.0 설치·확인",
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(
      marketStudioResourceHref(CURRENT_ID),
    );
  });
});
