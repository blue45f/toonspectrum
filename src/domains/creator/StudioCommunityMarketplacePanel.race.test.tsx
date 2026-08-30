// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCommunityMarketplacePanel } from "./StudioCommunityMarketplacePanel";

import type {
  CreatorMarketplaceResourceListPage,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import { useI18n } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  acquireFilterRepository: vi.fn(),
  createPublishManifest: vi.fn(),
  deleteResource: vi.fn(),
  listBrushes: vi.fn(),
  listCandidates: vi.fn(),
  listFilters: vi.fn(),
  listMine: vi.fn(),
  listPalettes: vi.fn(),
  listPublic: vi.fn(),
  openBrushRepository: vi.fn(),
  publishResource: vi.fn(),
}));

vi.mock("@/src/infrastructure/creator-marketplace-client", () => ({
  deleteCreatorMarketplaceResource: mocks.deleteResource,
  listCreatorMarketplaceResources: mocks.listPublic,
  listMyCreatorMarketplaceResources: mocks.listMine,
  publishCreatorMarketplaceResource: mocks.publishResource,
}));

vi.mock("./studio-community-marketplace", () => ({
  createStudioCommunityPublishManifest: mocks.createPublishManifest,
  listStudioCommunityShareCandidates: mocks.listCandidates,
  projectCreatorMarketplaceRecordToAssets: () => ({
    assets: [],
    reason: "테스트에서는 에셋 투영을 사용하지 않습니다.",
  }),
  projectCreatorMarketplaceRecordToStudioPack: () => ({
    status: "unsupported",
    reason: "테스트에서는 설치 투영을 사용하지 않습니다.",
  }),
}));

vi.mock("./filter/studio-filter-library-sqlite-repository", () => ({
  acquireProductFilterLibraryRepository: mocks.acquireFilterRepository,
  readAllFilterPresetsFromRepository: mocks.listFilters,
  subscribeStudioFilterLibraryChanges: () => () => undefined,
}));

vi.mock("./brush/studio-brush-library-sqlite-repository", () => ({
  openProductBrushLibraryRepository: mocks.openBrushRepository,
  readAllBrushesFromRepository: mocks.listBrushes,
}));

vi.mock("./studio-palette-sqlite-repository", () => ({
  getProductStudioPaletteSqliteRepository: () => ({
    list: mocks.listPalettes,
    subscribe: () => () => undefined,
  }),
}));

vi.mock("./studio-creator-pack-runtime", () => ({
  browserStudioCreatorPackStorage: () => ({}),
  inspectStudioCreatorPackInstallState: () => "available",
}));

vi.mock("./studio-creator-pack-product-runtime", () => ({
  inspectStudioCreatorPackInstallStateProduct: vi.fn().mockResolvedValue("available"),
  installStudioCreatorPackProduct: vi.fn(),
  uninstallStudioCreatorPackProduct: vi.fn(),
}));

vi.mock("./studio-original-free-asset-packs", () => ({
  createStudioOriginalFreeAssetRecord: (asset: unknown) => asset,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function resource(
  id: string,
  name: string,
  isOwner: boolean,
): CreatorMarketplaceResourceRecord {
  return {
    id,
    name,
    kind: "template",
    containsAi: false,
    publisher: { id: "publisher-1", name: "작가", avatar: null },
    resourceVersion: 1,
    description: "",
    license: "cc0-1.0",
    entries: [],
    tags: [],
    isOwner,
  } as unknown as CreatorMarketplaceResourceRecord;
}

function page(
  items: CreatorMarketplaceResourceRecord[],
  nextCursor: string | null = null,
): CreatorMarketplaceResourceListPage {
  return {
    items,
    limit: 12,
    hasMore: nextCursor !== null,
    nextCursor,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useI18n.getState().setLang("ko");
  mocks.acquireFilterRepository.mockResolvedValue({ repository: {} });
  mocks.listFilters.mockResolvedValue([]);
  mocks.openBrushRepository.mockResolvedValue({ authority: "sqlite", repository: {} });
  mocks.listBrushes.mockResolvedValue([]);
  mocks.listPalettes.mockResolvedValue([]);
  mocks.listCandidates.mockReturnValue([
    { id: "brush-1", kind: "brush", name: "게시 후보" },
  ]);
  mocks.createPublishManifest.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("StudioCommunityMarketplacePanel request races", () => {
  it("abort를 무시하고 늦게 끝난 공개 첫 페이지도 mine 결과를 덮지 못한다", async () => {
    const stalePublicRecord = resource("public-1", "늦은 공개 첫 페이지", false);
    const mineRecord = resource("mine-1", "현재 내 공유", true);
    const stalePublic = deferred<CreatorMarketplaceResourceListPage>();
    mocks.listPublic.mockReturnValue(stalePublic.promise);
    mocks.listMine.mockResolvedValue(page([mineRecord]));

    render(<StudioCommunityMarketplacePanel initialOpen />);
    await waitFor(() => expect(mocks.listPublic).toHaveBeenCalledOnce());
    const publicSignal = mocks.listPublic.mock.calls[0]?.[1] as AbortSignal;

    fireEvent.click(screen.getByRole("tab", { name: "내 공유" }));
    expect(await screen.findByText(mineRecord.name)).toBeTruthy();
    expect(publicSignal.aborted).toBe(true);

    await act(async () => {
      stalePublic.resolve(page([stalePublicRecord]));
      await stalePublic.promise;
    });

    expect(screen.getByText(mineRecord.name)).toBeTruthy();
    expect(screen.queryByText(stalePublicRecord.name)).toBeNull();
  });

  it("게시 성공 안내와 확인된 카드를 mine 새로고침 실패에도 유지한다", async () => {
    const publicRecord = resource("public-1", "이전 공개 자료", false);
    const publishedRecord = resource("published-1", "방금 게시한 자료", true);
    const mineResponse = deferred<CreatorMarketplaceResourceListPage>();
    mocks.listPublic.mockResolvedValue(page([publicRecord]));
    mocks.listMine.mockReturnValue(mineResponse.promise);
    mocks.publishResource.mockResolvedValue(publishedRecord);

    render(<StudioCommunityMarketplacePanel initialOpen />);
    expect(await screen.findByText(publicRecord.name)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "자료 게시" }));
    fireEvent.click(screen.getByLabelText("제가 직접 제작했으며 게시·재배포할 권리를 보유합니다."));
    fireEvent.click(screen.getByLabelText("다른 마켓 상품을 복제하거나 알아보기 어렵게 변형한 자료가 아닙니다."));
    const submit = screen.getByRole("button", { name: "무료 공유 마켓에 게시" });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.publishResource).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "내 공유" }).getAttribute("aria-selected"),
      ).toBe("true");
    });
    expect(screen.getByText(publishedRecord.name)).toBeTruthy();
    expect(screen.queryByText(publicRecord.name)).toBeNull();
    expect(
      screen.getByRole("button", { name: `${publishedRecord.name} 공유 삭제` }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(publishedRecord.name);

    await act(async () => {
      mineResponse.reject(new Error("내 공유 새로고침 실패"));
      await mineResponse.promise.catch(() => undefined);
    });

    expect(screen.getByRole("alert").textContent).toContain("내 공유 새로고침 실패");
    expect(screen.getByText(publishedRecord.name)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(publishedRecord.name);
  });

  it("폼이 사라진 뒤 끝난 게시 POST가 사용자의 이후 탭 선택을 바꾸지 않는다", async () => {
    const publishedRecord = resource("published-late", "늦게 완료된 게시물", true);
    const pendingPublish = deferred<CreatorMarketplaceResourceRecord>();
    mocks.listPublic.mockResolvedValue(page([]));
    mocks.publishResource.mockReturnValue(pendingPublish.promise);

    render(<StudioCommunityMarketplacePanel initialOpen initialView="share" />);
    fireEvent.click(screen.getByLabelText("제가 직접 제작했으며 게시·재배포할 권리를 보유합니다."));
    fireEvent.click(screen.getByLabelText("다른 마켓 상품을 복제하거나 알아보기 어렵게 변형한 자료가 아닙니다."));
    fireEvent.click(screen.getByRole("button", { name: "무료 공유 마켓에 게시" }));
    await waitFor(() => expect(mocks.publishResource).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("tab", { name: "공개 마켓" }));
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "공개 마켓" }).getAttribute("aria-selected"),
      ).toBe("true");
    });
    expect(screen.queryByRole("button", { name: "무료 공유 마켓에 게시" })).toBeNull();

    await act(async () => {
      pendingPublish.resolve(publishedRecord);
      await pendingPublish.promise;
    });

    expect(
      screen.getByRole("tab", { name: "공개 마켓" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByText(publishedRecord.name)).toBeNull();
    expect(screen.queryByText(/무료 공유 마켓에 게시했습니다/)).toBeNull();
  });

  it("이전 공개 loadMore가 늦게 끝나도 mine 결과에 append하지 않는다", async () => {
    const publicRecord = resource("public-1", "공개 첫 페이지", false);
    const stalePublicRecord = resource("public-2", "늦은 공개 다음 페이지", false);
    const mineRecord = resource("mine-1", "내 공유 자료", true);
    const staleLoadMore = deferred<CreatorMarketplaceResourceListPage>();
    mocks.listPublic
      .mockResolvedValueOnce(page([publicRecord], "public_cursor"))
      .mockReturnValueOnce(staleLoadMore.promise);
    mocks.listMine.mockResolvedValue(page([mineRecord]));

    render(<StudioCommunityMarketplacePanel initialOpen />);
    expect(await screen.findByText(publicRecord.name)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
    await waitFor(() => expect(mocks.listPublic).toHaveBeenCalledTimes(2));
    const loadMoreSignal = mocks.listPublic.mock.calls[1]?.[1] as AbortSignal;

    fireEvent.click(screen.getByRole("tab", { name: "내 공유" }));
    expect(await screen.findByText(mineRecord.name)).toBeTruthy();
    expect(loadMoreSignal.aborted).toBe(true);

    await act(async () => {
      staleLoadMore.resolve(page([stalePublicRecord]));
      await staleLoadMore.promise;
    });

    expect(screen.getByText(mineRecord.name)).toBeTruthy();
    expect(screen.queryByText(stalePublicRecord.name)).toBeNull();
  });
});
