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
import { useCallback, useEffect, useState } from "react";

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

function releaseStatus(item: CreatorMarketplaceOwnedRelease): {
  label: string;
  className: string;
  detail: string;
} {
  if (item.packageModeration.state === "hidden") {
    return {
      label: "관리자 숨김",
      className: "bg-bad/15 text-bad",
      detail: "관리자 검수로 패키지가 공개 카탈로그에서 숨겨졌습니다.",
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

  const { ready, status } = useSession();
  const authenticated = ready && status === "authenticated";
  const [items, setItems] = useState<readonly CreatorMarketplaceOwnedRelease[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const loadFirstPage = useCallback(async (signal?: AbortSignal) => {
    if (!authenticated) return;
    setLoadState("loading");
    setError(null);
    try {
      const page = await listCreatorMarketplaceOwnedHeads({ limit: PAGE_SIZE }, signal);
      if (signal?.aborted) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setLoadState("ready");
    } catch (caught) {
      if (signal?.aborted) return;
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setLoadState("error");
      setError(marketAuthorityErrorMessage(
        caught,
        "게시한 에셋을 불러오지 못했습니다.",
      ));
    }
  }, [authenticated]);

  useEffect(() => {
    if (!ready || !authenticated) {
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setLoadState("idle");
      return;
    }
    const controller = new AbortController();
    void loadFirstPage(controller.signal);
    return () => controller.abort();
  }, [authenticated, loadFirstPage, ready, reloadToken]);

  async function loadMore(): Promise<void> {
    if (!authenticated || !cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listCreatorMarketplaceOwnedHeads({
        limit: PAGE_SIZE,
        cursor,
      });
      setItems((current) => {
        const known = new Set(current.map((item) => item.resource.id));
        return [
          ...current,
          ...page.items.filter((item) => !known.has(item.resource.id)),
        ];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(marketAuthorityErrorMessage(
        caught,
        "추가 게시 에셋을 불러오지 못했습니다.",
      ));
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleListing(item: CreatorMarketplaceOwnedRelease): Promise<void> {
    if (pendingId) return;
    const resource = item.resource;
    const relisting = item.delistedAt !== null;
    setPendingId(resource.id);
    setError(null);
    setMessage(null);
    try {
      if (relisting) {
        await relistCreatorMarketplaceResource(resource.id);
      } else {
        await deleteCreatorMarketplaceResource(resource.id);
      }
      setMessage(relisting
        ? `“${resource.name}”을(를) 공개 목록에 다시 올렸습니다.`
        : `“${resource.name}”을(를) 공개 목록에서 내렸습니다. 기존 릴리스 이력은 유지됩니다.`);
      await loadFirstPage();
    } catch (caught) {
      setError(marketAuthorityErrorMessage(
        caught,
        relisting
          ? "에셋을 다시 공개하지 못했습니다. 서버 상태는 변경되지 않았습니다."
          : "에셋을 공개 목록에서 내리지 못했습니다. 서버 상태는 변경되지 않았습니다.",
      ));
    } finally {
      setPendingId(null);
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
            서버가 보유한 패키지 head와 릴리스 상태만 표시합니다. 브라우저 임시 레코드나
            localStorage 수정은 공개 상태와 버전을 변경하지 않습니다.
          </p>
        </div>
        <Link
          href="/market/publish"
          className={buttonClass({ variant: "solid", size: "sm" })}
        >
          <PackagePlus className="size-4" aria-hidden="true" />
          새 릴리스 게시
        </Link>
      </header>

      {!ready ? (
        <div role="status" className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-line bg-card p-8 text-sm text-fg-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          로그인 세션 확인 중
        </div>
      ) : !authenticated ? (
        <section className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <UserCheck className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-fg">로그인 후 게시한 에셋을 관리할 수 있어요</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            로그인하지 않은 브라우저 초안은 판매자 센터의 공개 에셋 수에 포함되지 않습니다.
          </p>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-2">
              현재 공개 패키지 head <strong className="numeral tnum text-fg">{items.length}</strong>개 표시
            </p>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              disabled={loadState === "loading"}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <RefreshCw className={cn("size-3.5", loadState === "loading" && "animate-spin")} aria-hidden="true" />
              새로고침
            </button>
          </div>

          {message ? (
            <p role="status" className="mt-4 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm text-good">
              {message}
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {loadState === "loading" ? (
            <div role="status" className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} aria-hidden="true" className="p-4">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton mt-3 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : loadState === "error" ? (
            <div className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
              <ShieldAlert className="mx-auto size-10 text-bad" aria-hidden="true" />
              <h2 className="mt-3 text-base font-bold text-fg">판매자 데이터를 확인할 수 없어요</h2>
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                className={buttonClass({ variant: "solid", size: "sm", className: "mt-4" })}
              >
                다시 시도
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-panel/50 p-10 text-center">
              <PackagePlus className="mx-auto size-10 text-fg-3" aria-hidden="true" />
              <h2 className="mt-3 text-base font-bold text-fg">서버에 게시한 에셋이 없어요</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">
                Studio에서 만든 manifest를 서버에 게시하면 이곳에서 공개 상태와 버전을 관리할 수 있습니다.
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
              {items.map((item) => {
                const record = item.resource;
                const kind = marketKindMeta(record.kind);
                const license = marketLicenseMeta(record.license);
                const statusMeta = releaseStatus(item);
                const KindIcon = kind.icon;
                const moderated = item.packageModeration.state === "hidden";
                return (
                  <li key={record.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                        <KindIcon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="min-w-0 truncate text-sm font-bold text-fg">{record.name}</h2>
                          <span className="numeral tnum rounded bg-accent/15 px-1.5 py-0.5 text-[0.62rem] font-bold text-accent">
                            v{record.resourceVersion}
                          </span>
                          <span className={cn("rounded px-1.5 py-0.5 text-[0.62rem] font-bold", statusMeta.className)}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-fg-3">{record.description || "설명 없음"}</p>
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
                        title={moderated ? "관리자 숨김 상태는 제작자가 변경할 수 없습니다." : undefined}
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
                      <Link
                        href={marketStudioResourceHref(record.id)}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <Palette className="size-3.5" aria-hidden="true" />
                        Studio
                      </Link>
                      <Link
                        href={`/market/resource/${record.id}`}
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        상세
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {loadState === "ready" && hasMore ? (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className={buttonClass({ variant: "outline", size: "md" })}
              >
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
