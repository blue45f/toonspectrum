import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Cloud,
  FolderOpen,
  LoaderCircle,
  Palette,
  RefreshCw,
  ShieldAlert,
  SearchX,
  Undo2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { MarketAccountEntryActions } from "../components/MarketAccountEntryActions";
import { MarketDeviceInstallStatus } from "../components/MarketDeviceInstallStatus";
import { MarketLibraryExplorerToolbar } from "../components/MarketLibraryExplorerToolbar";
import { DEFAULT_LIBRARY_FILTERS, exploreMarketLibrary } from "../models/market-library-explorer";
import type { MarketLibraryFilters } from "../models/market-library-explorer";
import type { MarketLayout } from "../components/MarketViewToggle";
import "../components/market-atelier.css";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { useMarketDeviceInstall } from "../hooks/use-market-device-install";
import { marketAuthorityErrorMessage } from "../models/market-authority";
import { formatMarketDate, marketKindMeta } from "../models/market-kind";
import { useMarketStudioHandoff } from "../hooks/use-market-studio-handoff";

import type {
  CreatorMarketplaceCloudLibraryItem,
  CreatorMarketplaceCloudLibraryView,
} from "@/shared/lib/creator-marketplace-cloud-library-contract";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";
import {
  listCreatorMarketplaceCloudLibrary,
  setCreatorMarketplaceCloudLibraryArchived,
} from "@/platform/creator-marketplace-client";

const PAGE_SIZE = 50;
type LoadState = "idle" | "loading" | "ready" | "error";

function catalogMessage(
  item: CreatorMarketplaceCloudLibraryItem,
  t: (ko: string, en: string) => string,
): string {
  if (item.catalog.state === "unavailable") {
    return {
      moderated: t("관리자 검수로 현재 사용할 수 없음", "Currently unavailable due to admin review"),
      "owner-delisted": t("제작자가 공개 목록에서 내림", "Delisted from the public list by the creator"),
      "publisher-unavailable": t("제작자 계정을 사용할 수 없음", "Creator account unavailable"),
      removed: t("현재 카탈로그에서 제거됨", "Removed from the current catalog"),
    }[item.catalog.reason];
  }
  if (item.updateState === "account-confirmed-update-available") {
    const installed = item.confirmation.state === "confirmed"
      ? item.confirmation.resourceVersion
      : t("확인되지 않음", "unconfirmed");
    return t(
      `계정 이력 · 설치 확인 ${installed} → 최신 ${item.catalog.head.resourceVersion}`,
      `Account history · install confirmed ${installed} → latest ${item.catalog.head.resourceVersion}`,
    );
  }
  if (item.updateState === "account-confirmed-current-head") {
    return t(
      `계정 이력 · Studio v${item.catalog.head.resourceVersion} 설치 확인`,
      `Account history · Studio v${item.catalog.head.resourceVersion} install confirmed`,
    );
  }
  return t("계정 이력 · 확인된 Studio 설치 없음", "Account history · no confirmed Studio install");
}

type MarketCloudLibraryCatalogHead = Extract<
  CreatorMarketplaceCloudLibraryItem["catalog"],
  { readonly state: "available" }
>["head"];

function MarketCloudLibraryDeviceAction({
  logicalPackId,
  record,
}: {
  readonly logicalPackId: string;
  readonly record: MarketCloudLibraryCatalogHead;
}) {
  const deviceInstall = useMarketDeviceInstall({
    logicalPackId,
    kind: record.kind,
    resourceVersion: record.resourceVersion,
    manifestHash: record.manifestHash,
  });
  const handoff = useMarketStudioHandoff(record, deviceInstall.state);
  return (
    <>
      <MarketDeviceInstallStatus
        record={record}
        snapshot={deviceInstall}
        compact
      />
      <Link
        href={handoff.href}
        className={buttonClass({ variant: "solid", size: "sm", className: "w-full" })}
      >
        <Palette className="size-3.5" aria-hidden="true" />
        {handoff.actionLabel}
      </Link>
    </>
  );
}

export function MarketCloudLibraryPage({ embedded = false }: { readonly embedded?: boolean } = {}) {
  const t = useBilingual("MarketCloudLibraryPage");
  useDocumentTitle(t("내 에셋 · 툰스튜디오 에셋", "My assets · ToonStudio Assets"));
  useMetaDescription(
    t(
      "계정에 소장한 마켓 에셋과 Studio 설치 확인, 업데이트 가능 상태를 서버 기준으로 관리하세요.",
      "Manage the market assets owned by your account, Studio install confirmations, and update availability against the server.",
    ),
  );

  const { data: session, ready, status: sessionStatus } = useSession();
  const userId = ready && sessionStatus === "authenticated"
    ? session.user.id
    : null;
  const [view, setView] = useState<CreatorMarketplaceCloudLibraryView>("active");
  const [filters, setFilters] = useState<MarketLibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [layout, setLayout] = useState<MarketLayout>("grid");
  const tabId = useId();
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [undoAction, setUndoAction] = useState<{
    item: CreatorMarketplaceCloudLibraryItem; archived: boolean; contextKey: string;
  } | null>(null);
  const contextKey = userId ? `${userId}:${view}` : null;
  const [loadedContextKey, setLoadedContextKey] = useState<string | null>(null);
  const [items, setItems] = useState<readonly CreatorMarketplaceCloudLibraryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const generationRef = useRef(0);
  const firstPageControllerRef = useRef<AbortController | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessage(null);
    setUndoAction(null);
  }, [contextKey]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    firstPageControllerRef.current?.abort();
    loadMoreControllerRef.current?.abort();
    firstPageControllerRef.current = null;
    loadMoreControllerRef.current = null;
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setLoadingMore(false);
    setPendingItemId(null);
    setError(null);
    setLoadedContextKey(contextKey);

    if (!ready || !userId || !contextKey) {
      setLoadState("idle");
      return undefined;
    }

    const controller = new AbortController();
    firstPageControllerRef.current = controller;
    setLoadState("loading");
    void listCreatorMarketplaceCloudLibrary({ view, limit: PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setLoadState("error");
        setError(marketAuthorityErrorMessage(
          caught,
          t("계정 라이브러리를 불러오지 못했습니다.", "Could not load your account library."),
        ));
      })
      .finally(() => {
        if (firstPageControllerRef.current === controller) {
          firstPageControllerRef.current = null;
        }
      });

    return () => {
      controller.abort();
      loadMoreControllerRef.current?.abort();
      if (firstPageControllerRef.current === controller) {
        firstPageControllerRef.current = null;
      }
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [contextKey, ready, reloadToken, userId, view, t]);

  const visibleItems = loadedContextKey === contextKey ? items : [];
  const exploredItems = exploreMarketLibrary(visibleItems, filters);
  const visibleUndo = undoAction?.contextKey === contextKey ? undoAction : null;
  const visibleLoadState: LoadState = !userId
    ? "idle"
    : loadedContextKey === contextKey
      ? loadState
      : "loading";

  async function loadMore(): Promise<void> {
    if (
      !userId
      || !contextKey
      || loadedContextKey !== contextKey
      || !cursor
      || loadingMore
    ) return;
    const generation = generationRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listCreatorMarketplaceCloudLibrary({
        view,
        limit: PAGE_SIZE,
        cursor,
      }, controller.signal);
      if (
        controller.signal.aborted
        || generationRef.current !== generation
        || loadedContextKey !== contextKey
      ) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      if (controller.signal.aborted || generationRef.current !== generation) return;
      setError(marketAuthorityErrorMessage(
        caught,
        t("추가 소장 에셋을 불러오지 못했습니다.", "Could not load more owned assets."),
      ));
    } finally {
      if (
        generationRef.current === generation
        && loadMoreControllerRef.current === controller
      ) {
        loadMoreControllerRef.current = null;
        setLoadingMore(false);
      }
    }
  }

  async function setArchived(
    item: CreatorMarketplaceCloudLibraryItem,
    archived: boolean,
    allowUndo = true,
  ): Promise<void> {
    if (!userId || !contextKey || pendingItemId) return;
    const generation = generationRef.current;
    setPendingItemId(item.id);
    setError(null);
    try {
      const receipt = await setCreatorMarketplaceCloudLibraryArchived(item.id, archived);
      if (generationRef.current !== generation) return;
      setUndoAction(allowUndo && receipt.changed ? { item, archived: !archived, contextKey } : null);
      setMessage(!receipt.changed
        ? t("이미 요청한 상태입니다. 최신 목록을 다시 확인했습니다.", "Already in the requested state. The latest list was rechecked.")
        : archived
          ? t("계정 라이브러리의 보관 목록으로 이동했습니다. 소장 권한과 로컬 설치는 유지됩니다.", "Moved to the archived list of your account library. Ownership and local installs are kept.")
          : t("계정 라이브러리의 소장 목록으로 복원했습니다.", "Restored to the owned list of your account library."));
      setReloadToken((value) => value + 1);
    } catch (caught) {
      if (generationRef.current !== generation) return;
      setError(marketAuthorityErrorMessage(
        caught,
        archived
          ? t("계정 라이브러리에 보관하지 못했습니다.", "Could not archive in your account library.")
          : t("계정 라이브러리로 복원하지 못했습니다.", "Could not restore to your account library."),
      ));
    } finally {
      if (generationRef.current === generation) setPendingItemId(null);
    }
  }

  return (
    <Container size="wide" className="market-library-page py-7 sm:py-10">
      {!embedded ? <MarketNavHeader /> : null}

      <header className="market-library-header">
        <div>
          <p className="eyebrow text-accent">MY MATERIAL SHELF</p>
          <div className="mt-1 flex items-center gap-2">
            <Cloud className="size-5 text-accent" aria-hidden="true" />
            <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t("내 에셋", "My assets")}</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
            {t("찾아둔 재료를 다음 작품으로 이어가세요. 소재를 검색하고 정리한 뒤, 종류에 맞는 Studio 작업 공간에서 사용할 수 있습니다.", "Carry the materials you've found into your next work. Search and organize materials, then use them in the Studio workspace that fits their kind.")}
          </p>
        </div>
        <Link href="/market/browse" className={buttonClass({ variant: "outline", size: "sm" })}>
          {t("에셋 더 찾기", "Find more assets")}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>
      <details className="market-library-explainer">
        <summary>{t("소장 · 기기 설치 · 보관은 어떻게 다른가요?", "How do owning, device install, and archiving differ?")}</summary>
        <div><p><strong>{t("소장", "Owning")}</strong>{t("은 로그인 계정에 저장된 권한입니다. 기기를 바꿔도 같은 계정에서 확인할 수 있습니다.", " is a right stored on your login account. It stays available on the same account even if you change devices.")}</p>
          <p><strong>{t("설치", "Install")}</strong>{t("는 이 기기·브라우저에서 확인합니다. 계정의 과거 설치 이력만으로 현재 기기에 설치됐다고 표시하지 않습니다.", " is confirmed on this device and browser. Past install history on the account alone does not mark it as installed on the current device.")}</p>
          <p><strong>{t("보관", "Archiving")}</strong>{t("은 목록을 정리하는 기능입니다. 소장 권한이나 설치 파일을 삭제하지 않으며 언제든 복원할 수 있습니다.", " only tidies up the list. It never deletes ownership rights or installed files and can be restored at any time.")}</p></div>
      </details>

      {!ready ? (
        <StatusCard icon={LoaderCircle} spin text={t("로그인 세션 확인 중", "Checking login session")} />
      ) : !userId ? (
        <section className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <Cloud className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-fg">{t("로그인 후 계정 라이브러리를 사용할 수 있어요", "Use your account library after logging in")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            {t("이 화면에서 로그인하거나 회원가입한 뒤 소장한 소재를 확인하세요. 찜 목록은 소장 권한과 별도로 관리됩니다.", "Log in or sign up here, then check your owned materials. The wishlist is managed separately from ownership.")}
          </p>
          <MarketAccountEntryActions source="market-library" />
          <Link href="/studio/assets?view=essentials" className="mt-3 inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4">{t("로그인 없이 무료 제작 소재 둘러보기", "Browse free creation materials without logging in")}</Link>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div ref={tabsRef} role="tablist" tabIndex={-1} aria-label={t("내 에셋 보기", "My assets views")}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "active" : event.key === "End" ? "archived" : view === "active" ? "archived" : "active";
                setView(next);
                tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next === "active" ? 0 : 1]?.focus();
              }} className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1">
              {(["active", "archived"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  id={`${tabId}-${candidate}`}
                  aria-controls={`${tabId}-panel`}
                  tabIndex={view === candidate ? 0 : -1}
                  aria-selected={view === candidate}
                  onClick={() => setView(candidate)}
                  className={cn(
                    "min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors",
                    view === candidate
                      ? "bg-accent text-on-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {candidate === "active" ? t("소장", "Owned") : t("보관됨", "Archived")}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              disabled={visibleLoadState === "loading" || pendingItemId !== null}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <RefreshCw className={cn("size-3.5", visibleLoadState === "loading" && "animate-spin")} aria-hidden="true" />
              {t("새로고침", "Refresh")}
            </button>
          </div>

          <section role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${view}`} tabIndex={0} className="market-library-panel">
          {visibleLoadState === "ready" ? <MarketLibraryExplorerToolbar
            items={visibleItems} resultCount={exploredItems.length} hasMore={hasMore}
            filters={filters} onChange={setFilters} layout={layout} onLayoutChange={setLayout} /> : null}
          {message ? <div role="status" className="mt-4 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm text-good">
            <p>{message}</p>
            {visibleUndo ? <button type="button" disabled={pendingItemId !== null || visibleLoadState === "loading"}
              onClick={() => void setArchived(visibleUndo.item, visibleUndo.archived, false)}
              className={buttonClass({ variant: "outline", size: "sm", className: "mt-2" })}>
              <Undo2 className="size-4" aria-hidden="true" />{t("방금 작업 실행 취소", "Undo last action")}
            </button> : null}
          </div> : null}
          {error ? <ErrorBanner message={error} /> : null}

          {visibleLoadState === "loading" ? (
            <LibrarySkeleton />
          ) : visibleLoadState === "error" ? (
            <RetryCard title={t("계정 라이브러리를 확인할 수 없어요", "Could not check your account library")} onRetry={() => setReloadToken((value) => value + 1)} />
          ) : visibleItems.length === 0 ? (
            <ActionableEmptyState
              art="library"
              icon={FolderOpen}
              title={view === "active" ? t("소장한 에셋이 없어요", "No owned assets yet") : t("보관된 에셋이 없어요", "No archived assets")}
              description={
                view === "active"
                  ? t("마켓 상세에서 계정 라이브러리에 추가한 에셋이 여기에 표시됩니다.", "Assets you added to your account library from market details will appear here.")
                  : t("숨긴 에셋은 소장 권한을 유지한 채 이곳에서 복원할 수 있습니다.", "Hidden assets keep their ownership rights and can be restored here.")
              }
              primary={{ href: "/market", label: t("마켓 둘러보기", "Browse the market") }}
              className="mt-8"
            />
          ) : exploredItems.length === 0 ? (
            <div className="market-library-empty">
              <SearchX className="mx-auto size-9 text-fg-3" aria-hidden="true" />
              <h2>{t("불러온 에셋에서 일치하는 소재를 찾지 못했어요", "No matching materials in the loaded assets")}</h2>
              <p>{hasMore ? t("아직 확인하지 않은 에셋이 있습니다. 아래에서 더 불러오거나 검색 조건을 줄여보세요.", "There are assets you haven't checked yet. Load more below or loosen your search filters.") : t("이름을 짧게 입력하거나 종류·상태 필터를 해제해 보세요.", "Try a shorter name or clear the kind and status filters.")}</p>
              <button type="button" onClick={() => setFilters(DEFAULT_LIBRARY_FILTERS)}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>{t("검색 조건 모두 해제", "Clear all search filters")}</button>
            </div>
          ) : (
            <ul aria-label={t("내 에셋 목록", "My assets list")} className={`market-library-results market-library-results--${layout}`}>
              {exploredItems.map((item, index) => {
                const kind = marketKindMeta(item.kind);
                const KindIcon = kind.icon;
                const head = item.catalog.state === "available" ? item.catalog.head : null;
                return (
                  <li key={item.id} className="market-library-card" {...introItemProps(index)}>
                    <div className="market-library-card__cover" aria-hidden="true">
                      <KindIcon strokeWidth={1.2} /><span>{kind.english}</span>
                    </div>
                    <div className="market-library-card__body">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                          <KindIcon className="size-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-semibold text-accent">{kind.label}</p>
                          <h2 className="mt-0.5 line-clamp-2 text-sm font-bold text-fg">{head ? <Link href={`/market/resource/${encodeURIComponent(head.id)}`} className="hover:text-accent">{item.name}</Link> : item.name}</h2>
                          <p className="mt-1 text-xs text-fg-3"><time dateTime={item.addedAt}>{formatMarketDate(item.addedAt)}</time> {t("추가", "added")}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[0.62rem] font-bold",
                        head ? "bg-good/15 text-fg" : "bg-warn/15 text-fg",
                      )}>
                        {head ? t("마켓 공개 중", "Listed on market") : t("마켓 비공개", "Unlisted on market")}
                      </span>
                    </div>

                    <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-fg-3">{t("추가한 버전", "Added version")}</dt>
                        <dd className="numeral tnum text-right font-medium text-fg">v{item.addedFrom.resourceVersion}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-fg-3">{t("현재 상태", "Current status")}</dt>
                        <dd className="text-right font-medium text-fg">{catalogMessage(item, t)}</dd>
                      </div>
                    </dl>

                    <div className="market-library-card__actions mt-auto grid gap-2 pt-5">
                      {head ? (
                        <MarketCloudLibraryDeviceAction
                          logicalPackId={item.logicalPackId}
                          record={head}
                        />
                      ) : (
                        <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-fg-2">
                          {catalogMessage(item, t)}
                        </div>
                      )}
                      {head ? <Link href={`/market/resource/${encodeURIComponent(head.id)}`}
                        className="inline-flex min-h-11 items-center justify-center gap-1 text-xs font-semibold text-accent underline underline-offset-4">{t("미리보기·사용권 확인", "Preview & license")}<ArrowRight className="size-3.5" aria-hidden="true" /></Link> : null}
                      <button
                        type="button"
                        disabled={pendingItemId !== null}
                        onClick={() => void setArchived(item, view === "active")}
                        className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
                      >
                        {pendingItemId === item.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : view === "active" ? (
                          <Archive className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArchiveRestore className="size-3.5" aria-hidden="true" />
                        )}
                        {view === "active" ? t("목록에서 보관", "Archive from list") : t("소장 목록으로 복원", "Restore to owned list")}
                      </button>
                    </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {visibleLoadState === "ready" && hasMore ? (
            <div className="mt-8 text-center">
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={buttonClass({ variant: "outline", size: "md" })}>
                {loadingMore ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                {loadingMore ? t("불러오는 중", "Loading") : t("더 보기", "Load more")}
              </button>
            </div>
          ) : null}
          </section>
        </>
      )}
    </Container>
  );
}

/**
 * 기존 creator 소비자를 위한 호환 export. 신규 코드는 MarketCloudLibraryPage를 사용하세요.
 * @deprecated Use {@link MarketCloudLibraryPage} instead.
 */
export const MarketLibraryPage = MarketCloudLibraryPage;

function StatusCard({ icon: Icon, text, spin = false }: { icon: typeof LoaderCircle; text: string; spin?: boolean }) {
  return (
    <div role="status" className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-line bg-card p-8 text-sm text-fg-2">
      <Icon className={cn("size-4", spin && "animate-spin")} aria-hidden="true" />
      {text}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-fg">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function RetryCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  const t = useBilingual("MarketCloudLibraryPage.RetryCard");
  return (
    <div className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
      <ShieldAlert className="mx-auto size-10 text-bad" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-fg">{title}</h2>
      <button type="button" onClick={onRetry} className={buttonClass({ variant: "solid", size: "sm", className: "mt-4" })}>
        {t("다시 시도", "Try again")}
      </button>
    </div>
  );
}

function LibrarySkeleton() {
  const t = useBilingual("MarketCloudLibraryPage.LibrarySkeleton");
  return (
    <div role="status" aria-label={t("소장 에셋을 불러오는 중", "Loading owned assets")} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} aria-hidden="true" className="rounded-xl border border-line bg-card p-4">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton mt-3 h-3 w-full" />
          <div className="skeleton mt-2 h-3 w-4/5" />
          <div className="skeleton mt-6 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
