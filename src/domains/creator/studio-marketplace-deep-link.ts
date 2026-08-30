import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

export type StudioMarketplaceDeepLinkResult = Readonly<{
  status: "success" | "error" | "stale";
  message: string;
  resourceId: string;
}>;

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
  readonly openBundledPackCatalog: (
    pack: TPack,
    record: CreatorMarketplaceResourceRecord,
  ) => Promise<StudioMarketplaceBundledCatalogOpenResult>
    | StudioMarketplaceBundledCatalogOpenResult;
  readonly projectAssets: (
    record: CreatorMarketplaceResourceRecord,
  ) => AssetProjection<TAsset>;
  readonly insertAsset: (asset: TAsset) => boolean;
}

export interface StudioMarketplaceDeepLinkOperation<TPack, TAsset> {
  readonly consumeInstallQuery: () => void;
  readonly isCurrent: () => boolean;
  readonly loadDependencies: () => Promise<
    StudioMarketplaceDeepLinkDependencies<TPack, TAsset>
  >;
}

const SUCCESSFUL_INSTALL_STATUSES = new Set<InstallResult["status"]>([
  "installed",
  "already-installed",
  "bundled",
]);

function caughtMessage(caught: unknown): string {
  if (
    caught instanceof Error
    && (caught.name === "NotFoundError" || caught.message === "not-found")
  ) {
    return "마켓 리소스를 찾지 못했어요. 삭제되었거나 공개가 종료되었을 수 있습니다.";
  }
  if (caught instanceof Error && caught.message.trim()) return caught.message;
  return "네트워크와 기기 저장소 상태를 확인한 뒤 마켓에서 다시 시도해 주세요.";
}

function staleResult(resourceId: string): StudioMarketplaceDeepLinkResult {
  return {
    status: "stale",
    message: "종료된 Studio 작업의 마켓 설치 결과를 무시했습니다.",
    resourceId,
  };
}

class StudioMarketplaceStaleInstallError extends Error {
  constructor() {
    super("Studio marketplace install operation is stale");
    this.name = "StudioMarketplaceStaleInstallError";
  }
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
 * 공개 마켓의 설치 딥링크를 Studio의 실제 로컬 제품 저장소 또는 캔버스 삽입으로 연결한다.
 *
 * 이 함수는 모든 실패를 명시적인 결과로 바꾼다. 호출 표면은 결과를 상태 레일에 노출하고,
 * 성공 여부와 관계없이 일회성 query를 소비해 새로고침 중복 설치를 막을 수 있다.
 */
export async function applyStudioMarketplaceDeepLink<TPack, TAsset>(
  resourceId: string,
  dependencies: StudioMarketplaceDeepLinkDependencies<TPack, TAsset>,
  options: Readonly<{ isCurrent?: () => boolean }> = {},
): Promise<StudioMarketplaceDeepLinkResult> {
  const normalizedResourceId = resourceId.trim();
  const isCurrent = options.isCurrent ?? (() => true);
  if (!normalizedResourceId) {
    return {
      status: "error",
      message: "설치할 마켓 리소스 ID가 비어 있어요. 마켓에서 다시 선택해 주세요.",
      resourceId: normalizedResourceId,
    };
  }

  if (!isCurrent()) return staleResult(normalizedResourceId);

  try {
    const record = await dependencies.loadResource(normalizedResourceId);
    if (!isCurrent()) return staleResult(normalizedResourceId);
    if (!record) {
      return {
        status: "error",
        message: "마켓 리소스를 찾지 못했어요. 삭제되었거나 공개가 종료되었을 수 있습니다.",
        resourceId: normalizedResourceId,
      };
    }

    if (record.kind === "asset") {
      const projection = dependencies.projectAssets(record);
      const asset = projection.assets[0];
      if (!asset) {
        return {
          status: "error",
          message: `“${record.name}”을(를) 캔버스에 삽입할 수 없어요. ${
            projection.reason ?? "현재 Studio에서 안전하게 실행할 수 있는 에셋이 없습니다."
          }`,
          resourceId: normalizedResourceId,
        };
      }
      if (!isCurrent()) return staleResult(normalizedResourceId);
      if (!dependencies.insertAsset(asset)) {
        return {
          status: "error",
          message: `“${record.name}”을(를) 삽입하지 못했어요. 캔버스 잠금과 저장 상태를 확인해 주세요.`,
          resourceId: normalizedResourceId,
        };
      }
      return {
        status: "success",
        message: `“${record.name}” 에셋을 현재 캔버스에 삽입했어요.`,
        resourceId: normalizedResourceId,
      };
    }

    const projection = dependencies.projectPack(record);
    if (projection.status !== "installable") {
      return {
        status: "error",
        message: `“${record.name}”을(를) 설치할 수 없어요. ${projection.reason}`,
        resourceId: normalizedResourceId,
      };
    }

    const installGuard: StudioMarketplaceInstallGuard = {
      isCurrent,
      assertCurrent: () => {
        if (!isCurrent()) throw new StudioMarketplaceStaleInstallError();
      },
    };
    installGuard.assertCurrent();
    const installResult = await dependencies.installPack(projection.pack, installGuard);
    if (!isCurrent()) return staleResult(normalizedResourceId);
    if (!SUCCESSFUL_INSTALL_STATUSES.has(installResult.status)) {
      return {
        status: "error",
        message: `“${record.name}” 설치 실패 · ${installResult.message}`,
        resourceId: normalizedResourceId,
      };
    }

    if (installResult.status === "bundled") {
      const catalogResult = await dependencies.openBundledPackCatalog(
        projection.pack,
        record,
      );
      if (!isCurrent()) return staleResult(normalizedResourceId);
      if (catalogResult.status !== "opened") {
        return {
          status: "error",
          message: `“${record.name}”의 내장 카탈로그를 열 수 없어요. ${catalogResult.message}`,
          resourceId: normalizedResourceId,
        };
      }
      return {
        status: "success",
        message: `“${record.name}” · ${catalogResult.message}`,
        resourceId: normalizedResourceId,
      };
    }

    return {
      status: "success",
      message: `“${record.name}” · ${installResult.message} 자산 메뉴의 커뮤니티 목록에서 상태를 확인할 수 있어요.`,
      resourceId: normalizedResourceId,
    };
  } catch (caught) {
    if (caught instanceof StudioMarketplaceStaleInstallError || !isCurrent()) {
      return staleResult(normalizedResourceId);
    }
    return {
      status: "error",
      message: `마켓 리소스를 Studio로 가져오지 못했어요. ${caughtMessage(caught)}`,
      resourceId: normalizedResourceId,
    };
  }
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
  const dependencies = await operation.loadDependencies();
  if (!operation.isCurrent()) return staleResult(normalizedResourceId);
  return applyStudioMarketplaceDeepLink(resourceId, dependencies, {
    isCurrent: operation.isCurrent,
  });
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
