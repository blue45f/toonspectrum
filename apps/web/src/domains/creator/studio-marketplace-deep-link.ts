import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

export type StudioMarketplaceDeepLinkAccountSync = Readonly<{
  status: "synchronized" | "skipped" | "retry-required";
  message: string;
}>;

export type StudioMarketplaceCompletionReceipt =
  | Readonly<{
      kind: "asset-inserted";
      resourceId: string;
      resourceKind: "asset";
      authority: "studio-canvas";
    }>
  | Readonly<{
      kind: "package-installed";
      resourceId: string;
      resourceKind: Exclude<CreatorMarketplaceResourceRecord["kind"], "asset">;
      authority: "studio-local-library";
      installStatus: "installed" | "already-installed";
    }>
  | Readonly<{
      kind: "catalog-opened";
      resourceId: string;
      resourceKind: Exclude<CreatorMarketplaceResourceRecord["kind"], "asset">;
      authority: "studio-catalog";
    }>;

export type StudioMarketplaceDeepLinkResult = Readonly<{
  status: "success" | "error" | "stale";
  message: string;
  resourceId: string;
  receipt?: StudioMarketplaceCompletionReceipt;
  accountSync?: StudioMarketplaceDeepLinkAccountSync;
}>;

export type StudioMarketplaceInstallPhase =
  | "preparing"
  | "downloading"
  | "validating"
  | "installing"
  | "applying"
  | "opening-catalog"
  | "synchronizing";

export interface StudioMarketplaceInstallProgress {
  readonly phase: StudioMarketplaceInstallPhase;
  readonly message: string;
  readonly resourceName?: string;
}

export interface StudioMarketplaceInstallLocationSnapshot<TState = unknown> {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly state: TState;
}

export interface StudioMarketplaceDeepLinkLifecycleState {
  mounted: boolean;
  lifecycleGeneration: number;
  operationGeneration: number;
}

interface InstallResult {
  readonly status:
    | "installed"
    | "already-installed"
    | "uninstalled"
    | "already-uninstalled"
    | "bundled"
    | "invalid"
    | "conflict"
    | "full"
    | "storage-error";
  readonly message: string;
}

type PackProjection<TPack> =
  | Readonly<{ status: "installable"; pack: TPack; reason: null }>
  | Readonly<{ status: "unsupported"; pack: null; reason: string }>;

interface AssetProjection<TAsset> {
  readonly assets: readonly TAsset[];
  readonly reason: string | null;
}

/**
 * 설치 구현은 저장소를 획득하거나 읽은 뒤 실제 mutation을 시작하기 직전에 이 guard를
 * 다시 확인해야 한다. 호출 시점의 boolean snapshot이 아니라 live callback을 전달해
 * 화면 이탈이나 더 최신 딥링크 operation을 installer 내부 await 경계에서도 감지한다.
 */
export interface StudioMarketplaceInstallGuard {
  readonly isCurrent: () => boolean;
  readonly assertCurrent: () => void;
}

export type StudioMarketplaceBundledCatalogOpenResult =
  | Readonly<{
      status: "opened";
      message: string;
    }>
  | Readonly<{
      status: "unsupported";
      message: string;
    }>;

export interface StudioMarketplaceDeepLinkDependencies<TPack, TAsset> {
  readonly loadResource: (
    resourceId: string,
  ) => Promise<CreatorMarketplaceResourceRecord | null>;
  readonly projectPack: (
    record: CreatorMarketplaceResourceRecord,
  ) => PackProjection<TPack>;
  readonly installPack: (
    pack: TPack,
    guard: StudioMarketplaceInstallGuard,
  ) => Promise<InstallResult>;
  readonly synchronizeInstalledPack?: (
    record: CreatorMarketplaceResourceRecord,
    pack: TPack,
    guard: StudioMarketplaceInstallGuard,
  ) => Promise<Readonly<{
    status: "synchronized" | "skipped";
    message: string;
  }>>;
  readonly openBundledPackCatalog: (
    pack: TPack,
    record: CreatorMarketplaceResourceRecord,
  ) => Promise<StudioMarketplaceBundledCatalogOpenResult>
    | StudioMarketplaceBundledCatalogOpenResult;
  readonly projectAssets: (
    record: CreatorMarketplaceResourceRecord,
  ) => AssetProjection<TAsset>;
  readonly insertAsset: (asset: TAsset) => boolean | Promise<boolean>;
}

export interface StudioMarketplaceDeepLinkOperation<TPack, TAsset> {
  readonly consumeInstallQuery: () => void;
  readonly isCurrent: () => boolean;
  readonly reportProgress?: (progress: StudioMarketplaceInstallProgress) => void;
  readonly loadDependencies: () => Promise<
    StudioMarketplaceDeepLinkDependencies<TPack, TAsset>
  >;
}

function staleResult(resourceId: string): StudioMarketplaceDeepLinkResult {
  return {
    status: "stale",
    message: "종료된 Studio 작업의 마켓 설치 결과를 무시했습니다.",
    resourceId,
  };
}

export function createStudioMarketplaceDeepLinkLifecycleState(): StudioMarketplaceDeepLinkLifecycleState {
  return {
    mounted: false,
    lifecycleGeneration: 0,
    operationGeneration: 0,
  };
}

/**
 * React StrictMode의 effect setup → cleanup → setup 재생은 같은 컴포넌트 인스턴스를
 * 다시 retain한다. cleanup을 한 microtask 늦춰 실제 unmount만 pending operation을 폐기한다.
 */
export function retainStudioMarketplaceDeepLinkLifecycle(
  state: StudioMarketplaceDeepLinkLifecycleState,
): number {
  state.mounted = true;
  state.lifecycleGeneration += 1;
  return state.lifecycleGeneration;
}

export function releaseStudioMarketplaceDeepLinkLifecycleSoon(
  state: StudioMarketplaceDeepLinkLifecycleState,
  lifecycleGeneration: number,
): void {
  globalThis.queueMicrotask(() => {
    if (state.lifecycleGeneration !== lifecycleGeneration) return;
    state.mounted = false;
    state.operationGeneration += 1;
  });
}

export function beginStudioMarketplaceDeepLinkOperation(
  state: StudioMarketplaceDeepLinkLifecycleState,
): number {
  state.operationGeneration += 1;
  return state.operationGeneration;
}

export function isStudioMarketplaceDeepLinkOperationCurrent(
  state: StudioMarketplaceDeepLinkLifecycleState,
  operationGeneration: number,
): boolean {
  return state.mounted && state.operationGeneration === operationGeneration;
}

/**
 * 일회성 query는 dependency chunk/network/OPFS 작업보다 먼저 동기적으로 소비한다.
 * 이후 단계는 같은 mount의 최신 operation일 때만 mutation과 UI 결과를 허용한다.
 */
export async function executeStudioMarketplaceDeepLinkOperation<TPack, TAsset>(
  resourceId: string,
  operation: StudioMarketplaceDeepLinkOperation<TPack, TAsset>,
): Promise<StudioMarketplaceDeepLinkResult> {
  const normalizedResourceId = resourceId.trim();
  operation.consumeInstallQuery();
  if (!operation.isCurrent()) return staleResult(normalizedResourceId);
  operation.reportProgress?.({
    phase: "preparing",
    message: "Studio 설치 도구와 기기 저장소를 준비하고 있어요…",
  });
  const [dependencies, { applyStudioMarketplaceDeepLinkOperation }] = await Promise.all([
    operation.loadDependencies(),
    import("./studio-marketplace-deep-link-operation"),
  ]);
  if (!operation.isCurrent()) return staleResult(normalizedResourceId);
  return applyStudioMarketplaceDeepLinkOperation(resourceId, dependencies, {
    isCurrent: operation.isCurrent,
    reportProgress: (progress) => {
      if (operation.isCurrent()) operation.reportProgress?.(progress);
    },
  });
}

export const STUDIO_MARKET_RETURN_QUERY = "marketReturn";

const MARKET_RESOURCE_RETURN = /^\/market\/resource\/([^/?#]+)\/?$/u;

export function readStudioMarketplaceReturnHref(search: string): string | null {
  const value = new URLSearchParams(search).get(STUDIO_MARKET_RETURN_QUERY);
  if (!value || value.length > 512) return null;
  let url: URL;
  try {
    url = new URL(value, "https://studio.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://studio.invalid" || url.search || url.hash) return null;
  const match = MARKET_RESOURCE_RETURN.exec(url.pathname);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    if (!decoded || decoded === "." || decoded === ".."
      || /[\\/%]/u.test(decoded)
      || [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      return null;
    }
    return `/market/resource/${encodeURIComponent(decoded)}`;
  } catch {
    return null;
  }
}

export function consumeStudioMarketplaceInstallSearch(search: string): string {
  const next = new URLSearchParams(search);
  next.delete("installMarketResource");
  const serialized = next.toString();
  return serialized ? `?${serialized}` : "";
}

export function consumeStudioMarketplaceInstallLocation<TState>(
  location: StudioMarketplaceInstallLocationSnapshot<TState>,
): StudioMarketplaceInstallLocationSnapshot<TState> {
  return {
    pathname: location.pathname,
    search: consumeStudioMarketplaceInstallSearch(location.search),
    hash: location.hash,
    state: location.state,
  };
}
