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
  createStudioCommunityPublishManifest,
  listStudioCommunityShareCandidates,
  projectCreatorMarketplaceRecordToAssets,
  projectCreatorMarketplaceRecordToStudioPack,
  type StudioCommunityShareCandidate,
  type StudioCommunityShareCandidateKind,
} from "./studio-community-marketplace";
import {
  browserStudioCreatorPackStorage,
  inspectStudioCreatorPackInstallState,
  installStudioCreatorPack,
  uninstallStudioCreatorPack,
} from "./studio-creator-pack-runtime";
import {
  STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE,
} from "./studio-marketplace-packages";
import {
  createStudioOriginalFreeAssetRecord,
} from "./studio-original-free-asset-packs";

import type { StudioAsset } from "./studio-asset-library";
import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import { cx } from "@/lib/cx";
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

type CommunityView = "community" | "mine" | "share";

const KIND_OPTIONS: readonly {
  id: CreatorMarketplaceResourceKind | "all";
  label: string;
  Icon: typeof Brush;
}[] = [
  { id: "all", label: "전체", Icon: PackageCheck },
  { id: "asset", label: "에셋", Icon: BadgeCheck },
  { id: "brush", label: "브러시", Icon: Brush },
  { id: "filter", label: "필터", Icon: Filter },
  { id: "palette", label: "팔레트", Icon: Palette },
  { id: "template", label: "템플릿", Icon: LayoutTemplate },
  { id: "3d-preset", label: "3D", Icon: Box },
];

const KIND_LABEL: Readonly<Record<CreatorMarketplaceResourceKind, string>> =
  Object.freeze({
    asset: "에셋",
    brush: "브러시",
    filter: "필터",
    palette: "팔레트",
    template: "템플릿",
    "3d-preset": "3D 프리셋",
  });

const LICENSE_LABEL: Readonly<Record<CreatorMarketplaceResourceLicense, string>> =
  Object.freeze({
    "toonspectrum-standard": "표준 사용권",
    "cc0-1.0": "CC0",
    "cc-by-4.0": "CC BY",
    "cc-by-nc-4.0": "CC BY-NC",
  });

const SHARE_KIND_LABEL: Readonly<Record<StudioCommunityShareCandidateKind, string>> =
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
  const installState = projection.status === "installable"
    ? inspectStudioCreatorPackInstallState(projection.pack, storage)
    : null;
  const installed = installState === "installed";
  const bundled = installState === "bundled";
  const installBlocked = installState === "invalid"
    || installState === "conflict"
    || installState === "downgrade-blocked";
  const selectedAsset = assetProjection.assets.find(
    (asset) => asset.id === selectedAssetId,
  ) ?? assetProjection.assets[0] ?? null;

  function handleInstall() {
    if (projection.status !== "installable") return;
    const result = installed
      ? uninstallStudioCreatorPack(projection.pack, storage)
      : installStudioCreatorPack(projection.pack, storage);
    onStatus(`${record.name} · ${result.message}`, [
      "invalid",
      "conflict",
      "full",
      "storage-error",
    ].includes(result.status));
  }

  function handleUseAsset() {
    if (!selectedAsset || !onUseAsset) return;
    const inserted = onUseAsset(createStudioOriginalFreeAssetRecord(selectedAsset));
    onStatus(
      inserted
        ? `${selectedAsset.name}을(를) 현재 캔버스 위치에 삽입했습니다.`
        : `${selectedAsset.name}을(를) 삽입하지 못했습니다. 캔버스 잠금과 저장 상태를 확인해주세요.`,
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
              FREE
            </span>
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[0.52rem] font-semibold text-fg-3">
              {KIND_LABEL[record.kind]}
            </span>
            {record.containsAi ? (
              <span className="rounded-full border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[0.52rem] font-semibold text-warn">
                AI 포함
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
              aria-label={`${record.name} 공유 삭제 확인`}
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
                취소
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
                삭제 확인
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteArmed(true)}
              aria-label={`${record.name} 공유 삭제`}
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
          {LICENSE_LABEL[record.license]}
        </span>
        <span className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg-3">
          {record.entries.length}개 항목
        </span>
        {record.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-md border border-line bg-panel px-1.5 py-1 text-fg-3">
            #{tag}
          </span>
        ))}
      </div>
      {record.attributionText ? (
        <p className="mt-2 rounded-md border border-line bg-panel px-2 py-1.5 text-[0.55rem] leading-relaxed text-fg-3">
          출처 표시: {record.attributionText}
        </p>
      ) : null}
      {record.license === "cc-by-nc-4.0" ? (
        <p className="mt-2 rounded-md border border-warn/25 bg-warn/10 px-2 py-1.5 text-[0.55rem] font-semibold text-warn">
          비상업용 라이선스입니다. 유료 연재·광고 작품에는 사용할 수 없습니다.
        </p>
      ) : null}
      {record.kind === "asset" && assetProjection.assets.length > 0 ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <select
            value={selectedAsset?.id ?? ""}
            onChange={(event) => setSelectedAssetId(event.target.value)}
            aria-label={`${record.name} 에셋 선택`}
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
            캔버스에 추가
          </button>
        </div>
      ) : projection.status === "installable" ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={bundled || installBlocked}
          className={cx(
            "mt-2 w-full",
            installed
              ? `${CONTROL} border-bad/30 text-bad hover:bg-bad/10`
              : PRIMARY,
          )}
        >
          {bundled
            ? "Studio 내장됨"
            : installed
              ? "기기에서 제거"
              : installState === "update"
                ? "업데이트 설치"
                : installState === "repair-required"
                  ? "설치 복구"
                  : installBlocked
                    ? "호환성 확인 필요"
                    : "무료 설치"}
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
  const [refreshToken, setRefreshToken] = useState(0);
  const candidates = listStudioCommunityShareCandidates();
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
      setStatus({ message: `"${published.name}"을(를) 무료 공유 마켓에 게시했습니다.`, error: false });
      onPublished(published);
    } catch (caught) {
      setStatus({
        message: errorText(caught, "공유 리소스를 게시하지 못했습니다."),
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <select
          value={candidate ? candidateKey(candidate) : ""}
          onChange={(event) => setSelectedCandidateKey(event.target.value)}
          aria-label="공유할 내 리소스"
          className={CONTROL}
          disabled={!candidate}
        >
          {candidates.length === 0 ? <option value="">공유 가능한 로컬 자료 없음</option> : null}
          {candidates.map((item) => (
            <option key={candidateKey(item)} value={candidateKey(item)}>
              [{SHARE_KIND_LABEL[item.kind]}] {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRefreshToken((value) => value + 1)}
          aria-label="공유할 내 리소스 다시 읽기"
          className={CONTROL}
          data-studio-share-refresh={refreshToken}
        >
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 1_000))}
        placeholder="이 리소스의 용도와 특징을 설명해주세요."
        aria-label="공유 리소스 설명"
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
          aria-label="공유 라이선스"
          className={CONTROL}
        >
          <option value="toonspectrum-standard">표준 · 파일 재배포 금지</option>
          <option value="cc0-1.0">CC0 · 제한 없이 허용</option>
          <option value="cc-by-4.0">CC BY · 출처 표시</option>
          <option value="cc-by-nc-4.0">CC BY-NC · 비상업</option>
        </select>
        <label className={cx(
          CONTROL,
          "flex cursor-pointer items-center justify-between gap-2",
        )}>
          <span>AI 생성·보조 포함</span>
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
          placeholder="작품 또는 배포 시 표시할 출처 문구"
          aria-label="출처 표시 문구"
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
        <span>제가 직접 제작했으며 게시·재배포할 권리를 보유합니다.</span>
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
        <span>다른 마켓 상품을 복제하거나 알아보기 어렵게 변형한 자료가 아닙니다.</span>
      </label>
      <button type="submit" disabled={!ready} className={cx("w-full", PRIMARY)}>
        {publishing
          ? <LoaderCircle size={14} className="mr-1 inline animate-spin" aria-hidden />
          : <Send size={14} className="mr-1 inline" aria-hidden />}
        무료 공유 마켓에 게시
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
        setError(errorText(caught, "온라인 공유 마켓을 불러오지 못했습니다."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, open, query, reloadToken, view]);

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
      setError(errorText(caught, "다음 공유 리소스를 불러오지 못했습니다."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function deleteRecord(record: CreatorMarketplaceResourceRecord) {
    setStatus(null);
    try {
      await deleteCreatorMarketplaceResource(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setStatus({ message: `"${record.name}" 공유를 삭제했습니다.`, error: false });
    } catch (caught) {
      setStatus({
        message: errorText(caught, "공유 리소스를 삭제하지 못했습니다."),
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
      aria-label="온라인 Creator 공유 마켓"
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
            <strong className="block text-xs text-fg">온라인 Creator 공유</strong>
            <span className="mt-0.5 block truncate text-[0.58rem] text-fg-3">
              공개 탐색 · 실제 설치 · 내 자료 게시
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
            <div role="tablist" aria-label="온라인 공유 보기" className="grid grid-cols-3 gap-1">
              {([
                ["community", "공개 마켓"],
                ["mine", "내 공유"],
                ["share", "자료 게시"],
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
                  <label htmlFor={searchId} className="sr-only">온라인 공유 검색</label>
                  <div className="relative">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
                    <input
                      id={searchId}
                      type="search"
                      value={queryDraft}
                      onChange={(event) => setQueryDraft(event.target.value.slice(0, 120))}
                      placeholder="이름·설명·태그 검색"
                      className={cx("w-full pl-9 pr-11", CONTROL)}
                    />
                    {queryDraft ? (
                      <button
                        type="button"
                        onClick={() => {
                          setQueryDraft("");
                          setQuery("");
                        }}
                        aria-label="온라인 공유 검색어 지우기"
                        className={cx(
                          "absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised",
                          FOCUS,
                        )}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <button type="submit" className={PRIMARY}>검색</button>
                </form>
                <div className="mt-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {KIND_OPTIONS.map(({ id, label, Icon }) => (
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
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[0.57rem] text-fg-3">
                  <span>{loading ? "불러오는 중…" : `${records.length}개 표시`}</span>
                  <button
                    type="button"
                    onClick={() => setReloadToken((value) => value + 1)}
                    aria-label="온라인 공유 목록 새로고침"
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
                        <p className="mt-1 text-[0.55rem] text-fg-3">로그인이 필요한 보기일 수 있습니다.</p>
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
                    조건에 맞는 공유 리소스가 없습니다.
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
                    더 불러오기
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
