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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { marketAuthorityErrorMessage } from "../models/market-authority";
import { marketKindMeta } from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type {
  CreatorMarketplaceCloudLibraryItem,
  CreatorMarketplaceCloudLibraryView,
} from "@/shared/lib/creator-marketplace-cloud-library-contract";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/src/hooks/use-document-title";
import {
  listCreatorMarketplaceCloudLibrary,
  setCreatorMarketplaceCloudLibraryArchived,
} from "@/src/infrastructure/creator-marketplace-client";

const PAGE_SIZE = 50;
type LoadState = "idle" | "loading" | "ready" | "error";

function catalogMessage(item: CreatorMarketplaceCloudLibraryItem): string {
  if (item.catalog.state === "unavailable") {
    return {
      moderated: "관리자 검수로 현재 사용할 수 없음",
      "owner-delisted": "제작자가 공개 목록에서 내림",
      "publisher-unavailable": "제작자 계정을 사용할 수 없음",
      removed: "현재 카탈로그에서 제거됨",
    }[item.catalog.reason];
  }
  if (item.updateState === "account-confirmed-update-available") {
    const installed = item.confirmation.state === "confirmed"
      ? item.confirmation.resourceVersion
      : "확인되지 않음";
    return `계정 설치 확인 ${installed} → 최신 ${item.catalog.head.resourceVersion}`;
  }
  if (item.updateState === "account-confirmed-current-head") {
    return `이 계정에서 Studio v${item.catalog.head.resourceVersion} 설치 확인`;
  }
  return "이 계정에서 확인된 Studio 설치 없음";
}

export function MarketLibraryPage() {
  useDocumentTitle("내 에셋 · 툰스튜디오 에셋");
  useMetaDescription(
    "계정에 소장한 마켓 에셋과 Studio 설치 확인, 업데이트 가능 상태를 서버 기준으로 관리하세요.",
  );

  const { data: session, ready, status: sessionStatus } = useSession();
  const userId = ready && sessionStatus === "authenticated"
    ? session.user.id
    : null;
  const [view, setView] = useState<CreatorMarketplaceCloudLibraryView>("active");
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
          "계정 라이브러리를 불러오지 못했습니다.",
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
  }, [contextKey, ready, reloadToken, userId, view]);

  const visibleItems = loadedContextKey === contextKey ? items : [];
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
        "추가 소장 에셋을 불러오지 못했습니다.",
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
  ): Promise<void> {
    if (!userId || !contextKey || pendingItemId) return;
    const generation = generationRef.current;
    setPendingItemId(item.id);
    setError(null);
    try {
      await setCreatorMarketplaceCloudLibraryArchived(item.id, archived);
      if (generationRef.current !== generation) return;
      setMessage(archived
        ? "계정 라이브러리의 보관 목록으로 이동했습니다. 소장 권한과 로컬 설치는 유지됩니다."
        : "계정 라이브러리의 소장 목록으로 복원했습니다.");
      setReloadToken((value) => value + 1);
    } catch (caught) {
      if (generationRef.current !== generation) return;
      setError(marketAuthorityErrorMessage(
        caught,
        archived
          ? "계정 라이브러리에 보관하지 못했습니다."
          : "계정 라이브러리로 복원하지 못했습니다.",
      ));
    } finally {
      if (generationRef.current === generation) setPendingItemId(null);
    }
  }

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <MarketNavHeader />

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow text-accent">Account library</p>
          <div className="mt-1 flex items-center gap-2">
            <Cloud className="size-5 text-accent" aria-hidden="true" />
            <h1 className="text-xl font-bold text-fg sm:text-2xl">내 에셋</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
            서버 계정 라이브러리를 소장 권한의 기준으로 사용합니다. 계정 설치 확인은
            현재 기기 설치와 다르며, 어느 기기에서든 정확한 릴리스를 설치한 증거입니다.
          </p>
        </div>
        <Link href="/market/browse" className={buttonClass({ variant: "outline", size: "sm" })}>
          에셋 더 찾기
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      {!ready ? (
        <StatusCard icon={LoaderCircle} spin text="로그인 세션 확인 중" />
      ) : !userId ? (
        <section className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <Cloud className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-fg">로그인 후 계정 라이브러리를 사용할 수 있어요</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            브라우저 저장소는 소장 권한을 만들지 않습니다. 로그인 계정에 서버가 기록한 항목만 표시됩니다.
          </p>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="내 에셋 보기" className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1">
              {(["active", "archived"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  aria-selected={view === candidate}
                  onClick={() => setView(candidate)}
                  className={cn(
                    "min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors",
                    view === candidate
                      ? "bg-accent text-on-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {candidate === "active" ? "소장" : "보관됨"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              disabled={visibleLoadState === "loading"}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <RefreshCw className={cn("size-3.5", visibleLoadState === "loading" && "animate-spin")} aria-hidden="true" />
              새로고침
            </button>
          </div>

          {message ? <p role="status" className="mt-4 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm text-good">{message}</p> : null}
          {error ? <ErrorBanner message={error} /> : null}

          {visibleLoadState === "loading" ? (
            <LibrarySkeleton />
          ) : visibleLoadState === "error" ? (
            <RetryCard title="계정 라이브러리를 확인할 수 없어요" onRetry={() => setReloadToken((value) => value + 1)} />
          ) : visibleItems.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-panel/50 p-10 text-center">
              <FolderOpen className="mx-auto size-10 text-fg-3" aria-hidden="true" />
              <h2 className="mt-3 text-base font-bold text-fg">
                {view === "active" ? "소장한 에셋이 없어요" : "보관된 에셋이 없어요"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">
                {view === "active"
                  ? "마켓 상세에서 계정 라이브러리에 추가한 에셋이 여기에 표시됩니다."
                  : "숨긴 에셋은 소장 권한을 유지한 채 이곳에서 복원할 수 있습니다."}
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((item) => {
                const kind = marketKindMeta(item.kind);
                const KindIcon = kind.icon;
                const head = item.catalog.state === "available" ? item.catalog.head : null;
                return (
                  <li key={item.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                          <KindIcon className="size-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-semibold text-accent">{kind.label}</p>
                          <h2 className="mt-0.5 line-clamp-2 text-sm font-bold text-fg">{item.name}</h2>
                        </div>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[0.62rem] font-bold",
                        head ? "bg-good/15 text-good" : "bg-warn/15 text-warn",
                      )}>
                        {head ? "사용 가능" : "사용 불가"}
                      </span>
                    </div>

                    <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-fg-3">추가한 버전</dt>
                        <dd className="numeral tnum text-right font-medium text-fg">v{item.addedFrom.resourceVersion}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-fg-3">현재 상태</dt>
                        <dd className="text-right font-medium text-fg">{catalogMessage(item)}</dd>
                      </div>
                    </dl>

                    <div className="mt-auto grid gap-2 pt-5">
                      {head ? (
                        <Link href={marketStudioResourceHref(head.id)} className={buttonClass({ variant: "solid", size: "sm", className: "w-full" })}>
                          <Palette className="size-3.5" aria-hidden="true" />
                          {item.updateState === "account-confirmed-update-available"
                            ? `Studio에서 v${head.resourceVersion} 업데이트`
                            : "Studio에서 열기"}
                        </Link>
                      ) : (
                        <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-fg-2">
                          {catalogMessage(item)}
                        </div>
                      )}
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
                        {view === "active" ? "목록에서 보관" : "소장 목록으로 복원"}
                      </button>
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
                {loadingMore ? "불러오는 중" : "더 보기"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </Container>
  );
}

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
  return (
    <div className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
      <ShieldAlert className="mx-auto size-10 text-bad" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-fg">{title}</h2>
      <button type="button" onClick={onRetry} className={buttonClass({ variant: "solid", size: "sm", className: "mt-4" })}>
        다시 시도
      </button>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div role="status" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
