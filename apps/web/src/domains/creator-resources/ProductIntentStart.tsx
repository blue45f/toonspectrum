import { ArrowRight, Clock3, Search } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import Link from "@/compat/router-link";
import { creatorDestinationDescription, creatorDestinationLabel, formatCreatorRelativeTime, getCreatorContinuityServerSnapshot, getCreatorContinuitySnapshot, subscribeCreatorContinuity } from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";

const COPY = {
  ko: {
    title: "지금 필요한 작업으로 바로 가세요.", search: "프로젝트·회차·도구·작품 재료 검색", recent: "최근 작업 이어하기",
    fallback: "내 프로젝트에서 이어가기", fallbackBody: "최근 작품, 공유 작업과 복구할 초안을 한곳에서 확인하세요.",
    all: "모든 프로젝트", destinations: ["제작 관리", "내 프로젝트", "새 작품", "작품 재료", "검수·내보내기", "팀원·외주", "도움말"],
  },
  en: {
    title: "Go straight to the work you need.", search: "Search projects, episodes, tools and assets", recent: "Continue recent work",
    fallback: "Continue from My projects", fallbackBody: "Find recent work, shared projects and recoverable drafts in one place.",
    all: "All projects", destinations: ["Production", "My projects", "New work", "Assets", "Review & export", "Collaborators", "Help"],
  },
} as const;
const DESTINATIONS = ["/production", "/studio/projects", "/studio/new", "/studio/assets", "/studio/publish", "/collaborate", "/help"] as const;

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
      <aside><p><Clock3 size={16} aria-hidden="true" />{copy.recent}</p><Link className="cf-recent-card" href={recent?.href ?? "/studio/projects"}><strong>{recent ? creatorDestinationLabel(recent.id, locale) : copy.fallback}</strong><span>{recent ? creatorDestinationDescription(recent.id, locale) : copy.fallbackBody}</span>{recent && now > 0 && <small>{formatCreatorRelativeTime(recent.visitedAt, locale, now)}</small>}<ArrowRight size={18} aria-hidden="true" /></Link><Link className="cf-link" href="/studio/projects">{copy.all}<ArrowRight size={15} aria-hidden="true" /></Link></aside>
    </section>
  );
}
