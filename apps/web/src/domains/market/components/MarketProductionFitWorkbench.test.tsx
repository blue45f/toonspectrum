// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketProductionProfile } from "../hooks/use-market-production-profile";
import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  mergeMarketProductionProfile,
} from "../models/market-production-fit";

import { MarketProductionFitWorkbench } from "./MarketProductionFitWorkbench";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

vi.mock("../hooks/use-market-production-profile", () => ({
  useMarketProductionProfile: vi.fn(),
}));

const useProfile = vi.mocked(useMarketProductionProfile);

function record(): CreatorMarketplaceResourceRecord {
  return {
    schemaVersion: 1,
    packageId: "original/palette/noir-blossom",
    name: "느와르 블라썸 팔레트",
    description: "밤의 도시 무드 팔레트",
    kind: "palette",
    resourceVersion: "1.1.0",
    minimumStudioVersion: "1.0.0",
    tags: ["야경", "느와르"],
    license: "cc-by-4.0",
    attributionText: "© 테스트 작가",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: "palette/noir-blossom",
      kind: "palette",
      name: "느와르 블라썸",
      delivery: {
        mode: "builtin-ref",
        runtimeRef: "studio-palette:noir-blossom",
        byteSize: 0,
        sha256: "a".repeat(64),
      },
    }],
    id: "123e4567-e89b-42d3-a456-426614174000",
    manifestHash: "b".repeat(64),
    manifestByteSize: 256,
    publisher: { id: "author-1", name: "테스트 작가", avatar: null },
    createdAt: "2026-07-27T01:00:00.000Z",
    updatedAt: "2026-08-01T01:00:00.000Z",
    isOwner: false,
    access: "free",
  } as CreatorMarketplaceResourceRecord;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MarketProductionFitWorkbench", () => {
  it("shows manifest evidence, counts and the boundary of the preflight", () => {
    useProfile.mockReturnValue({
      profile: mergeMarketProductionProfile(DEFAULT_MARKET_PRODUCTION_PROFILE, {
        studioVersion: "1.4.0",
      }),
      hydrated: true,
      persistenceAvailable: true,
      updateProfile: vi.fn(),
      replaceProfile: vi.fn(),
      resetProfile: vi.fn(),
    });

    render(
      <MemoryRouter>
        <MarketProductionFitWorkbench record={record()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "제작 적합성 패스포트" })).toBeTruthy();
    expect(screen.getByText("제작 조건 일치")).toBeTruthy();
    expect(screen.getByText("충족 7")).toBeTruthy();
    expect(screen.getByText(/구매 완료, 설치 성공, 실제 기기 성능 또는 법률 자문을 의미하지 않습니다/))
      .toBeTruthy();
    expect(screen.getByRole("link", { name: "전체 마켓을 제작 조건으로 정렬" })
      .getAttribute("href")).toBe("/market/fit");
    expect(screen.getByRole("link", { name: /사용권 원문/ }).getAttribute("rel"))
      .toContain("noopener");
  });
});
