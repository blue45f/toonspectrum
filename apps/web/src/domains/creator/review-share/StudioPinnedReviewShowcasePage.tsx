import { Clock3, CloudOff, Images, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { pinnedSharePublicEntrySchema } from "@toonstudio/studio-project-model/pinned-review-share";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listPinnedReviewShowcase } from "./studio-pinned-review-share-client";

type Entry = z.infer<typeof pinnedSharePublicEntrySchema>;

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
/** 검수·승인 흐름을 로그인 없이 볼 수 있는 샘플 회차 룸. */
const SAMPLE_REVIEW_ROOM = "/production/projects/sample-project/episodes/episode-12";

export function StudioPinnedReviewShowcasePage() {
  const bt = useBilingual("StudioPinnedReviewShowcasePage");
  const [items, setItems] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef<object>({});

  const load = async (append = false) => {
    const own = generation.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    try {
      const result = await listPinnedReviewShowcase(append ? nextCursor : null);
      if (own !== generation.current) return;
      setItems((current) => append
        ? [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]
        : result.items);
      setNextCursor(result.nextCursor);
    } catch {
      if (own === generation.current) setError(true);
    } finally {
      if (own === generation.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const own = {};
    generation.current = own;
    setLoading(true);
    setError(false);
    void listPinnedReviewShowcase(null).then((result) => {
      if (own !== generation.current) return;
      setItems(result.items);
      setNextCursor(result.nextCursor);
    }).catch(() => {
      if (own === generation.current) setError(true);
    }).finally(() => {
      if (own === generation.current) setLoading(false);
    });
    return () => { generation.current = {}; };
  }, []);

  return <Container size="wide" className="py-8 sm:py-12">
    <header className="overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-black text-accent"><ShieldCheck className="size-4" aria-hidden="true" />{bt("승인본 공개 전시", "Approved review showcase")}</span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{bt("작가가 공개를 따로 승인한 검수본", "Review snapshots creators chose to show")}</h1>
          <p className="mt-3 text-sm leading-7 text-fg-2 sm:text-base">{bt("일반 작품 공개와 별도로, 승인된 고정 검수본 중 제작자가 공개 전시에 명시적으로 동의한 이미지만 표시합니다. 원고의 최신 편집본이나 내부 검수 메모는 노출하지 않습니다.", "Separate from regular publishing, this shows only images from approved, pinned review snapshots whose creators explicitly agreed to show them. Latest drafts and internal review notes are never exposed.")}</p>
        </div>
        <Link href="/showcase" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>{bt("일반 작품 전시로 돌아가기", "Back to the main showcase")}</Link>
      </div>
    </header>

    {loading ? <p className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-line bg-card p-8 text-sm" role="status"><LoaderCircle className="size-5 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />{bt("공개 승인본을 확인하는 중…", "Checking approved snapshots…")}</p> : null}
    {error ? <section className="mt-8 rounded-3xl border border-warn/35 bg-gradient-to-br from-warn/10 via-card to-card p-6 sm:p-8" role="alert" aria-labelledby="showcase-reviews-unavailable">
      <CloudOff className="size-7 text-warn" aria-hidden="true" />
      <h2 id="showcase-reviews-unavailable" className="mt-3 text-lg font-black">{bt("공개 승인본 목록을 불러오지 못했습니다.", "Couldn't load approved snapshots.")}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-2">{bt("연결이 잠시 불안정할 수 있어요. 잠시 뒤 다시 확인하거나, 그동안 일반 작품 전시와 샘플 검수 흐름을 둘러보세요.", "The connection may be unstable. Try again shortly, or browse the main showcase and the sample review flow meanwhile.")}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className={buttonClass({ size: "md", className: "min-h-11 gap-1.5" })} onClick={() => { void load(); }}><RefreshCw className="size-4" aria-hidden="true" />{bt("다시 확인", "Try again")}</button>
        <Link href={SAMPLE_REVIEW_ROOM} className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>{bt("샘플 검수 흐름 보기", "See the sample review flow")}</Link>
      </div>
    </section> : null}

    {!loading && !error ? <section className="mt-8" aria-label={bt("공개 승인본 목록", "Approved snapshots")}>
      {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => <article key={item.id} className="rounded-3xl border border-line bg-card p-5">
          <span className="grid size-12 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent"><Images className="size-6" aria-hidden="true" /></span>
          <h2 className="mt-4 break-words text-lg font-black">{item.title}</h2>
          <p className="mt-2 text-sm text-fg-2">{bt(`고정 이미지 ${item.pageCount}페이지`, `${item.pageCount} pinned pages`)}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-fg-3"><Clock3 className="size-4" aria-hidden="true" />{bt("전시 종료", "Showing until")} <time dateTime={item.expiresAt}>{DATE_TIME.format(new Date(item.expiresAt))}</time></p>
          <Link href={`/showcase/reviews/${encodeURIComponent(item.id)}`} className={buttonClass({ variant: "solid", size: "md", className: "mt-5 min-h-11 w-full" })}>{bt("승인본 보기", "View snapshot")}</Link>
        </article>)}
      </div> : <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center">
        <Images className="mx-auto size-10 text-fg-3" aria-hidden="true" />
        <h2 className="mt-4 font-black">{bt("현재 공개 중인 승인본이 없습니다", "No approved snapshots are showing")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">{bt("일반 공개 작품은 기존 전시관에서 계속 볼 수 있습니다. 작가가 검수에서 승인한 고정본을 공개 전시에 동의하면 이곳에 나타나요.", "Regular works stay in the main showcase. Snapshots appear here once a creator approves one in review and agrees to show it.")}</p>
        <Link href={SAMPLE_REVIEW_ROOM} className={buttonClass({ variant: "outline", size: "md", className: "mt-5 min-h-11" })}>{bt("샘플 검수 흐름 보기", "See the sample review flow")}</Link>
      </div>}
      {nextCursor ? <div className="mt-6 flex justify-center"><button type="button" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })} disabled={loadingMore} onClick={() => { void load(true); }}>{loadingMore ? bt("불러오는 중…", "Loading…") : bt("승인본 더 보기", "Show more snapshots")}</button></div> : null}
    </section> : null}
  </Container>;
}
