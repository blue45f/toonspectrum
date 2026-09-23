import { Clock3, Images, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { pinnedSharePublicEntrySchema } from "@toonspectrum/studio-project-model/pinned-review-share";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { listPinnedReviewShowcase } from "./studio-pinned-review-share-client";

type Entry = z.infer<typeof pinnedSharePublicEntrySchema>;

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

export function StudioPinnedReviewShowcasePage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef<object>({});

  const load = async (append = false) => {
    const own = generation.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const result = await listPinnedReviewShowcase(append ? nextCursor : null);
      if (own !== generation.current) return;
      setItems((current) => append
        ? [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]
        : result.items);
      setNextCursor(result.nextCursor);
    } catch {
      if (own === generation.current) setError("공개 승인본 목록을 불러오지 못했습니다.");
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
    setError("");
    void listPinnedReviewShowcase(null).then((result) => {
      if (own !== generation.current) return;
      setItems(result.items);
      setNextCursor(result.nextCursor);
    }).catch(() => {
      if (own === generation.current) setError("공개 승인본 목록을 불러오지 못했습니다.");
    }).finally(() => {
      if (own === generation.current) setLoading(false);
    });
    return () => { generation.current = {}; };
  }, []);

  return <Container size="wide" className="py-8 sm:py-12">
    <header className="overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-black text-accent"><ShieldCheck className="size-4" aria-hidden="true" />승인본 공개 전시</span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">작가가 공개를 따로 승인한 검수본</h1>
          <p className="mt-3 text-sm leading-7 text-fg-2 sm:text-base">일반 작품 공개와 별도로, 승인된 고정 검수본 중 제작자가 공개 전시에 명시적으로 동의한 이미지만 표시합니다. 원고의 최신 편집본이나 내부 검수 메모는 노출하지 않습니다.</p>
        </div>
        <Link href="/showcase" className={buttonClass({ variant: "outline", size: "md" })}>일반 작품 전시로 돌아가기</Link>
      </div>
    </header>

    {loading ? <p className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-line bg-card p-8 text-sm" role="status"><LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />공개 승인본을 확인하는 중…</p> : null}
    {error ? <div className="mt-8 rounded-2xl border border-bad/35 bg-card p-6 text-center" role="alert"><p className="text-sm text-bad">{error}</p><button type="button" className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })} onClick={() => { void load(); }}>다시 확인</button></div> : null}

    {!loading && !error ? <section className="mt-8" aria-label="공개 승인본 목록">
      {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => <article key={item.id} className="rounded-3xl border border-line bg-card p-5">
          <span className="grid size-12 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent"><Images className="size-6" aria-hidden="true" /></span>
          <h2 className="mt-4 break-words text-lg font-black">{item.title}</h2>
          <p className="mt-2 text-sm text-fg-2">고정 이미지 {item.pageCount}페이지</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-fg-3"><Clock3 className="size-4" aria-hidden="true" />전시 종료 <time dateTime={item.expiresAt}>{DATE_TIME.format(new Date(item.expiresAt))}</time></p>
          <Link href={`/showcase/reviews/${encodeURIComponent(item.id)}`} className={buttonClass({ variant: "solid", size: "md", className: "mt-5 w-full" })}>승인본 보기</Link>
        </article>)}
      </div> : <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center"><Images className="mx-auto size-10 text-fg-3" aria-hidden="true" /><h2 className="mt-4 font-black">현재 공개 중인 승인본이 없습니다</h2><p className="mt-2 text-sm text-fg-2">일반 공개 작품은 기존 전시관에서 계속 볼 수 있습니다.</p></div>}
      {nextCursor ? <div className="mt-6 flex justify-center"><button type="button" className={buttonClass({ variant: "outline", size: "md" })} disabled={loadingMore} onClick={() => { void load(true); }}>{loadingMore ? "불러오는 중…" : "승인본 더 보기"}</button></div> : null}
    </section> : null}
  </Container>;
}
