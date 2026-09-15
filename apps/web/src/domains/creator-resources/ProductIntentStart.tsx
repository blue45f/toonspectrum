import { ArrowRight, Clock3, Search } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import Link from "@/compat/router-link";
import { creatorDestinationDescription, creatorDestinationLabel, formatCreatorRelativeTime, getCreatorContinuityServerSnapshot, getCreatorContinuitySnapshot, subscribeCreatorContinuity } from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";

const COPY = {
  ko: {
    title: "바로 시작할까요?", search: "작품·도구·소재·도움말 검색", recent: "최근 작업",
    fallback: "내 작업에서 이어가기", fallbackBody: "최근 프로젝트와 임시 작업을 확인하고 바로 이어서 그리세요.",
    all: "내 작업 전체 보기", destinations: ["새 작품 만들기", "영감 찾기", "배우기", "커뮤니티"],
  },
  en: {
    title: "Ready to begin?", search: "Search stories, tools, materials and help", recent: "Recent work",
    fallback: "Continue from My work", fallbackBody: "Open recent projects and drafts, then continue creating.",
    all: "View all work", destinations: ["Create new", "Find inspiration", "Learn", "Community"],
  },
} as const;
const DESTINATIONS = ["/studio/new", "/discover", "/learn", "/community"] as const;

export function ProductIntentStart() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  const openSearch = useUi((state) => state.openCommandPalette);
  const continuity = useSyncExternalStore(subscribeCreatorContinuity, getCreatorContinuitySnapshot, getCreatorContinuityServerSnapshot);
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);
  const recent = continuity.recent[0] ?? null;
  return (
    <section className="cf-intent" lang={locale} aria-labelledby="product-intent-title">
      <div><h2 id="product-intent-title">{copy.title}</h2><button type="button" className="cf-intent-search" onClick={openSearch}><Search size={18} aria-hidden="true" />{copy.search}</button><nav aria-label={copy.title}>{DESTINATIONS.map((href, index) => <Link key={href} href={href}>{copy.destinations[index]}<ArrowRight size={14} aria-hidden="true" /></Link>)}</nav></div>
      <aside><p><Clock3 size={16} aria-hidden="true" />{copy.recent}</p><Link className="cf-recent-card" href={recent?.href ?? "/studio"}><strong>{recent ? creatorDestinationLabel(recent.id, locale) : copy.fallback}</strong><span>{recent ? creatorDestinationDescription(recent.id, locale) : copy.fallbackBody}</span>{recent && now > 0 && <small>{formatCreatorRelativeTime(recent.visitedAt, locale, now)}</small>}<ArrowRight size={18} aria-hidden="true" /></Link><Link className="cf-link" href="/studio">{copy.all}<ArrowRight size={15} aria-hidden="true" /></Link></aside>
    </section>
  );
}
