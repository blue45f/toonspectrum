import { ArrowRight, Compass, Search } from "lucide-react";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import Link from "@/compat/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("NotFoundPage", ko, en);

export function NotFoundPage() {
  useBilingualI18nRevision();
  const t = useT();

  return (
    <Container size="wide" className="grid min-h-[64vh] place-items-center py-12 sm:py-20">
      <section className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-line bg-panel p-6 text-center sm:p-12" aria-labelledby="not-found-title">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 via-rose-400 to-violet-400" aria-hidden="true" />
        <p className="text-7xl font-bold tracking-tighter text-accent sm:text-8xl" aria-hidden="true">404</p>
        <h1 id="not-found-title" className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">{t("page.notFound.title")}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-2">{t("page.notFound.message")}</p>
        <form action="/search" method="get" role="search" aria-label={bi("작품 검색으로 다시 시작", "Start again with a search")} className="mx-auto mt-7 max-w-md">
          <label htmlFor="not-found-search" className="mb-2 block text-left text-xs font-medium text-fg-2">{bi("찾고 있던 작품이 있나요?", "Looking for a particular story?")}</label>
          <div className="flex gap-2">
            <input id="not-found-search" name="q" type="search" required maxLength={120} placeholder={bi("작품 제목이나 작가 이름", "Story title or author")} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent" />
            <button type="submit" className={buttonClass({ className: "min-h-11 shrink-0 gap-2" })}><Search size={16} aria-hidden="true" />{bi("검색", "Search")}</button>
          </div>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClass({ className: "min-h-11 gap-2" })}>{t("page.notFound.home")}<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/discover" className={buttonClass({ variant: "quiet", className: "min-h-11 gap-2" })}><Compass size={16} aria-hidden="true" />{bi("새로운 작품 발견", "Discover a story")}</Link>
          <Link href="/help" className={buttonClass({ variant: "quiet", className: "min-h-11" })}>{bi("도움말", "Get help")}</Link>
        </div>
      </section>
    </Container>
  );
}
