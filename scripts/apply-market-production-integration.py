from pathlib import Path
root = Path.cwd()
def change(path, old, new, count=1):
    p=root/path;s=p.read_text();n=s.count(old)
    if n!=count:raise Exception(f'{path}: expected {count}, got {n}: {old[:100]}')
    p.write_text(s.replace(old,new))
creator='apps/web/src/domains/creator/'
change(creator+'studio-community-marketplace.ts','  type StudioOriginalFreeAsset,\n','')
change(creator+'studio-community-marketplace.ts','import { sha256HexPortable } from "./studio-sha256";', 'import { sha256HexPortable } from "./studio-sha256";\nimport { resolveStudioMarketplaceCc0Entry } from "./studio-marketplace-cc0-assets";\n\nimport type { StudioCommunityRenderableAsset } from "./studio-community-asset-runtime";')
change(creator+'studio-community-marketplace.ts','readonly assets: readonly StudioOriginalFreeAsset[];','readonly assets: readonly StudioCommunityRenderableAsset[];')
change(creator+'studio-community-marketplace.ts','  const assets: StudioOriginalFreeAsset[] = [];','  const assets: StudioCommunityRenderableAsset[] = [];')
change(creator+'studio-community-marketplace.ts','    const asset = assetId ? findStudioOriginalFreeAsset(assetId) : null;','    const asset = (assetId ? findStudioOriginalFreeAsset(assetId) : null)\n      ?? resolveStudioMarketplaceCc0Entry(record, entry);')
change(creator+'studio-community-marketplace.ts','  const entries = record.entries.map((entry) => projectEntry(kind, entry));','''  if (record.kind === "3d-asset" && !record.entries.every((entry) =>
    resolveStudioMarketplaceCc0Entry(record, entry) !== null,
  )) {
    return {
      status: "unsupported",
      pack: null,
      reason: "검증된 CC0 3D 모델 참조와 원본 출처가 일치하지 않습니다.",
    };
  }
  const entries = record.entries.map((entry) => projectEntry(kind, entry));''')
change(creator+'studio-creator-pack-runtime.ts','import { SCENE_TEMPLATES } from "./studio-scene-templates";','import { SCENE_TEMPLATES } from "./studio-scene-templates";\nimport { isStudioMarketplaceCc0ModelRef } from "./studio-marketplace-cc0-model-refs";')
change(creator+'studio-creator-pack-runtime.ts','  return ["이 종류는 builtin-ref 설치를 지원하지 않습니다."];','''  if (entry.kind === "3d-asset") {
    return isStudioMarketplaceCc0ModelRef(entry.delivery.runtimeRef)
      ? []
      : ["알 수 없는 내장 CC0 3D 모델 참조입니다."];
  }
  return ["이 종류는 builtin-ref 설치를 지원하지 않습니다."];''')
change(creator+'studio-marketplace-deep-link.ts','  readonly insertAsset: (asset: TAsset) => boolean;','  readonly insertAsset: (asset: TAsset, guard: StudioMarketplaceInstallGuard) => boolean | Promise<boolean>;')
change(creator+'studio-marketplace-deep-link-operation.ts','''    const installGuard: StudioMarketplaceInstallGuard = {
      isCurrent,
      assertCurrent: () => {
        if (!isCurrent()) throw new StudioMarketplaceStaleInstallError();
      },
    };
''','')
change(creator+'studio-marketplace-deep-link-operation.ts','    if (record.kind === "asset") {','''    const installGuard: StudioMarketplaceInstallGuard = {
      isCurrent,
      assertCurrent: () => {
        if (!isCurrent()) throw new StudioMarketplaceStaleInstallError();
      },
    };
    if (record.kind === "asset") {''')
change(creator+'studio-marketplace-deep-link-operation.ts','      if (!dependencies.insertAsset(asset)) {','''      const inserted = await dependencies.insertAsset(asset, installGuard);
      if (!isCurrent()) return staleResult(normalizedResourceId);
      if (!inserted) {''')
host=creator+'StudioCuttoonEditorHost.tsx'
change(host,'  const studioMarketplaceDeepLinkLifecycleRef = useRef(','  const studioMarketplaceAssetAbortRef = useRef<AbortController | null>(null);\n  const studioMarketplaceDeepLinkLifecycleRef = useRef(')
change(host,'''    return () => {
      releaseStudioMarketplaceDeepLinkLifecycleSoon(
        lifecycle,
        lifecycleGeneration,
      );
    };''','''    return () => {
      releaseStudioMarketplaceDeepLinkLifecycleSoon(
        lifecycle,
        lifecycleGeneration,
      );
      queueMicrotask(() => {
        if (!lifecycle.mounted) studioMarketplaceAssetAbortRef.current?.abort();
      });
    };''')
change(host,'    if (!installResourceId) return;','''    if (!installResourceId) return;
    studioMarketplaceAssetAbortRef.current?.abort();
    const assetController = new AbortController();
    studioMarketplaceAssetAbortRef.current = assetController;''')
change(host,'''    const isCurrentOperation = () => isStudioMarketplaceDeepLinkOperationCurrent(
      studioMarketplaceDeepLinkLifecycleRef.current,
      operationGeneration,
    );''','''    const isCurrentOperation = () => !assetController.signal.aborted
      && isStudioMarketplaceDeepLinkOperationCurrent(
        studioMarketplaceDeepLinkLifecycleRef.current,
        operationGeneration,
      );
    const isCurrentAssetScope = () => isCurrentOperation() && isStudioPasteScopeCurrent({
      mutationAllowed: canApplyStudioMutation(mutationTicket),
      reviewLocked: activeSurfaceReviewLockedRef.current,
      targetPageId,
      currentPageId: currentPageIdRef.current,
      targetMasterEditMode,
      currentMasterEditMode: masterEditModeRef.current,
    });''')
change(host,'              { createStudioOriginalFreeAssetRecord },','              { createStudioCommunityAssetRecord },')
change(host,'              import("./studio-original-free-asset-packs"),','              import("./studio-community-asset-runtime"),')
change(host,'              openBundledPackCatalog: (pack) => {','              openBundledPackCatalog: async (pack) => {')
change(host,'''                if (resolution.target.kind === "3d-asset-catalog") {
                  openBackground3dFromMenu();
                  return {
                    status: "opened" as const,
                    message: "3D 에셋 카탈로그를 열었어요. 3D 모델·소품을 선택해 캔버스 장면에 배치하세요.",
                  };
                }''','''                if (resolution.target.kind === "3d-asset-catalog") {
                  // Never replace an already open/edited 3D scene with a marketplace selection.
                  const canOpenModel = () => isCurrentAssetScope() && !bg3dOpen
                    && bg3dMutationPageIdRef.current === null;
                  if (!canOpenModel()) {
                    return { status: "unsupported" as const,
                      message: "현재 3D 편집을 저장·닫고 편집 가능한 컷에서 다시 선택해 주세요." };
                  }
                  const { prepareStudioMarketplaceCc0ModelScene } =
                    await import("./studio-marketplace-cc0-model");
                  const scene = await prepareStudioMarketplaceCc0ModelScene(
                    resolution.target.runtimeRef,
                    { isCurrent: canOpenModel, signal: assetController.signal },
                  );
                  if (!canOpenModel()) {
                    return { status: "unsupported" as const, message: "작업 위치가 바뀌어 3D 장면을 열지 않았습니다." };
                  }
                  openBackground3dFromMenu();
                  setBg3dInitialScene(scene);
                  return {
                    status: "opened" as const,
                    message: "선택한 CC0 모델을 검증해 별도 3D 장면으로 열었어요. 구도를 확인한 뒤 현재 컷에 삽입하세요.",
                  };
                }''')
change(host,'''              insertAsset: (projectedAsset) => {
                if (!isStudioPasteScopeCurrent({''','''              insertAsset: async (projectedAsset) => {
                if (!isCurrentAssetScope()) return false;
                const asset = await createStudioCommunityAssetRecord(projectedAsset, assetController.signal);
                if (!isCurrentOperation()) return false;
                if (!isStudioPasteScopeCurrent({''')
change(host,'                const asset = createStudioOriginalFreeAssetRecord(projectedAsset);\n','')
change(host,'''  const assetMarketDeepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!uiBooleanPreferencesReady || !workHydrated || !autosaveChecked) return;
    if (assetMarketDeepLinkHandledRef.current) return;
    assetMarketDeepLinkHandledRef.current = true;
    void openAssetMarketDeepLink();
  }, [uiBooleanPreferencesReady, workHydrated, autosaveChecked]);''','''  const assetMarketDeepLinkHandledRef = useRef<string | null>(null);
  const marketInstallResourceId = params.get("installMarketResource");
  useEffect(() => {
    if (!uiBooleanPreferencesReady || !workHydrated || !autosaveChecked) return;
    if (!marketInstallResourceId) {
      if (assetMarketDeepLinkHandledRef.current === null) void openAssetMarketDeepLink();
      assetMarketDeepLinkHandledRef.current = "";
      return;
    }
    if (assetMarketDeepLinkHandledRef.current === marketInstallResourceId) return;
    assetMarketDeepLinkHandledRef.current = marketInstallResourceId;
    void openAssetMarketDeepLink();
  }, [uiBooleanPreferencesReady, workHydrated, autosaveChecked, marketInstallResourceId]);''')
panel=creator+'StudioCommunityMarketplacePanel.tsx'
change(panel,'import { filterStarterMarketplaceResources } from "@/shared/lib/creator-marketplace-starter-catalog";','''import { filterStarterMarketplaceResources } from "@/shared/lib/creator-marketplace-starter-catalog";
import Link from "@/app/navigation/router-link";
import { marketStudioResourceHref } from "@/domains/market/models/market-studio-handoff";''')
change(panel,'''      !selectedAsset
      || !onUseAsset''','''      !selectedAsset
      || "path" in selectedAsset
      || !onUseAsset''')
change(panel,'''      ) : record.kind === "asset" && assetProjection.assets.length > 0 ? (''','''      ) : ((record.kind === "asset" && selectedAsset && "path" in selectedAsset)
        || (record.kind === "3d-asset" && projection.status === "installable" && record.entries.length === 1)) ? (
        <Link href={marketStudioResourceHref(record.id)} className={cx("mt-2 flex min-h-11 items-center justify-center", PRIMARY)}>
          {record.kind === "3d-asset" ? "선택한 모델을 3D 장면으로 열기" : "마켓 첫 항목을 현재 캔버스에 삽입"}
        </Link>
      ) : record.kind === "asset" && assetProjection.assets.length > 0 ? (''')
market='apps/web/src/domains/market/components/'
change(market+'MarketResourceCard.tsx','import { MarketCompareToggle } from "./MarketCompareToggle";','import { MarketCompareToggle } from "./MarketCompareToggle";\nimport { MarketCc0AssetPreview } from "./MarketCc0AssetPreview";')
change(market+'MarketResourceCard.tsx','        {paletteColors ? (','        <MarketCc0AssetPreview record={record} compact />\n\n        {paletteColors ? (')
change(market+'MarketResourceDetailArticle.tsx','import { MarketCommentsSection } from "./MarketCommentsSection";','import { MarketCommentsSection } from "./MarketCommentsSection";\nimport { MarketCc0AssetPreview } from "./MarketCc0AssetPreview";')
change(market+'MarketResourceDetailArticle.tsx','                {selectedPalette ? (','                <MarketCc0AssetPreview record={record} entryIndex={safePreviewIndex} />\n\n                {selectedPalette ? (')
change(host,'                return addRenderedImage(asset.dataUrl, asset.width, asset.height);','''                return addRenderedImage(asset.dataUrl, asset.width, asset.height, undefined, false, {
                  name: asset.name,
                  ...("path" in projectedAsset ? { communityAssetCredit: {
                    assetId: projectedAsset.id, authorName: projectedAsset.provider,
                    licenseId: "cc0-1.0" as const, licenseLabel: "CC0 1.0",
                    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
                    attributionText: `${projectedAsset.provider} — ${projectedAsset.sourceUrl}`,
                    attributionRequired: false, commercialUse: true, containsAi: false,
                  } } : {}),
                });''')
change(market+'MarketResourceCard.tsx','import Link from "@/app/navigation/router-link";','import Link from "@/app/navigation/router-link";\nimport { resolveStudioMarketplaceCc0Entry } from "@/domains/creator/studio-marketplace-cc0-assets";')
change(market+'MarketResourceCard.tsx','  const wishlisted = isWishlisted(record.id);','  const wishlisted = isWishlisted(record.id);\n  const hasSourcePreview = Boolean(record.entries[0] && resolveStudioMarketplaceCc0Entry(record, record.entries[0]));')
change(market+'MarketResourceCard.tsx','record.kind === "3d-asset" && !paletteColors ? (','record.kind === "3d-asset" && !paletteColors && !hasSourcePreview ? (')
change(creator+'studio-marketplace-cc0-model.test.ts','passes pinned hashes through the real worker/storage boundary and creates one independent model node','passes the pinned hash and worker policy to the importer and constructs an independent model node')
print('Applied scoped marketplace source integration; existing CI and data remain unchanged.')
