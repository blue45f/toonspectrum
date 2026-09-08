// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketProductionProfile } from "../hooks/use-market-production-profile";
import { useMarketResources } from "../hooks/use-market-resources";
import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  mergeMarketProductionProfile,
} from "../models/market-production-fit";

import { MarketFitLabPage } from "./MarketFitLabPage";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

vi.mock("../hooks/use-market-production-profile", () => ({
  useMarketProductionProfile: vi.fn(),
}));
vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: vi.fn(),
}));
vi.mock("../components/MarketNavHeader", () => ({
  MarketNavHeader: () => <nav>마켓 내비게이션</nav>,
}));
vi.mock("../components/MarketProductionProfileEditor", () => ({
  MarketProductionProfileEditor: () => <section>제작 조건 편집기</section>,
}));
vi.mock("../components/MarketResourceCard", () => ({
  MarketResourceCard: ({ record }: { record: CreatorMarketplaceResourceRecord }) => (
    <article data-testid="fit-card">{record.name}</article>
  ),
}));
vi.mock("@/hooks/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

const useProfile = vi.mocked(useMarketProductionProfile);
const useResources = vi.mocked(useMarketResources);

function record(
  name: string,
  id: string,
  minimumStudioVersion: string,
  updatedAt: string,
): CreatorMarketplaceResourceRecord {
  return {
    schemaVersion: 1,
    packageId: `original/palette/${name.toLowerCase()}`,
    name,
    description: `${name} 설명`,
    kind: "palette",
    resourceVersion: "1.1.0",
    minimumStudioVersion,
    tags: [name.toLowerCase()],
    license: "cc0-1.0",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: `palette/${name.toLowerCase()}`,
      kind: "palette",
      name,
      delivery: {
        mode: "builtin-ref",
        runtimeRef: `studio-palette:${name.toLowerCase()}`,
        byteSize: 0,
        sha256: "a".repeat(64),
      },
    }],
    id,
    manifestHash: "b".repeat(64),
    manifestByteSize: 256,
    publisher: { id: "author-1", name: "테스트 작가", avatar: null },
    createdAt: updatedAt,
    updatedAt,
    isOwner: false,
    access: "free",
  } as CreatorMarketplaceResourceRecord;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MarketFitLabPage", () => {
  it("ranks the loaded server page by fit and supports transparent local filtering", () => {
    const ready = record(
      "Ready",
      "123e4567-e89b-42d3-a456-426614174001",
      "1.0.0",
      "2026-08-01T01:00:00.000Z",
    );
    const blocked = record(
      "Blocked",
      "123e4567-e89b-42d3-a456-426614174002",
      "9.0.0",
      "2026-09-01T01:00:00.000Z",
    );
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
    useResources.mockReturnValue({
      items: [blocked, ready],
      loading: false,
      loadingMore: false,
      error: null,
      loadMoreError: null,
      hasMore: false,
      stale: false,
      staleSavedAt: null,
      loadMore: vi.fn(),
      reload: vi.fn(),
    });

    render(<MemoryRouter><MarketFitLabPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "제작 적합성 랩" })).toBeTruthy();
    expect(screen.getAllByTestId("fit-card").map((element) => element.textContent))
      .toEqual(["Ready", "Blocked"]);
    expect(screen.getByRole("button", { name: /조건 일치 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /차단 1/ })).toBeTruthy();
    expect(screen.getByText(/서버의 최신순 페이지 안에서 제작 적합성을 다시 계산합니다/))
      .toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /차단 1/ }));
    expect(screen.getAllByTestId("fit-card").map((element) => element.textContent))
      .toEqual(["Blocked"]);

    fireEvent.click(screen.getByRole("button", { name: /전체 2/ }));
    fireEvent.change(screen.getByLabelText("불러온 마켓 결과 안에서 검색"), {
      target: { value: "ready" },
    });
    expect(screen.getAllByTestId("fit-card").map((element) => element.textContent))
      .toEqual(["Ready"]);
  });
});
