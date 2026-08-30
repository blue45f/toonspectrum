import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { isStudioEditorMutationContinuationAllowed } from "./studio-editor-scope";
import {
  applyStudioMarketplaceDeepLink,
  beginStudioMarketplaceDeepLinkOperation,
  consumeStudioMarketplaceInstallLocation,
  consumeStudioMarketplaceInstallSearch,
  createStudioMarketplaceDeepLinkLifecycleState,
  executeStudioMarketplaceDeepLinkOperation,
  isStudioMarketplaceDeepLinkOperationCurrent,
  releaseStudioMarketplaceDeepLinkLifecycleSoon,
  retainStudioMarketplaceDeepLinkLifecycle,
} from "./studio-marketplace-deep-link";

import type { StudioMarketplaceInstallGuard } from "./studio-marketplace-deep-link";
import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function record(
  kind: CreatorMarketplaceResourceRecord["kind"] = "brush",
): CreatorMarketplaceResourceRecord {
  return {
    id: "resource-1",
    kind,
    name: kind === "asset" ? "골목 소품" : "수채 브러시",
  } as CreatorMarketplaceResourceRecord;
}

function dependencies(options: {
  kind?: CreatorMarketplaceResourceRecord["kind"];
  load?: CreatorMarketplaceResourceRecord | null;
  projection?: "installable" | "unsupported";
  installStatus?: "installed" | "already-installed" | "bundled" | "conflict" | "storage-error";
  bundledCatalogStatus?: "opened" | "unsupported";
  assets?: readonly string[];
  inserted?: boolean;
} = {}) {
  const loaded = options.load === undefined
    ? record(options.kind)
    : options.load;
  return {
    loadResource: vi.fn(async () => loaded),
    projectPack: vi.fn(() => options.projection === "unsupported"
      ? { status: "unsupported" as const, pack: null, reason: "호환되지 않는 엔진입니다." }
      : { status: "installable" as const, pack: "pack-1", reason: null }),
    installPack: vi.fn(async (
      _pack: string,
      _guard: StudioMarketplaceInstallGuard,
    ) => ({
      status: options.installStatus ?? "installed",
      message: options.installStatus === "conflict"
        ? "같은 버전에 다른 내용이 있습니다."
        : "1개 항목을 로컬 SQL 카탈로그에 설치했습니다.",
    })),
    openBundledPackCatalog: vi.fn(async () => options.bundledCatalogStatus === "unsupported"
      ? {
          status: "unsupported" as const,
          message: "지원하는 단일 내장 참조가 아닙니다.",
        }
      : {
          status: "opened" as const,
          message: "장면 템플릿 카탈로그를 열었어요. 카드를 눌러 적용하세요.",
        }),
    projectAssets: vi.fn(() => ({
      assets: options.assets ?? [],
      reason: "검증된 절차형 에셋이 없습니다.",
    })),
    insertAsset: vi.fn(() => options.inserted ?? true),
  };
}

describe("Studio marketplace deep link", () => {
  it("captures the editor scope before loading and rejects a stale asset before render-local insertion", () => {
    const start = studioPageSource.indexOf(
      "const openAssetMarketDeepLink = useEffectEvent(async () => {",
    );
    const end = studioPageSource.indexOf("// 마운트 직후가 아니라", start);
    const handler = studioPageSource.slice(start, end);
    const captureIndex = handler.indexOf("const mutationTicket = captureStudioMutationTicket();");
    const executeIndex = handler.indexOf("await executeStudioMarketplaceDeepLinkOperation(");
    const guardIndex = handler.indexOf("if (!isStudioPasteScopeCurrent({", executeIndex);
    const insertIndex = handler.indexOf("return addRenderedImage(asset.dataUrl", guardIndex);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(captureIndex).toBeGreaterThan(handler.indexOf("if (!installResourceId) return;"));
    expect(captureIndex).toBeLessThan(executeIndex);
    expect(handler).toContain("const targetPageId = activePage.id;");
    expect(handler).toContain("const targetMasterEditMode = masterEditMode;");
    expect(guardIndex).toBeGreaterThan(executeIndex);
    expect(handler).toContain("mutationAllowed: canApplyStudioMutation(mutationTicket)");
    expect(handler).toContain("reviewLocked: activeSurfaceReviewLockedRef.current");
    expect(handler).toContain("currentPageId: currentPageIdRef.current");
    expect(handler).toContain("currentMasterEditMode: masterEditModeRef.current");
    expect(insertIndex).toBeGreaterThan(guardIndex);
  });

  it("does not reach render-local insertion when the document changes during resource loading", async () => {
    const pendingRecord = deferred<CreatorMarketplaceResourceRecord | null>();
    const deps = dependencies({ kind: "asset", assets: ["asset-record"] });
    const mutationTicket = {
      authScopeKey: "account-a",
      workId: "work-a",
      accessGeneration: 3,
      documentGeneration: 7,
    };
    let documentGeneration = mutationTicket.documentGeneration;
    const renderLocalInsert = vi.fn(() => true);
    deps.loadResource.mockImplementationOnce(() => pendingRecord.promise);
    deps.insertAsset.mockImplementationOnce(() => {
      if (!isStudioEditorMutationContinuationAllowed(mutationTicket, {
        ...mutationTicket,
        documentGeneration,
        mounted: true,
        aborted: false,
        locked: false,
      })) return false;
      return renderLocalInsert();
    });

    const execution = applyStudioMarketplaceDeepLink("asset-1", deps);
    await vi.waitFor(() => {
      expect(deps.loadResource).toHaveBeenCalledOnce();
    });
    documentGeneration += 1;
    pendingRecord.resolve(record("asset"));

    await expect(execution).resolves.toMatchObject({ status: "error" });
    expect(deps.insertAsset).toHaveBeenCalledOnce();
    expect(renderLocalInsert).not.toHaveBeenCalled();
  });

  it("reports a durable pack installation and keeps the result inspectable", async () => {
    const deps = dependencies();
    const result = await applyStudioMarketplaceDeepLink("resource-1", deps);

    expect(result.status).toBe("success");
    expect(result.message).toContain("로컬 SQL 카탈로그");
    expect(result.message).toContain("커뮤니티 목록");
    expect(deps.installPack).toHaveBeenCalledWith(
      "pack-1",
      expect.objectContaining({
        isCurrent: expect.any(Function),
        assertCurrent: expect.any(Function),
      }),
    );
    expect(deps.openBundledPackCatalog).not.toHaveBeenCalled();
  });

  it.each(["unmount", "new-operation"] as const)(
    "does not leave a durable pack write when %s makes repository initialization stale",
    async (staleCause) => {
      const pendingRepository = deferred<void>();
      const deps = dependencies();
      const durablePackIds = new Set<string>();
      const repositoryMutation = vi.fn((packId: string) => {
        durablePackIds.add(packId);
      });
      deps.installPack.mockImplementationOnce(async (pack, guard) => {
        await pendingRepository.promise;
        guard.assertCurrent();
        repositoryMutation(pack);
        return {
          status: "installed",
          message: "1개 항목을 로컬 SQL 카탈로그에 설치했습니다.",
        };
      });
      const lifecycle = createStudioMarketplaceDeepLinkLifecycleState();
      const lifecycleGeneration = retainStudioMarketplaceDeepLinkLifecycle(lifecycle);
      const operationGeneration = beginStudioMarketplaceDeepLinkOperation(lifecycle);

      const execution = executeStudioMarketplaceDeepLinkOperation("resource-1", {
        consumeInstallQuery: vi.fn(),
        isCurrent: () => isStudioMarketplaceDeepLinkOperationCurrent(
          lifecycle,
          operationGeneration,
        ),
        loadDependencies: async () => deps,
      });
      await vi.waitFor(() => {
        expect(deps.installPack).toHaveBeenCalledOnce();
      });

      if (staleCause === "unmount") {
        releaseStudioMarketplaceDeepLinkLifecycleSoon(lifecycle, lifecycleGeneration);
        await Promise.resolve();
      } else {
        beginStudioMarketplaceDeepLinkOperation(lifecycle);
      }
      pendingRepository.resolve();

      await expect(execution).resolves.toMatchObject({ status: "stale" });
      expect(repositoryMutation).not.toHaveBeenCalled();
      expect(durablePackIds).toEqual(new Set());
    },
  );

  it("opens a validated bundled pack catalog through the injected callback", async () => {
    const deps = dependencies({ kind: "template", installStatus: "bundled" });

    const result = await applyStudioMarketplaceDeepLink("resource-1", deps);

    expect(result).toMatchObject({ status: "success" });
    expect(result.message).toContain("장면 템플릿 카탈로그");
    expect(deps.openBundledPackCatalog).toHaveBeenCalledWith(
      "pack-1",
      expect.objectContaining({ kind: "template" }),
    );
  });

  it("fails closed when a bundled pack has no supported catalog target", async () => {
    const deps = dependencies({
      kind: "template",
      installStatus: "bundled",
      bundledCatalogStatus: "unsupported",
    });

    const result = await applyStudioMarketplaceDeepLink("resource-1", deps);

    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("단일 내장 참조");
    expect(deps.openBundledPackCatalog).toHaveBeenCalledOnce();
  });

  it("surfaces an operational bundled catalog callback failure", async () => {
    const deps = dependencies({ kind: "3d-preset", installStatus: "bundled" });
    deps.openBundledPackCatalog.mockRejectedValueOnce(
      new Error("3D 카탈로그 전환에 실패했습니다."),
    );

    const result = await applyStudioMarketplaceDeepLink("resource-1", deps);

    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("3D 카탈로그 전환에 실패");
  });

  it("discards a bundled callback result that becomes stale while opening", async () => {
    const pendingOpen = deferred<{
      status: "opened";
      message: string;
    }>();
    const deps = dependencies({ kind: "template", installStatus: "bundled" });
    deps.openBundledPackCatalog.mockImplementationOnce(() => pendingOpen.promise);
    let current = true;

    const execution = applyStudioMarketplaceDeepLink("resource-1", deps, {
      isCurrent: () => current,
    });
    await vi.waitFor(() => {
      expect(deps.openBundledPackCatalog).toHaveBeenCalledOnce();
    });
    current = false;
    pendingOpen.resolve({
      status: "opened",
      message: "장면 템플릿 카탈로그를 열었어요.",
    });

    await expect(execution).resolves.toMatchObject({ status: "stale" });
  });

  it("surfaces unsupported and conflicting packs as errors", async () => {
    const unsupported = await applyStudioMarketplaceDeepLink(
      "resource-1",
      dependencies({ projection: "unsupported" }),
    );
    const conflict = await applyStudioMarketplaceDeepLink(
      "resource-1",
      dependencies({ installStatus: "conflict" }),
    );

    expect(unsupported).toMatchObject({ status: "error" });
    expect(unsupported.message).toContain("호환되지 않는 엔진");
    expect(conflict).toMatchObject({ status: "error" });
    expect(conflict.message).toContain("같은 버전에 다른 내용");
  });

  it("inserts a verified asset and rejects empty or locked projections", async () => {
    const inserted = await applyStudioMarketplaceDeepLink(
      "asset-1",
      dependencies({ kind: "asset", assets: ["asset-record"] }),
    );
    const unsupported = await applyStudioMarketplaceDeepLink(
      "asset-1",
      dependencies({ kind: "asset" }),
    );
    const locked = await applyStudioMarketplaceDeepLink(
      "asset-1",
      dependencies({ kind: "asset", assets: ["asset-record"], inserted: false }),
    );

    expect(inserted).toMatchObject({ status: "success" });
    expect(unsupported.message).toContain("검증된 절차형 에셋");
    expect(locked.message).toContain("캔버스 잠금");
  });

  it("reports missing and network-failed resources", async () => {
    const missing = await applyStudioMarketplaceDeepLink(
      "resource-1",
      dependencies({ load: null }),
    );
    const deps = dependencies();
    deps.loadResource.mockRejectedValueOnce(new Error("API 연결이 끊겼습니다."));
    const failed = await applyStudioMarketplaceDeepLink("resource-1", deps);

    expect(missing.message).toContain("찾지 못했어요");
    expect(failed.message).toContain("API 연결이 끊겼습니다");
  });

  it("turns the network client's not-found sentinel into recovery copy", async () => {
    const deps = dependencies();
    const notFound = new Error("not-found");
    notFound.name = "NotFoundError";
    deps.loadResource.mockRejectedValueOnce(notFound);

    const result = await applyStudioMarketplaceDeepLink("missing-1", deps);

    expect(result.status).toBe("error");
    expect(result.message).toContain("삭제되었거나 공개가 종료");
    expect(result.message).not.toContain("not-found");
  });

  it("consumes only the one-shot install query", () => {
    expect(
      consumeStudioMarketplaceInstallSearch(
        "?installMarketResource=resource-1&assetMarket=community&room=live-1",
      ),
    ).toBe("?assetMarket=community&room=live-1");
    expect(consumeStudioMarketplaceInstallSearch("?installMarketResource=resource-1")).toBe("");

    const routeState = { returnTo: "/market/resource/resource-1" };
    expect(consumeStudioMarketplaceInstallLocation({
      pathname: "/studio/draft/editor",
      search: "?installMarketResource=resource-1&assetMarket=community&room=live-1",
      hash: "#canvas",
      state: routeState,
    })).toEqual({
      pathname: "/studio/draft/editor",
      search: "?assetMarket=community&room=live-1",
      hash: "#canvas",
      state: routeState,
    });
  });

  it("consumes the URL before a deferred resource load and inserts an asset exactly once", async () => {
    const pendingRecord = deferred<CreatorMarketplaceResourceRecord | null>();
    const deps = dependencies({ kind: "asset", assets: ["asset-record"] });
    deps.loadResource.mockImplementationOnce(() => pendingRecord.promise);
    const lifecycle = createStudioMarketplaceDeepLinkLifecycleState();
    retainStudioMarketplaceDeepLinkLifecycle(lifecycle);
    const operationGeneration = beginStudioMarketplaceDeepLinkOperation(lifecycle);
    const routeState = { returnTo: "/market/resource/asset-1" };
    let currentLocation = {
      pathname: "/studio/draft/editor",
      search: "?installMarketResource=asset-1&assetMarket=community&room=live-1",
      hash: "#canvas",
      state: routeState,
    };
    const consumeInstallQuery = vi.fn(() => {
      currentLocation = consumeStudioMarketplaceInstallLocation(currentLocation);
    });

    const execution = executeStudioMarketplaceDeepLinkOperation("asset-1", {
      consumeInstallQuery,
      isCurrent: () => isStudioMarketplaceDeepLinkOperationCurrent(
        lifecycle,
        operationGeneration,
      ),
      loadDependencies: async () => deps,
    });

    expect(consumeInstallQuery).toHaveBeenCalledOnce();
    expect(currentLocation).toEqual({
      pathname: "/studio/draft/editor",
      search: "?assetMarket=community&room=live-1",
      hash: "#canvas",
      state: routeState,
    });
    expect(deps.insertAsset).not.toHaveBeenCalled();

    pendingRecord.resolve(record("asset"));
    await expect(execution).resolves.toMatchObject({ status: "success" });
    expect(deps.insertAsset).toHaveBeenCalledOnce();
  });

  it("does not insert or navigate back after unmount, then lets one fresh remount insert", async () => {
    const pendingRecord = deferred<CreatorMarketplaceResourceRecord | null>();
    const deps = dependencies({ kind: "asset", assets: ["asset-record"] });
    deps.loadResource.mockImplementationOnce(() => pendingRecord.promise);
    const lifecycle = createStudioMarketplaceDeepLinkLifecycleState();
    const lifecycleGeneration = retainStudioMarketplaceDeepLinkLifecycle(lifecycle);
    const operationGeneration = beginStudioMarketplaceDeepLinkOperation(lifecycle);
    let currentHref: string | undefined;
    const navigate = vi.fn(() => {
      currentHref = "/studio/draft/editor?assetMarket=community";
    });
    const execution = executeStudioMarketplaceDeepLinkOperation("asset-1", {
      consumeInstallQuery: navigate,
      isCurrent: () => isStudioMarketplaceDeepLinkOperationCurrent(
        lifecycle,
        operationGeneration,
      ),
      loadDependencies: async () => deps,
    });
    expect(currentHref).toBe("/studio/draft/editor?assetMarket=community");
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.loadResource).toHaveBeenCalledOnce();

    releaseStudioMarketplaceDeepLinkLifecycleSoon(lifecycle, lifecycleGeneration);
    currentHref = "/market/resource/asset-1";
    await Promise.resolve();
    pendingRecord.resolve(record("asset"));

    await expect(execution).resolves.toMatchObject({ status: "stale" });
    expect(deps.insertAsset).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnce();
    expect(currentHref).toBe("/market/resource/asset-1");

    const remountedLifecycle = createStudioMarketplaceDeepLinkLifecycleState();
    retainStudioMarketplaceDeepLinkLifecycle(remountedLifecycle);
    const remountedOperation = beginStudioMarketplaceDeepLinkOperation(remountedLifecycle);
    await expect(executeStudioMarketplaceDeepLinkOperation("asset-1", {
      consumeInstallQuery: vi.fn(),
      isCurrent: () => isStudioMarketplaceDeepLinkOperationCurrent(
        remountedLifecycle,
        remountedOperation,
      ),
      loadDependencies: async () => deps,
    })).resolves.toMatchObject({ status: "success" });
    expect(deps.insertAsset).toHaveBeenCalledOnce();
  });

  it("keeps an in-flight operation current across StrictMode cleanup/setup replay", async () => {
    const lifecycle = createStudioMarketplaceDeepLinkLifecycleState();
    const firstLifecycleGeneration = retainStudioMarketplaceDeepLinkLifecycle(lifecycle);
    const operationGeneration = beginStudioMarketplaceDeepLinkOperation(lifecycle);

    releaseStudioMarketplaceDeepLinkLifecycleSoon(lifecycle, firstLifecycleGeneration);
    const replayedLifecycleGeneration = retainStudioMarketplaceDeepLinkLifecycle(lifecycle);
    await Promise.resolve();

    expect(isStudioMarketplaceDeepLinkOperationCurrent(
      lifecycle,
      operationGeneration,
    )).toBe(true);

    releaseStudioMarketplaceDeepLinkLifecycleSoon(lifecycle, replayedLifecycleGeneration);
    await Promise.resolve();
    expect(isStudioMarketplaceDeepLinkOperationCurrent(
      lifecycle,
      operationGeneration,
    )).toBe(false);
  });
});
