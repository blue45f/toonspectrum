import { apiFetch } from "@/platform/api";
import { ArrowRight, RefreshCw, Shuffle, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import type { Title } from "@/shared/lib/types";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { Container } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useSearchParams } from "@/shared/navigation/navigation";

interface RandomResponse {
  slug?: string | null;
}

interface TitleDetailResponse {
  title?: Title;
}

/** 뽑기 결과 상태 — 빈 결과(조건에 맞는 작품 없음)와 실패(로드 오류)를 섞지 않는다. */
type RandomPhase = "loading" | "ready" | "empty" | "failed";

// /random keeps type/genre context but no longer forces a redirect. The user can
// inspect the pick, reroll, or change conditions without losing navigation context.
export function RandomPage() {
  const sp = useSearchParams();
  const query = sp.toString();
  const [title, setTitle] = useState<Title | null>(null);
  const [phase, setPhase] = useState<RandomPhase>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setPhase("loading");
    setTitle(null);

    const load = async () => {
      const randomUrl = query ? `/api/random?${query}` : "/api/random";
      const response = await apiFetch(randomUrl, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("random failed");
      const random = (await response.json()) as RandomResponse;
      // API는 성공했지만 조건에 맞는 작품이 없을 때 — 오류가 아니라 빈 결과다.
      if (!random.slug) {
        if (alive) setPhase("empty");
        return;
      }
      const detail = await apiFetch(`/api/titles/${encodeURIComponent(random.slug)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!detail.ok) throw new Error("detail failed");
      const detailJson = (await detail.json()) as TitleDetailResponse;
      if (!detailJson.title) throw new Error("detail title missing");
      if (alive) {
        setTitle(detailJson.title);
        setPhase("ready");
      }
    };

    load().catch((error: unknown) => {
      if (!alive || controller.signal.aborted || (error as Error)?.name === "AbortError") return;
      setPhase("failed");
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [query, reloadKey]);

  const reroll = () => setReloadKey((value) => value + 1);
  const exploreHref = query ? `/explore?${query}` : "/explore";

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
          <Shuffle size={26} className={phase === "loading" ? "motion-safe:animate-pulse" : ""} aria-hidden="true" />
        </span>
        <p className="eyebrow mt-4 text-accent">RANDOM DISCOVERY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">한 편만 골라줘</h1>
        <p className="mt-2 text-sm leading-6 text-fg-3">
          바로 이동하지 않고 먼저 보여드려요. 마음에 들면 열고, 아니면 다시 뽑으면 됩니다.
        </p>
      </header>

      <section aria-label="랜덤 작품 미리보기">
      {phase === "loading" ? (
        <div className="mx-auto mt-8 max-w-sm" role="status" aria-label="랜덤 작품을 고르는 중">
          <div className="skeleton aspect-[3/4] rounded-2xl" />
          <div className="mt-3 space-y-2"><div className="skeleton h-4 w-3/4" /><div className="skeleton h-3 w-1/2" /></div>
        </div>
      ) : phase === "empty" ? (
        <div className="mx-auto mt-8 max-w-lg">
          <ActionableEmptyState
            art="search"
            icon={Shuffle}
            title="조건에 맞는 작품이 없어요"
            description="지금 조건으로는 뽑을 작품이 없어요. 조건을 바꾸면 새 작품을 만날 수 있어요."
            primary={{ href: exploreHref, label: "탐색에서 조건 바꾸기" }}
          >
            <button type="button" onClick={reroll} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
              <RefreshCw size={14} aria-hidden="true" />다시 뽑기
            </button>
          </ActionableEmptyState>
        </div>
      ) : phase === "failed" ? (
        <div className="mx-auto mt-8 max-w-lg">
          <ErrorState
            title="랜덤 작품을 불러오지 못했어요"
            message="네트워크나 서버 문제로 데이터를 가져오지 못했습니다. 잠시 뒤 다시 시도해 보세요."
            onRetry={reroll}
          />
          <Link href={exploreHref} className="mt-3 flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-fg-3 hover:text-accent">
            <SlidersHorizontal size={14} aria-hidden="true" />탐색으로 가기
          </Link>
        </div>
      ) : title ? (
        <div className="mx-auto mt-8 max-w-sm">
          <TitleCard title={title} size="md" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link href={`/title/${title.slug}`} className={buttonClass({ variant: "solid", size: "md", className: "justify-center gap-1.5" })}>
              이 작품 보기<ArrowRight size={15} aria-hidden="true" />
            </Link>
            <button type="button" onClick={reroll} className={buttonClass({ variant: "outline", size: "md", className: "justify-center gap-1.5" })}>
              <RefreshCw size={15} aria-hidden="true" />다시 뽑기
            </button>
          </div>
          <Link href={exploreHref} className="mt-3 flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-fg-3 hover:text-accent">
            <SlidersHorizontal size={14} aria-hidden="true" />조건 바꾸기
          </Link>
        </div>
      ) : null}
      </section>
    </Container>
  );
}
