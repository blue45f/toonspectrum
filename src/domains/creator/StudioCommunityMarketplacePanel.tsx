import {
  BadgeCheck,
  Box,
  Brush,
  ChevronDown,
  CloudOff,
  Filter,
  LayoutTemplate,
  LoaderCircle,
  PackageCheck,
  Palette,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";

import {
  openProductBrushLibraryRepository,
  readAllBrushesFromRepository,
} from "./studio-brush-library-sqlite-repository";
import {
  createStudioCommunityPublishManifest,
  listStudioCommunityShareCandidates,
  projectCreatorMarketplaceRecordToAssets,
  projectCreatorMarketplaceRecordToStudioPack,
  type StudioCommunityShareCandidate,
  type StudioCommunityShareCandidateKind,
} from "./studio-community-marketplace";
import {
  inspectStudioCreatorPackInstallStateProduct,
  installStudioCreatorPackProduct,
  uninstallStudioCreatorPackProduct,
} from "./studio-creator-pack-product-runtime";
import {
  browserStudioCreatorPackStorage,
  inspectStudioCreatorPackInstallState,
  type StudioCreatorPackInstallState,
} from "./studio-creator-pack-runtime";
import {
  acquireProductFilterLibraryRepository,
  readAllFilterPresetsFromRepository,
  subscribeStudioFilterLibraryChanges,
  type StudioFilterLibraryPreset,
} from "./studio-filter-library-sqlite-repository";
import {
  STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE,
} from "./studio-marketplace-packages";
import {
  createStudioOriginalFreeAssetRecord,
} from "./studio-original-free-asset-packs";
import {
  getProductStudioPaletteSqliteRepository,
} from "./studio-palette-sqlite-repository";

import type { StudioAsset } from "./studio-asset-library";
import type { StudioSavedBrush } from "./studio-brush-library";
import type { StudioNamedPalette } from "./studio-palette-library";
import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import { cx } from "@/lib/cx";
import { useT } from "@/lib/i18n";
import {
  deleteCreatorMarketplaceResource,
  listCreatorMarketplaceResources,
  listMyCreatorMarketplaceResources,
  publishCreatorMarketplaceResource,
} from "@/src/infrastructure/creator-marketplace-client";


const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";
const CONTROL =
  `min-h-11 rounded-lg border border-line bg-card px-2.5 text-[0.65rem] font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised ${FOCUS}`;
const PRIMARY =
  `min-h-11 rounded-lg bg-accent px-3 text-[0.65rem] font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS}`;

type StudioCommunityT = (key: string, fallback?: string) => string;
type CommunityView = "community" | "mine" | "share";

function localizeText(t: StudioCommunityT, fallback: string, key: string): string {
  return t(key) === key ? fallback : t(key);
}

function interpolateText(message: string, values?: Record<string, string | number>): string {
  if (!values) return message;
  return Object.entries(values).reduce(
    (memo, [key, value]) => memo.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

function tText(
  t: StudioCommunityT,
  fallback: string,
  key: string,
  values?: Record<string, string | number>,
): string {
  return interpolateText(localizeText(t, fallback, key), values);
}

const KIND_OPTIONS: readonly {
  id: CreatorMarketplaceResourceKind | "all";
  labelKey: string;
  labelFallback: string;
  Icon: typeof Brush;
}[] = [
  {
    id: "all",
    labelKey: "studio.community.kind.all",
    labelFallback: "전체",
    Icon: PackageCheck,
  },
  {
    id: "asset",
    labelKey: "studio.community.kind.asset",
    labelFallback: "에셋",
    Icon: BadgeCheck,
  },
  {
    id: "brush",
    labelKey: "studio.community.kind.brush",
    labelFallback: "브러시",
    Icon: Brush,
  },
  {
    id: "filter",
    labelKey: "studio.community.kind.filter",
    labelFallback: "필터",
    Icon: Filter,
  },
  {
    id: "palette",
    labelKey: "studio.community.kind.palette",
    labelFallback: "팔레트",
    Icon: Palette,
  },
  {
    id: "template",
    labelKey: "studio.community.kind.template",
    labelFallback: "템플릿",
    Icon: LayoutTemplate,
  },
  {
    id: "3d-preset",
    labelKey: "studio.community.kind.threeDPreset",
    labelFallback: "3D",
    Icon: Box,
  },
];

const KIND_LABEL: Readonly<Record<CreatorMarketplaceResourceKind, string>> =
  Object.freeze({
    asset: "studio.community.kind.asset",
    brush: "studio.community.kind.brush",
    filter: "studio.community.kind.filter",
    palette: "studio.community.kind.palette",
    template: "studio.community.kind.template",
    "3d-preset": "studio.community.kind.threeDPreset",
  });
const KIND_LABEL_FALLBACK: Readonly<Record<CreatorMarketplaceResourceKind, string>> =
  Object.freeze({
    asset: "에셋",
    brush: "브러시",
    filter: "필터",
    palette: "팔레트",
    template: "템플릿",
    "3d-preset": "3D",
  });

const LICENSE_LABEL: Readonly<Record<CreatorMarketplaceResourceLicense, string>> =
  Object.freeze({
    "toonspectrum-standard": "studio.community.license.toonspectrumStandard",
    "cc0-1.0": "studio.community.license.cc0",
    "cc-by-4.0": "studio.community.license.ccBy4",
    "cc-by-nc-4.0": "studio.community.license.ccByNc4",
  });
const LICENSE_LABEL_FALLBACK: Readonly<Record<CreatorMarketplaceResourceLicense, string>> =
  Object.freeze({
    "toonspectrum-standard": "표준 · 파일 재배포 금지",
    "cc0-1.0": "CC0 · 제한 없이 허용",
    "cc-by-4.0": "CC BY · 출처 표시",
    "cc-by-nc-4.0": "CC BY-NC · 비상업",
  });

const LICENSE_OPTIONS: readonly {
  value: CreatorMarketplaceResourceLicense;
  labelKey: string;
  labelFallback: string;
}[] = [
  {
    value: "toonspectrum-standard",
    labelKey: "studio.community.license.toonspectrumStandard",
    labelFallback: "표준 · 파일 재배포 금지",
  },
  {
    value: "cc0-1.0",
    labelKey: "studio.community.license.cc0",
    labelFallback: "CC0 · 제한 없이 허용",
  },
  {
    value: "cc-by-4.0",
    labelKey: "studio.community.license.ccBy4",
    labelFallback: "CC BY · 출처 표시",
  },
  {
    value: "cc-by-nc-4.0",
    labelKey: "studio.community.license.ccByNc4",
    labelFallback: "CC BY-NC · 비상업",
  },
];

const SHARE_KIND_LABEL: Readonly<Record<StudioCommunityShareCandidateKind, string>> =
  Object.freeze({
    brush: "studio.community.kind.brush",
    filter: "studio.community.kind.filter",
    palette: "studio.community.kind.palette",
  });
const SHARE_KIND_LABEL_FALLBACK: Readonly<Record<StudioCommunityShareCandidateKind, string>> =
  Object.freeze({
    brush: "브러시",
    filter: "필터",
    palette: "팔레트",
  });

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message
    ? caught.message
    : fallback;
}

function CommunityRecordCard({
  record,
  onUseAsset,
  onDelete,
  onStatus,
  refreshToken,
}: {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly onUseAsset?: (asset: StudioAsset) => boolean;
  readonly onDelete?: (record: CreatorMarketplaceResourceRecord) => void;
  readonly onStatus: (message: string, error: boolean) => void;
  readonly refreshToken: number;
}) {
  const projection = projectCreatorMarketplaceRecordToStudioPack(record);
  const assetProjection = projectCreatorMarketplaceRecordToAssets(record);
  const [selectedAssetId, setSelectedAssetId] = useState(
    assetProjection.assets[0]?.id ?? "",
  );
  const [deleteArmed, setDeleteArmed] = useState(false);
  const storage = browserStudioCreatorPackStorage();
  const usesSqlCatalog = projection.status === "installable"
    && (
      projection.pack.metadata.kind === "filter"
      || projection.pack.metadata.kind === "brush"
      || projection.pack.metadata.kind === "palette"
    );
  const [installState, setInstallState] = useState<StudioCreatorPackInstallState | null>(() =>
    projection.status !== "installable"
      ? null
      : usesSqlCatalog
        ? "available"
        : inspectStudioCreatorPackInstallState(projection.pack, storage),
  );
  const [installPending, setInstallPending] = useState(usesSqlCatalog);
  useEffect(() => {
    const effectProjection = projectCreatorMarketplaceRecordToStudioPack(record);
    if (effectProjection.status !== "installable") return;
    let active = true;
    setInstallPending(true);
    void inspectStudioCreatorPackInstallStateProduct(effectProjection.pack, { storage })
      .then((state) => {
        if (active) setInstallState(state);
      })
      .catch((error: unknown) => {
        if (active) {
          onStatus(
            `${record.name} · ${
              usesSqlCatalog ? "로컬 SQL 카탈로그" : "기기 저장소"
            } 상태를 읽지 못했습니다: ${
              error instanceof Error ? error.message : String(error)
            }`,
            true,
          );
        }
      })
      .finally(() => {
        if (active) setInstallPending(false);
      });
    return () => {
      active = false;
    };
  }, [onStatus, record, refreshToken, storage, usesSqlCatalog]);
  const installed = installState === "installed";
  const bundled = installState === "bundled";
  const installBlocked = installState === "invalid"
    || installState === "conflict"
    || installState === "downgrade-blocked";
  const selectedAsset = assetProjection.assets.find(
    (asset) => asset.id === selectedAssetId,
  ) ?? assetProjection.assets[0] ?? null;
  const t = useT();
  const installActionLabel = bundled
    ? localizeText(
      t,
      "Studio 내장됨",
      "studio.community.install.builtIn",
    )
    : installed
      ? localizeText(
        t,
        "기기에서 제거",
        "studio.community.install.remove",
      )
      : installState === "update"
        ? localizeText(
          t,
          "업데이트 설치",
          "studio.community.install.update",
        )
        : installState === "repair-required"
          ? localizeText(
            t,
            "설치 복구",
            "studio.community.install.repair",
          )
          : installBlocked
            ? localizeText(
              t,
              "호환성 확인 필요",
              "studio.community.install.compatibilityCheck",
            )
            : localizeText(
              t,
              "무료 설치",
              "studio.community.install.free",
            );

  async function handleInstall(): Promise<void> {
    if (projection.status !== "installable") return;
    setInstallPending(true);
    const result = installed
      ? await uninstallStudioCreatorPackProduct(projection.pack, { storage })
      : await installStudioCreatorPackProduct(projection.pack, { storage });
    setInstallPending(false);
    onStatus(`${record.name} · ${result.message}`, [
      "invalid",
      "conflict",
      "storage-error",
    ].includes(result.status));
  }

  function handleUseAsset() {
    if (!selectedAsset || !onUseAsset) return;
    const inserted = onUseAsset(createStudioOriginalFreeAssetRecord(selectedAsset));
    onStatus(
      inserted
        ? tText(
          t,
          `${selectedAsset.name}을(를) 현재 캔버스 위치에 삽입했습니다.`,
          "studio.community.useAsset.success",
          { resourceName: selectedAsset.name },
        )
        : tText(
          t,
          `${selectedAsset.name}을(를) 삽입하지 못했습니다. 캔버스 잠금과 저장 상태를 확인해주세요.`,
          "studio.community.useAsset.failed",
          { resourceName: selectedAsset.name },
        ),
      !inserted,
    );
  }

  return (
    <article
      data-studio-community-resource={record.id}
      data-studio-community-refresh={refreshToken}
      className="rounded-lg border border-line bg-card p-2.5"
    >
      <div className="flex items-start gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent-soft text-accent">
          {record.kind === "asset" ? <BadgeCheck size={16} aria-hidden /> : null}
          {record.kind === "brush" ? <Brush size={16} aria-hidden /> : null}
          {record.kind === "filter" ? <Filter size={16} aria-hidden /> : null}
          {record.kind === "palette" ? <Palette size={16} aria-hidden /> : null}
          {record.kind === "template" ? <LayoutTemplate size={16} aria-hidden /> : null}
          {record.kind === "3d-preset" ? <Box size={16} aria-hidden /> : null}
        </span>
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <h5 className="text-[0.7rem] font-black text-fg">{record.name}</h5>
              <span className="rounded-full border border-good/30 bg-good/10 px-1.5 py-0.5 text-[0.52rem] font-black text-good">
              {t("studio.community.record.free")}
              </span>
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[0.52rem] font-semibold text-fg-3">
              {localizeText(t, KIND_LABEL_FALLBACK[record.kind], KIND_LABEL[record.kind])}
              </span>
            {record.containsAi ? (
              <span className="rounded-full border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[0.52rem] font-semibold text-warn">
                {t("studio.community.tag.aiIncluded")}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[0.56rem] text-fg-3">
            <UserRound size={10} aria-hidden />
            {record.publisher.name} · v{record.resourceVersion}
          </p>
        </div>
        {record.isOwner && onDelete ? (
            deleteArmed ? (
              <div
                role="group"
              aria-label={tText(
                t,
                `${record.name} 공유 삭제 확인`,
                "studio.community.record.deleteConfirmAria",
                { resourceName: record.name },
              )}
                className="flex shrink-0 gap-1"
              >
              <button
                type="button"
                onClick={() => setDeleteArmed(false)}
                className={cx(
                  "min-h-11 rounded-lg border border-line px-2 text-[0.56rem] font-bold text-fg-2 hover:bg-raised",
                  FOCUS,
                )}
              >
                {t("studio.community.action.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteArmed(false);
                  onDelete(record);
                }}
                className={cx(
                  "min-h-11 rounded-lg border border-bad/30 bg-bad/10 px-2 text-[0.56rem] font-bold text-bad hover:bg-bad/15",
                  FOCUS,
                )}
                >
                  {t("studio.community.action.deleteConfirm")}
                </button>
              </div>
          ) : (
              <button
                type="button"
                onClick={() => setDeleteArmed(true)}
              aria-label={tText(
                t,
                `${record.name} 공유 삭제`,
                "studio.community.record.deleteAria",
                { resourceName: record.name },
              )}
                className={cx(
                  "grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-bad/10 hover:text-bad",
                  FOCUS,
                )}
              >
              <Trash2 size={15} aria-hidden />
            </button>
          )
        ) : null}
      </div>
      {record.description ? (
        <p className="mt-2 text-[0.6rem] leading-relaxed text-fg-2">
          {record.description}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1 text-[0.54rem]">
        <span className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg-2">
          {localizeText(t, LICENSE_LABEL_FALLBACK[record.license], LICENSE_LABEL[record.license])}
        </span>
        <span className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg-3">
          {tText(
            t,
            "{count}개 항목",
            "studio.community.record.entryCount",
            { count: record.entries.length },
          )}
        </span>
        {record.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg-3">
            #{tag}
          </span>
        ))}
      </div>
      {record.attributionText ? (
        <p className="mt-2 rounded-md border border-line bg-panel px-2 py-1.5 text-[0.55rem] leading-relaxed text-fg-3">
          {tText(
            t,
            "출처 표시: {value}",
            "studio.community.record.attribution",
            { value: record.attributionText },
          )}
        </p>
      ) : null}
      {record.license === "cc-by-nc-4.0" ? (
        <p className="mt-2 rounded-md border border-warn/25 bg-warn/10 px-2 py-1.5 text-[0.55rem] font-semibold text-warn">
          {t("studio.community.record.nonCommercialNotice")}
        </p>
      ) : null}
      {record.kind === "asset" && assetProjection.assets.length > 0 ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <select
            value={selectedAsset?.id ?? ""}
            onChange={(event) => setSelectedAssetId(event.target.value)}
            aria-label={tText(
              t,
              "{resourceName} 에셋 선택",
              "studio.community.record.selectAssetAria",
              { resourceName: record.name },
            )}
            className={CONTROL}
          >
            {assetProjection.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUseAsset}
            disabled={!onUseAsset}
            className={PRIMARY}
          >
            {t("studio.community.record.addToCanvas")}
          </button>
        </div>
      ) : projection.status === "installable" ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={bundled || installBlocked || installPending}
          className={cx(
            "mt-2 w-full",
            installed
              ? `${CONTROL} border-bad/30 text-bad hover:bg-bad/10`
              : PRIMARY,
          )}
        >
          {installPending ? "로컬 SQL 확인 중…" : installActionLabel}
        </button>
      ) : (
        <p className="mt-2 rounded-md border border-warn/25 bg-warn/10 px-2 py-1.5 text-[0.55rem] leading-relaxed text-warn">
          {record.kind === "asset"
            ? assetProjection.reason
            : projection.reason}
        </p>
      )}
    </article>
  );
}

function ShareResourceForm({
  onPublished,
}: {
  readonly onPublished: (record: CreatorMarketplaceResourceRecord) => void;
}) {
  const t = useT();
  const [refreshToken, setRefreshToken] = useState(0);
  const [filterPresets, setFilterPresets] = useState<
    readonly StudioFilterLibraryPreset[]
  >([]);
  const [brushes, setBrushes] = useState<readonly StudioSavedBrush[]>([]);
  const [palettes, setPalettes] = useState<readonly StudioNamedPalette[]>([]);
  const [filterLoadError, setFilterLoadError] = useState<string | null>(null);
  const [creativeLoadError, setCreativeLoadError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function loadFilters(): Promise<void> {
      try {
        const product = await acquireProductFilterLibraryRepository();
        const filters = await readAllFilterPresetsFromRepository(product.repository);
        if (active) {
          setFilterPresets(filters);
          setFilterLoadError(null);
        }
      } catch (error) {
        if (active) {
          setFilterPresets([]);
          setFilterLoadError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
    void loadFilters();
    const unsubscribe = subscribeStudioFilterLibraryChanges(() => void loadFilters());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshToken]);
  useEffect(() => {
    let active = true;
    const paletteRepository = getProductStudioPaletteSqliteRepository();
    async function loadCreativeLibraries(): Promise<void> {
      try {
        const brushProduct = await openProductBrushLibraryRepository();
        if (brushProduct.authority !== "sqlite") {
          throw new Error("브러시 SQLite/OPFS 권위를 사용할 수 없습니다.");
        }
        const [storedBrushes, storedPalettes] = await Promise.all([
          readAllBrushesFromRepository(brushProduct.repository),
          paletteRepository.list(),
        ]);
        if (active) {
          setBrushes(storedBrushes);
          setPalettes(storedPalettes);
          setCreativeLoadError(null);
        }
      } catch (error) {
        if (active) {
          setBrushes([]);
          setPalettes([]);
          setCreativeLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }
    void loadCreativeLibraries();
    const unsubscribe = paletteRepository.subscribe(() => void loadCreativeLibraries());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshToken]);
  const candidates = listStudioCommunityShareCandidates({
    brushes,
    filters: filterPresets,
    palettes,
  });
  const candidateKey = (candidate: StudioCommunityShareCandidate) =>
    `${candidate.kind}:${candidate.id}`;
  const [selectedCandidateKey, setSelectedCandidateKey] = useState(
    candidates[0] ? candidateKey(candidates[0]) : "",
  );
  const [description, setDescription] = useState("");
  const [license, setLicense] =
    useState<CreatorMarketplaceResourceLicense>("toonspectrum-standard");
  const [attributionText, setAttributionText] = useState("");
  const [containsAi, setContainsAi] = useState(false);
  const [ownsRights, setOwnsRights] = useState(false);
  const [notMarketplaceDerivative, setNotMarketplaceDerivative] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);
  const candidate = candidates.find(
    (item) => candidateKey(item) === selectedCandidateKey,
  )
    ?? candidates[0]
    ?? null;
  const attributionRequired =
    license === "cc-by-4.0" || license === "cc-by-nc-4.0";
  const ready = Boolean(candidate)
    && ownsRights
    && notMarketplaceDerivative
    && (!attributionRequired || attributionText.trim().length > 0)
    && !publishing;

  async function handlePublish(event: FormEvent) {
    event.preventDefault();
    if (!candidate || !ready) return;
    setPublishing(true);
    setStatus(null);
    try {
      const manifest = await createStudioCommunityPublishManifest(candidate, {
        description,
        license,
        attributionText,
        containsAi,
        creatorOwnsRights: ownsRights,
        recognizableMarketplaceDerivative: !notMarketplaceDerivative,
      });
      const published = await publishCreatorMarketplaceResource(manifest);
      setStatus({
        message: tText(
          t,
          '"{resourceName}"을(를) 무료 공유 마켓에 게시했습니다.',
          "studio.community.share.publishSuccess",
          { resourceName: published.name },
        ),
        error: false,
      });
      onPublished(published);
    } catch (caught) {
      setStatus({
        message: errorText(
          caught,
          t("studio.community.share.publishError"),
        ),
        error: true,
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <form onSubmit={handlePublish} className="space-y-2">
      <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/10 p-2.5">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <p className="text-[0.59rem] leading-relaxed text-fg-2">
          {STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE}
        </p>
      </div>
      {filterLoadError ? (
        <p role="alert" className="rounded-lg border border-bad/25 bg-bad/10 px-2.5 py-2 text-[0.58rem] text-bad">
          필터 카탈로그 SQL을 읽지 못했습니다: {filterLoadError}
        </p>
      ) : null}
      {creativeLoadError ? (
        <p role="alert" className="rounded-lg border border-bad/25 bg-bad/10 px-2.5 py-2 text-[0.58rem] text-bad">
          브러시·팔레트 SQLite를 읽지 못했습니다: {creativeLoadError}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <select
          value={candidate ? candidateKey(candidate) : ""}
          onChange={(event) => setSelectedCandidateKey(event.target.value)}
          aria-label={t("studio.community.share.selectCandidateAria")}
          className={CONTROL}
          disabled={!candidate}
        >
            {candidates.length === 0
                ? <option value="">{t("studio.community.share.noCandidate")}</option>
                : null}
            {candidates.map((item) => (
              <option key={candidateKey(item)} value={candidateKey(item)}>
                [{localizeText(t, SHARE_KIND_LABEL_FALLBACK[item.kind], SHARE_KIND_LABEL[item.kind])}] {item.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => setRefreshToken((value) => value + 1)}
          aria-label={t("studio.community.share.refreshCandidatesAria")}
          className={CONTROL}
          data-studio-share-refresh={refreshToken}
        >
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 1_000))}
        placeholder={t("studio.community.share.descriptionPlaceholder")}
        aria-label={t("studio.community.share.descriptionAria")}
        rows={3}
        className={cx(
          "w-full resize-y rounded-lg border border-line bg-card px-2.5 py-2 text-[0.65rem] text-fg outline-none placeholder:text-fg-3 focus:border-accent",
          FOCUS,
        )}
      />
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <select
          value={license}
          onChange={(event) => setLicense(
            event.target.value as CreatorMarketplaceResourceLicense,
          )}
          aria-label={t("studio.community.share.licenseAria")}
          className={CONTROL}
        >
          {LICENSE_OPTIONS.map((licenseOption) => (
            <option key={licenseOption.value} value={licenseOption.value}>
              {localizeText(t, licenseOption.labelFallback, licenseOption.labelKey)}
            </option>
          ))}
        </select>
        <label className={cx(
          CONTROL,
          "flex cursor-pointer items-center justify-between gap-2",
        )}>
          <span>{t("studio.community.share.aiIncludedLabel")}</span>
          <input
            type="checkbox"
            checked={containsAi}
            onChange={(event) => setContainsAi(event.target.checked)}
            className="size-4 accent-accent"
          />
        </label>
      </div>
      {attributionRequired ? (
        <input
          value={attributionText}
          onChange={(event) => setAttributionText(event.target.value.slice(0, 240))}
          placeholder={t("studio.community.share.attributionPlaceholder")}
          aria-label={t("studio.community.share.attributionAria")}
          className={cx("w-full", CONTROL)}
        />
      ) : null}
      <label className={cx(
        CONTROL,
        "flex cursor-pointer items-start gap-2 py-2 leading-relaxed",
      )}>
        <input
          type="checkbox"
          checked={ownsRights}
          onChange={(event) => setOwnsRights(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
          <span>{t("studio.community.share.ownershipStatement")}</span>
        </label>
      <label className={cx(
        CONTROL,
        "flex cursor-pointer items-start gap-2 py-2 leading-relaxed",
      )}>
        <input
          type="checkbox"
          checked={notMarketplaceDerivative}
          onChange={(event) => setNotMarketplaceDerivative(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
          <span>{t("studio.community.share.derivativeStatement")}</span>
        </label>
        <button type="submit" disabled={!ready} className={cx("w-full", PRIMARY)}>
          {publishing
            ? <LoaderCircle size={14} className="mr-1 inline animate-spin" aria-hidden />
            : <Send size={14} className="mr-1 inline" aria-hidden />}
          {t("studio.community.share.submit")}
        </button>
      {status ? (
        <p
          role={status.error ? "alert" : "status"}
          className={cx(
            "rounded-lg border px-2.5 py-2 text-[0.6rem] leading-relaxed",
            status.error
              ? "border-bad/25 bg-bad/10 text-bad"
              : "border-good/25 bg-good/10 text-good",
          )}
        >
          {status.message}
        </p>
      ) : null}
    </form>
  );
}

export function StudioCommunityMarketplacePanel({
  onUseAsset,
  initialOpen = false,
}: {
  readonly onUseAsset?: (asset: StudioAsset) => boolean;
  readonly initialOpen?: boolean;
}): ReactElement {
  const searchId = useId();
  const tabBaseId = useId();
  const [open, setOpen] = useState(initialOpen);
  const [view, setView] = useState<CommunityView>("community");
  const [kind, setKind] = useState<CreatorMarketplaceResourceKind | "all">("all");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<CreatorMarketplaceResourceRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const t = useT();

  useEffect(() => {
    if (!open || view === "share") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const request = view === "mine"
      ? listMyCreatorMarketplaceResources
      : listCreatorMarketplaceResources;
    void request({
      limit: 12,
      search: query || undefined,
      kind: kind === "all" ? undefined : kind,
    }, controller.signal)
      .then((page) => {
        setRecords(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setRecords([]);
        setNextCursor(null);
        setHasMore(false);
        setError(
          errorText(
            caught,
            view === "mine"
              ? t("studio.community.error.loadMine")
              : t("studio.community.error.loadCommunity"),
          ),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, open, query, reloadToken, t, view]);

  async function loadMore() {
    if (!nextCursor || loadingMore || view === "share") return;
    setLoadingMore(true);
    setError(null);
    const request = view === "mine"
      ? listMyCreatorMarketplaceResources
      : listCreatorMarketplaceResources;
    try {
      const page = await request({
        limit: 12,
        cursor: nextCursor,
        search: query || undefined,
        kind: kind === "all" ? undefined : kind,
      });
      setRecords((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((candidate) => candidate.id === item.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(errorText(caught, t("studio.community.error.loadMore")));
    } finally {
      setLoadingMore(false);
    }
  }

  async function deleteRecord(record: CreatorMarketplaceResourceRecord) {
    setStatus(null);
    try {
      await deleteCreatorMarketplaceResource(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setStatus({
        message: tText(
          t,
          `"${record.name}" 공유를 삭제했습니다.`,
          "studio.community.record.deleteSuccess",
          { resourceName: record.name },
        ),
        error: false,
      });
    } catch (caught) {
      setStatus({
        message: errorText(caught, t("studio.community.error.delete")),
        error: true,
      });
    }
  }

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setQuery(queryDraft.trim());
  }

  return (
    <section
      aria-label={t("studio.community.panel.aria")}
      data-studio-community-marketplace
      className="mb-3 overflow-hidden rounded-lg border border-line bg-panel"
    >
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group/community-market"
      >
        <summary className={cx(
          "flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden",
          FOCUS,
        )}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent-soft text-accent">
            <UserRound size={17} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-xs text-fg">{t("studio.community.panel.label")}</strong>
            <span className="mt-0.5 block truncate text-[0.58rem] text-fg-3">
              {t("studio.community.panel.subtitle")}
            </span>
          </span>
          <ChevronDown
            size={15}
            className="shrink-0 text-fg-3 transition-transform group-open/community-market:rotate-180"
            aria-hidden
          />
        </summary>

        {open ? (
          <div className="border-t border-line p-2.5">
            <div role="tablist" aria-label={t("studio.community.panel.tabAria")} className="grid grid-cols-3 gap-1">
              {([
                ["community", t("studio.community.panel.tab.community")],
                ["mine", t("studio.community.panel.tab.mine")],
                ["share", t("studio.community.panel.tab.share")],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  id={`${tabBaseId}-${id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  aria-controls={`${tabBaseId}-${id}-panel`}
                  onClick={() => {
                    setView(id);
                    setStatus(null);
                    setError(null);
                  }}
                  className={cx(
                    "min-h-11 rounded-lg border px-2 text-[0.6rem] font-bold",
                    FOCUS,
                    view === id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === "share" ? (
              <div
                id={`${tabBaseId}-share-panel`}
                role="tabpanel"
                aria-labelledby={`${tabBaseId}-share-tab`}
                className="mt-2"
              >
                <ShareResourceForm
                  onPublished={(published) => {
                    setRecords((current) => [published, ...current]);
                    setView("mine");
                    setReloadToken((value) => value + 1);
                  }}
                />
              </div>
            ) : (
              <div
                id={`${tabBaseId}-${view}-panel`}
                role="tabpanel"
                aria-labelledby={`${tabBaseId}-${view}-tab`}
                className="mt-2"
              >
                <form onSubmit={applySearch} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <label htmlFor={searchId} className="sr-only">{t("studio.community.panel.searchAria")}</label>
                  <div className="relative">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
                    <input
                      id={searchId}
                      type="search"
                      value={queryDraft}
                      onChange={(event) => setQueryDraft(event.target.value.slice(0, 120))}
                      placeholder={t("studio.community.panel.searchPlaceholder")}
                      className={cx("w-full pl-9 pr-11", CONTROL)}
                    />
                    {queryDraft ? (
                      <button
                        type="button"
                        onClick={() => {
                          setQueryDraft("");
                          setQuery("");
                        }}
                        aria-label={t("studio.community.panel.searchClearAria")}
                        className={cx(
                          "absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised",
                          FOCUS,
                        )}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <button type="submit" className={PRIMARY}>{t("studio.community.panel.searchAction")}</button>
                </form>
                <div className="mt-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {KIND_OPTIONS.map(({ id, labelKey, labelFallback, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setKind(id)}
                      aria-pressed={kind === id}
                      className={cx(
                        "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[0.6rem] font-semibold",
                        FOCUS,
                        kind === id
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised",
                      )}
                    >
                      <Icon size={12} aria-hidden />
                      {localizeText(t, labelFallback, labelKey)}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[0.57rem] text-fg-3">
                  <span>{loading
                    ? t("studio.community.panel.loading")
                    : tText(
                      t,
                      `${records.length}개 표시`,
                      "studio.community.panel.recordCount",
                      { count: records.length },
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReloadToken((value) => value + 1)}
                    aria-label={t("studio.community.panel.reloadAria")}
                    className={cx("grid size-11 place-items-center rounded-lg hover:bg-raised", FOCUS)}
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
                  </button>
                </div>
                {error ? (
                  <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad/10 p-2.5 text-bad">
                    <CloudOff size={15} className="mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6rem] leading-relaxed">{error}</p>
                      {view === "mine" ? (
                        <p className="mt-1 text-[0.55rem] text-fg-3">{t("studio.community.panel.loginHint")}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="mt-2 grid gap-2">
                  {records.map((record) => (
                    <CommunityRecordCard
                      key={`${record.id}:${refreshToken}`}
                      record={record}
                      onUseAsset={onUseAsset}
                      onDelete={record.isOwner ? deleteRecord : undefined}
                      refreshToken={refreshToken}
                      onStatus={(message, statusError) => {
                        setStatus({ message, error: statusError });
                        setRefreshToken((value) => value + 1);
                      }}
                    />
                  ))}
                </div>
                {!loading && !error && records.length === 0 ? (
                  <p role="status" className="mt-2 rounded-lg border border-dashed border-line px-3 py-5 text-center text-xs text-fg-3">
                    {t("studio.community.panel.empty")}
                  </p>
                ) : null}
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className={cx("mt-2 w-full", CONTROL)}
                  >
                    {loadingMore
                      ? <LoaderCircle size={14} className="mr-1 inline animate-spin" aria-hidden />
                      : null}
                    {t("studio.community.panel.loadMore")}
                  </button>
                ) : null}
              </div>
            )}
            {status ? (
              <p
                role={status.error ? "alert" : "status"}
                className={cx(
                  "mt-2 rounded-lg border px-2.5 py-2 text-[0.6rem] leading-relaxed",
                  status.error
                    ? "border-bad/25 bg-bad/10 text-bad"
                    : "border-good/25 bg-good/10 text-good",
                )}
              >
                {status.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </details>
    </section>
  );
}
