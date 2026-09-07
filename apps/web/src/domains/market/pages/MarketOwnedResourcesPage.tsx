import {
  ArrowUpRight,
  Eye,
  EyeOff,
  LoaderCircle,
  PackagePlus,
  Palette,
  RefreshCw,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { marketAuthorityErrorMessage } from "../models/market-authority";
import {
  formatMarketByteSize,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type { CreatorMarketplaceOwnedRelease } from "@/shared/lib/creator-marketplace-resource-contract";

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
  deleteCreatorMarketplaceResource,
  listCreatorMarketplaceOwnedHeads,
  relistCreatorMarketplaceResource,
} from "@/src/infrastructure/creator-marketplace-client";

const PAGE_SIZE = 20;
type LoadState = "idle" | "loading" | "ready" | "error";

function releaseStatus(item: CreatorMarketplaceOwnedRelease) {
  if (item.packageModeration.state === "hidden") {
    return {
      label: "관리자 숨김",
      className: "bg-bad/15 text-bad",
      detail: "관리자 검수로 공개 카탈로그와 Studio 진입이 차단되었습니다.",
    };
  }
  if (item.delistedAt) {
    return {
      label: "비공개",
      className: "bg-warn/15 text-warn",
      detail: "제작자가 공개 목록에서 내린 상태입니다.",
    };
  }
  return {
    label: "공개 중",
    className: "bg-good/15 text-good",
    detail: "현재 패키지의 공개 head입니다.",
  };
}

export function MarketManagePage() {
  useDocumentTitle("판매자 센터 · 툰스튜디오 에셋");
  useMetaDescription(
    "서버에 게시한 immutable 에셋 릴리스의 공개 상태와 버전 이력을 관리하세요.",
  );

  const { data: session, ready, status: sessionStatus } = useSession();
  const userId = ready && sessionStatus === "authenticated"
    ? session.user.id
    : null;
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [items, setItems] = useState<readonly CreatorMarketplaceOwnedRelease[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const generationRef = useRef(0);
  const firstPageControllerRef = useRef<AbortController | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessage(null);
  }, [userId]);

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
    setPendingId(null);
    setError(null);
    setLoadedUserId(userId);

    if (!ready || !userId) {
      setLoadState("idle");
      return undefined;
    }

    const controller = new AbortController();
    firstPageControllerRef.current = controller;
    setLoadState("loading");
    void listCreatorMarketplaceOwnedHeads({ limit: PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        const nextCursor = page.nextCursor ?? null;
        setItems(page.items);
        setCursor(nextCursor);
        setHasMore(page.hasMore && nextCursor !== null);
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setLoadState("error");
        setError(marketAuthorityErrorMessage(caught, "게시한 에셋을 불러오지 못했습니다."));
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
  }, [ready, reloadToken, userId]);

  const visibleItems = loadedUserId === userId ? items : [];
  const visibleLoadState: LoadState = !userId
    ? "idle"
    : loadedUserId === userId
      ? loadState
      : "loading";

  async function loadMore(): Promise<void> {
    if (!userId || loadedUserId !== userId || !cursor || loadingMore) return;
    const generation = generationRef.current;
    const requestCursor = cursor;
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setError(null);

    try {
      const page = await listCreatorMarketplaceOwnedHeads({
        limit: PAGE_SIZE,
        cursor: requestCursor,
      }, controller.signal);
      if (
        controller.signal.aborted
        || generationRef.current !== generation
        || loadedUserId !== userId
      ) return;
      const nextCursor = page.nextCursor ?? null;
      setItems((current) => {
        const known = new Set(current.map((item) => item.resource.id));
        return [...current, ...page.items.filter((item) => !known.has(item.resource.id))];
      });
      setCursor(nextCursor);
      setHasMore(page.hasMore && nextCursor !== null);
    } catch (caught) {
      if (controller.signal.aborted || generationRef.current !== generation) return;
      setError(marketAuthorityErrorMessage(caught, "추가 게시 에셋을 불러오지 못했습니다."));
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

  async function toggleListing(item: CreatorMarketplaceOwnedRelease): Promise<void> {
    if (!userId || pendingId) return;
    const generation = generationRef.current;
    const record = item.resource;
    const relisting = item.delistedAt !== null;
    setPendingId(record.id);
    setError(null);

    try {
      if (relisting) await relistCreatorMarketplaceResource(record.id);
      else await deleteCreatorMarketplaceResource(record.id);
      if (generationRef.current !== generation) return;
      setMessage(relisting
        ? `“${record.name}”을(를) 공개 목록에 다시 올렸습니다.`
        : `“${record.name}”을(를) 공개 목록에서 내렸습니다. 기존 릴리스 이력은 유지됩니다.`);
      setReloadToken((value) => value + 1);
    } catch (caught) {
      if (generationRef.current !== generation) return;
      setError(marketAuthorityErrorMessage(
        caught,
        relisting
          ? "에셋을 다시 공개하지 못했습니다. 서버 상태는 변경되지 않았습니다."
          : "에셋을 공개 목록에서 내리지 못했습니다. 서버 상태는 변경되지 않았습니다.",
      ));
    } finally {
      if (generationRef.current === generation) setPendingId(null);
    }
  }

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <MarketNavHeader />

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow text-accent">Creator center</p>
          <div className="mt-1 flex items-center gap-2">
            <UserCheck className="size-5 text-accent" aria-hidden="true" />
            <h1 className="text-xl font-bold text-fg sm:text-2xl">판매자 센터</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
            서버가 보유한 패키지 head와 릴리스 상태만 표시합니다. 브라우저 임시
            레코드로 공개 상태나 immutable 버전을 변경하지 않습니다.
          </p>
        </div>
        <Link href="/market/publish" className={buttonClass({ variant: "solid", size: "sm" })}>
          <PackagePlus className="size-4" aria-hidden="true" />
          새 릴리스 게시
        </Link>
      </header>

      {!ready ? (
        <StatusCard />
      ) : !userId ? (
        <section className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <UserCheck className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-fg">
            로그인 후 게시한 에셋을 관리할 수 있어요
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            로그인하지 않은 브라우저 초안은 판매자 센터의 공개 에셋 수에 포함되지 않습니다.
          </p>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-2">
              현재 패키지 head{" "}
              <strong className="numeral tnum text-fg">{visibleItems.length}</strong>개 표시
            </p>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              disabled={visibleLoadState === "loading" || loadingMore}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (visibleLoadState === "loading" || loadingMore) && "animate-spin",
                )}
                aria-hidden="true"
              />
              새로고침
            </button>
          </div>

          {message ? (
            <p
              role="status"
              className="mt-4 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm text-good"
            >
              {message}
            </p>
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}

          {visibleLoadState === "loading" ? (
            <OwnedSkeleton />
          ) : visibleLoadState === "error" ? (
            <RetryCard onRetry={() => setReloadToken((value) => value + 1)} />
          ) : visibleItems.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-panel/50 p-10 text-center">
              <PackagePlus className="mx-auto size-10 text-fg-3" aria-hidden="true" />
              <h2 className="mt-3 text-base font-bold text-fg">서버에 게시한 에셋이 없어요</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">
                Studio에서 준비한 에셋을 서버에 게시하면 공개 상태와 버전을 이곳에서
                관리할 수 있습니다.
              </p>
              <Link
                href="/market/publish"
                className={buttonClass({ variant: "solid", size: "sm", className: "mt-4" })}
              >
                첫 릴리스 게시
              </Link>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
              {visibleItems.map((item) => {
                const record = item.resource;
                const kind = marketKindMeta(record.kind);
                const license = marketLicenseMeta(record.license);
                const statusMeta = releaseStatus(item);
                const KindIcon = kind.icon;
                const moderated = item.packageModeration.state === "hidden";
                const publiclyAvailable = !moderated && item.delistedAt === null;

                return (
                  <li
                    key={record.id}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                        <KindIcon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="min-w-0 truncate text-sm font-bold text-fg">
                            {record.name}
                          </h2>
                          <span className="numeral tnum rounded bg-accent/15 px-1.5 py-0.5 text-[0.62rem] font-bold text-accent">
                            v{record.resourceVersion}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[0.62rem] font-bold",
                              statusMeta.className,
                            )}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-fg-3">
                          {record.description || "설명 없음"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-fg-3">
                          <span>{kind.label}</span>
                          <span>{license.label}</span>
                          <span>{record.entries.length}개 항목</span>
                          <span>manifest {formatMarketByteSize(record.manifestByteSize)}</span>
                          <span>{statusMeta.detail}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={moderated || pendingId !== null}
                        onClick={() => void toggleListing(item)}
                        title={moderated
                          ? "관리자 숨김 상태는 제작자가 변경할 수 없습니다."
                          : undefined}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        {pendingId === record.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : item.delistedAt ? (
                          <Eye className="size-3.5" aria-hidden="true" />
                        ) : (
                          <EyeOff className="size-3.5" aria-hidden="true" />
                        )}
                        {item.delistedAt ? "재공개" : "공개 목록에서 내리기"}
                      </button>

                      {publiclyAvailable ? (
                        <>
                          <Link
                            href={`/market/resource/${record.id}`}
                            className={buttonClass({ variant: "ghost", size: "sm" })}
                          >
                            상세
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                          </Link>
                          <Link
                            href={marketStudioResourceHref(record.id)}
                            className={buttonClass({ variant: "ghost", size: "sm" })}
                          >
                            <Palette className="size-3.5" aria-hidden="true" />
                            Studio
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore || visibleLoadState !== "ready"}
                className={buttonClass({ variant: "outline", size: "sm" })}
              >
                {loadingMore ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {loadingMore ? "불러오는 중" : "더 보기"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </Container>
  );
}

function StatusCard() {
  return (
    <div role="status" className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
      <LoaderCircle className="mx-auto size-8 animate-spin text-accent" aria-hidden="true" />
      <p className="mt-3 text-sm text-fg-2">계정과 판매자 데이터를 확인하고 있습니다.</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-fg"
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function RetryCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
      <ShieldAlert className="mx-auto size-9 text-bad" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-fg">판매자 데이터를 불러오지 못했습니다</h2>
      <button
        type="button"
        onClick={onRetry}
        className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
      >
        다시 시도
      </button>
    </div>
  );
}

function OwnedSkeleton() {
  return (
    <div aria-hidden="true" className="mt-6 space-y-2">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl border border-line bg-panel"
        />
      ))}
    </div>
  );
}
