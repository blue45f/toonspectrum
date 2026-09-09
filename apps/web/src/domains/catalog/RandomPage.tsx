import { ArrowRight, RefreshCw, Shuffle, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import type { Title } from "@/shared/lib/types";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useSearchParams } from "@/compat/navigation";

interface RandomResponse {
  slug?: string | null;
}

interface TitleDetailResponse {
  title?: Title;
}

// /random keeps type/genre context but no longer forces a redirect. The user can
// inspect the pick, reroll, or change conditions without losing navigation context.
export function RandomPage() {
  const sp = useSearchParams();
  const query = sp.toString();
  const [title, setTitle] = useState<Title | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setTitle(null);

    const randomUrl = query ? `/api/random?${query}` : "/api/random";
    fetch(randomUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("random failed");
        const random = (await response.json()) as RandomResponse;
        if (!random.slug) throw new Error("empty random result");
        const detail = await fetch(`/api/titles/${encodeURIComponent(random.slug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!detail.ok) throw new Error("detail failed");
        return detail.json() as Promise<TitleDetailResponse>;
      })
      .then((detail) => {
        if (!alive || !detail.title) return;
        setTitle(detail.title);
      })
      .catch((error: unknown) => {
        if (!alive || controller.signal.aborted || (error as Error)?.name === "AbortError") return;
        setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [query, reloadKey]);

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
          <Shuffle size={26} className={loading ? "motion-safe:animate-pulse" : ""} aria-hidden="true" />
        </span>
        <p className="eyebrow mt-4 text-accent">RANDOM DISCOVERY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">한 편만 골라줘</h1>
        <p className="mt-2 text-sm leading-6 text-fg-3">
          바로 이동하지 않고 먼저 보여드려요. 마음에 들면 열고, 아니면 다시 뽑으면 됩니다.
        </p>
      </header>

      {loading ? (
        <div className="mx-auto mt-8 max-w-sm" role="status" aria-label="랜덤 작품을 고르는 중">
          <div className="skeleton aspect-[3/4] rounded-2xl" />
          <div className="mt-3 space-y-2"><div className="skeleton h-4 w-3/4" /><div className="skeleton h-3 w-1/2" /></div>
        </div>
      ) : failed || !title ? (
        <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-dashed border-line bg-panel/45 p-8 text-center">
          <p className="font-semibold text-fg">랜덤 작품을 고르지 못했어요</p>
          <p className="mt-1 text-sm text-fg-3">현재 조건에 맞는 작품이 부족하거나 일시적으로 데이터를 불러오지 못했습니다.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className={buttonClass({ variant: "solid", size: "sm", className: "gap-1.5" })}>
              <RefreshCw size={14} aria-hidden="true" />다시 뽑기
            </button>
            <Link href="/explore" className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
              <SlidersHorizontal size={14} aria-hidden="true" />탐색으로 가기
            </Link>
          </div>
        </div>
      ) : (
        <div className="mx-auto mt-8 max-w-sm">
          <TitleCard title={title} size="md" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link href={`/title/${title.slug}`} className={buttonClass({ variant: "solid", size: "md", className: "justify-center gap-1.5" })}>
              이 작품 보기<ArrowRight size={15} aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className={buttonClass({ variant: "outline", size: "md", className: "justify-center gap-1.5" })}>
              <RefreshCw size={15} aria-hidden="true" />다시 뽑기
            </button>
          </div>
          <Link href={query ? `/explore?${query}` : "/explore"} className="mt-3 flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-fg-3 hover:text-accent">
            <SlidersHorizontal size={14} aria-hidden="true" />조건 바꾸기
          </Link>
        </div>
      )}
    </Container>
  );
}
