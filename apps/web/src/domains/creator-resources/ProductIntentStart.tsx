import { ArrowRight, Clock3, Search } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import Link from "@/compat/router-link";
import { creatorDestinationDescription, creatorDestinationLabel, formatCreatorRelativeTime, getCreatorContinuityServerSnapshot, getCreatorContinuitySnapshot, subscribeCreatorContinuity } from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";

const COPY = {
  ko: {
    title: "오늘 하려던 일, 이어서.", search: "작품·도구·에셋·도움말 검색", recent: "최근 작업 이어하기",
    fallback: "프로젝트 센터에서 작업 이어가기", fallbackBody: "최근 프로젝트, 로컬 초안, 공유받은 작업과 복구 항목을 확인하세요.",
    all: "프로젝트 센터", destinations: ["만들기 시작", "작품 찾기", "리서치 열기", "커뮤니티 열기", "에셋 마켓", "내 서재", "도움말"],
  },
  en: {
    title: "Pick up your next step.", search: "Search stories, tools, assets and help", recent: "Continue where you left off",
    fallback: "Continue from Project Center", fallbackBody: "Find recent projects, local drafts, shared work and recovery items.",
    all: "Project Center", destinations: ["Start creating", "Find stories", "Open research", "Open community", "Asset market", "My library", "Help"],
  },
} as const;
const DESTINATIONS = ["/make", "/discover", "/research", "/community", "/market", "/library", "/help"] as const;

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
