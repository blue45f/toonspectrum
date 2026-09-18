import {
  formatI18nTemplate,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, BookOpen, Brush, Layers3, Search } from "lucide-react";

import Link from "@/compat/router-link";

import "./public-creative.css";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("public-creative", ko, en);

const JOURNEY = [
  { id: "research", href: "/research", icon: Search, ko: "장면을 조사하고", en: "Find your scene", detailKo: "복식 · 소품 · 배경 자료", detailEn: "Costumes, props and places" },
  { id: "learn", href: "/learn", icon: BookOpen, ko: "표현을 익히고", en: "Practice your craft", detailKo: "선화 · 채색 · 컷 연출", detailEn: "Line, color and composition" },
  { id: "market", href: "/market", icon: Layers3, ko: "필요한 소재를 담고", en: "Collect your materials", detailKo: "브러시 · 팔레트 · 3D 소재", detailEn: "Brushes, palettes and 3D assets" },
  { id: "studio", href: "/studio", icon: Brush, ko: "나만의 웹툰으로", en: "Draw your webtoon", detailKo: "드로잉에서 컷 구성까지", detailEn: "From drawing to finished panels" },
] as const;

/** Public-page navigation: every step opens an existing working product surface. */
export function CreativeJourneyLinks({ locale = "ko", current, compact = false }: {
  locale?: string;
  current?: "research" | "learn" | "market" | "discover" | "community" | "about";
  compact?: boolean;
}) {
  useBilingualI18nRevision();
  return <nav className={`public-creative-journey${compact ? " public-creative-journey--compact" : ""}`} aria-label={bi("웹툰 제작을 이어가는 길", "Continue your webtoon workflow")}>
    {JOURNEY.filter((item) => item.id !== current).map((item) => {
      const Icon = item.icon;
      return <Link key={item.id} href={item.href}><Icon size={19} aria-hidden="true" /><span><strong>{bi((item).ko, (item).en)}</strong><small>{bi(item.detailKo, item.detailEn)}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>;
    })}
  </nav>;
}
