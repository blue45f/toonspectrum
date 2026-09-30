import { ArrowRight, CalendarDays, MessageCircle, UsersRound } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";

import { CommunityScopeDirectory } from "./components/community-scope-directory";
import {
  COMMUNITY_SCOPE_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS,
  COMMUNITY_SCOPE_LABEL_KEYS,
} from "./community-cafe-labels";

import type { FanCafeScopeFilter } from "@/shared/lib/types";

import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { COMMUNITY_SCOPE_DIRECTORIES } from "@/shared/lib/community-ui";
import Link from "@/shared/navigation/router-link";
import {
  defineBilingualText,
  formatI18nTemplate,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

const SCOPES = ["title", "author", "pencafe"] as const;

const COPY = {
  docTitle: defineBilingualText(
    "communityPage",
    "docTitle",
    "커뮤니티 · 웹툰을 함께 읽고 그리는 곳",
    "Community · Read and draw webtoons together",
  ),
  heroEyebrow: defineBilingualText(
    "communityPage",
    "heroEyebrow",
    "COMMUNITY · 이야기가 우리를 잇다",
    "COMMUNITY · STORIES BRING US TOGETHER",
  ),
  heroTitle: defineBilingualText(
    "communityPage",
    "heroTitle",
    "혼자 그린 이야기, 함께 넓어지는 세계.",
    "A story drawn alone, a world widened together.",
  ),
  heroDescription: defineBilingualText(
    "communityPage",
    "heroDescription",
    "인상 깊은 한 컷의 해석부터 좋아하는 작가의 이야기까지. 작품·작가·펜카페를 따라 대화를 찾아보세요. 창작자의 갤러리에서 새로운 작업을 만나고, 리뷰로 감상을 이어갈 수 있습니다.",
    "From hot takes on a memorable panel to stories about your favorite creator — follow works, creators, and pencafes to find conversations. Discover new work in creator galleries and keep the appreciation going with reviews.",
  ),
  heroImageAlt: defineBilingualText(
    "communityPage",
    "heroImageAlt",
    "웹툰 속 도시와 사람들의 이야기를 표현한 장면 콘셉트 아트",
    "Scene concept art depicting a webtoon city and its people",
  ),
  heroCaption: defineBilingualText(
    "communityPage",
    "heroCaption",
    "A WORLD OF STORIES · 웹툰 장면 콘셉트 아트",
    "A WORLD OF STORIES · Webtoon scene concept art",
  ),
  ctaGallery: defineBilingualText("communityPage", "ctaGallery", "창작자 갤러리", "Creator gallery"),
  ctaCollab: defineBilingualText("communityPage", "ctaCollab", "웹툰 구인·의뢰", "Jobs & commissions"),
  ctaEvents: defineBilingualText("communityPage", "ctaEvents", "이벤트 게시판", "Events board"),
  promoteTitle: defineBilingualText(
    "communityPage",
    "promoteTitle",
    "아마추어 작가의 첫 연재, 새로운 웹툰의 첫 독자",
    "An amateur creator's first series, a new webtoon's first readers",
  ),
  promoteDescription: defineBilingualText(
    "communityPage",
    "promoteDescription",
    "작품 소개·홍보 영상·제작 과정을 공개하고 응원과 피드백을 나눠요. 홍보 게시물은 전용 공간에서 모아볼 수 있습니다.",
    "Share your work intro, trailers, and production process — and trade cheers and feedback. Promotion posts are collected in a dedicated space.",
  ),
  promoteAmateur: defineBilingualText("communityPage", "promoteAmateur", "아마추어 작가 찾기", "Find amateur creators"),
  promoteTrailer: defineBilingualText("communityPage", "promoteTrailer", "트레일러 상영관", "Trailer theater"),
  promoteNew: defineBilingualText("communityPage", "promoteNew", "내 작품 소개하기", "Introduce my work"),
  directoriesEyebrow: defineBilingualText(
    "communityPage",
    "directoriesEyebrow",
    "FIND YOUR CONVERSATION",
    "FIND YOUR CONVERSATION",
  ),
  directoriesTitle: defineBilingualText(
    "communityPage",
    "directoriesTitle",
    "어떤 이야기부터 나눌까요?",
    "Which story will you talk about first?",
  ),
  directoriesCta: defineBilingualText(
    "communityPage",
    "directoriesCta",
    "영감을 내 웹툰으로",
    "Turn inspiration into my webtoon",
  ),
  directoryBrowse: defineBilingualText("communityPage", "directoryBrowse", "대화 둘러보기", "Browse conversations"),
  unifiedFeedLabel: defineBilingualText("communityPage", "unifiedFeedLabel", "통합 커뮤니티 피드", "Unified community feed"),
  scopeEyebrow: defineBilingualText("communityPage", "scopeEyebrow", "COMMUNITY DIRECTORY", "COMMUNITY DIRECTORY"),
  scopeTitleTemplate: defineBilingualText("communityPage", "scopeTitleTemplate", "{v0} 커뮤니티", "{v0} community"),
  scopeDocTitleTemplate: defineBilingualText(
    "communityPage",
    "scopeDocTitleTemplate",
    "{v0} 커뮤니티 · 툰스튜디오",
    "{v0} community · ToonStudio",
  ),
  scopeNotFoundTitle: defineBilingualText(
    "communityPage",
    "scopeNotFoundTitle",
    "커뮤니티 범주를 찾을 수 없어요",
    "We couldn't find that community category",
  ),
  scopeNotFoundCta: defineBilingualText("communityPage", "scopeNotFoundCta", "통합 커뮤니티로 이동", "Go to the unified community"),
} as const;

function parseScope(raw: string | undefined): Exclude<FanCafeScopeFilter, "all" | "cafe"> | null {
  return SCOPES.find((scope) => scope === raw) ?? null;
}

export function CommunityPage() {
  useBilingualI18nRevision();
  const t = useT();
  useDocumentTitle(t(COPY.docTitle));
  return (
    <Container size="wide" className="relative py-6 sm:py-8 lg:py-10">
      <PublicStoryHero
        purpose="community"
        eyebrow={t(COPY.heroEyebrow)}
        title={t(COPY.heroTitle)}
        description={t(COPY.heroDescription)}
        image="world"
        imageAlt={t(COPY.heroImageAlt)}
        caption={t(COPY.heroCaption)}
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/showcase" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">{t(COPY.ctaGallery)}<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/collaborate" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"><MessageCircle size={16} aria-hidden="true" />{t(COPY.ctaCollab)}</Link>
          <Link href="/community/events" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"><CalendarDays size={16} aria-hidden="true" />{t(COPY.ctaEvents)}</Link>
        </div>
      </PublicStoryHero>
      {/* 커뮤니티 섹션 키 비주얼 — 장식용. */}
      <SectionArt
        image="community"
        className="mt-8 h-44 w-full rounded-2xl border border-line/60 object-cover sm:h-60"
      />
      <section className="mt-8 rounded-2xl border border-line bg-panel/60 p-6" aria-labelledby="community-promotion-title"><h2 id="community-promotion-title" className="text-xl font-bold">{t(COPY.promoteTitle)}</h2><p className="mt-3 text-sm leading-relaxed text-fg-2">{t(COPY.promoteDescription)}</p><div className="mt-4 flex flex-wrap gap-5 text-sm font-semibold text-accent"><Link href="/community/promote?stage=amateur">{t(COPY.promoteAmateur)} →</Link><Link href="/community/promote?kind=trailer">{t(COPY.promoteTrailer)} →</Link><Link href="/community/promote/new">{t(COPY.promoteNew)} →</Link></div></section>
      <section className="mt-10" aria-labelledby="community-directories-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-accent">{t(COPY.directoriesEyebrow)}</p><h2 id="community-directories-title" className="mt-3 text-2xl font-bold tracking-tight text-fg">{t(COPY.directoriesTitle)}</h2></div><Link href="/make" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">{t(COPY.directoriesCta)}<ArrowRight size={15} aria-hidden="true" /></Link></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMMUNITY_SCOPE_DIRECTORIES.map((entry) => <Link key={entry.value} href={entry.href} className="group flex min-h-20 items-center gap-4 rounded-xl border border-line bg-panel/60 p-5 transition-colors hover:border-accent/50 hover:bg-card"><span aria-hidden="true" className="text-xl">{entry.icon}</span><span className="flex-1 text-sm font-semibold text-fg">{t(COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS[entry.value])}<span className="mt-1 block text-xs font-normal text-fg-3">{t(COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS[entry.value])} · {t(COPY.directoryBrowse)}</span></span><ArrowRight size={16} className="text-fg-3 group-hover:text-accent" aria-hidden="true" /></Link>)}
        </div>
      </section>
      <section className="mt-6 rounded-3xl border border-line bg-panel/45 p-1">
        <FanCafePanel scope="all" targetLabel={t(COPY.unifiedFeedLabel)} compact />
      </section>
    </Container>
  );
}

export function CommunityScopePage() {
  useBilingualI18nRevision();
  const t = useT();
  const { scope: rawScope } = useParams();
  const scope = parseScope(rawScope);
  const scopeLabel = scope ? t(COMMUNITY_SCOPE_LABEL_KEYS[scope]) : "";
  useDocumentTitle(
    scope
      ? formatI18nTemplate(t(COPY.scopeDocTitleTemplate), { v0: scopeLabel })
      : t(COPY.scopeNotFoundTitle),
  );
  if (rawScope === "cafe" || rawScope === "cafes") return <Navigate to="/community/cafes" replace />;
  if (!scope) return <Container size="wide" className="py-16"><p className="eyebrow text-accent">COMMUNITY</p><h1 className="mt-2 text-2xl font-bold">{t(COPY.scopeNotFoundTitle)}</h1><Link href="/community" className="mt-5 inline-flex text-sm font-medium text-accent">{t(COPY.scopeNotFoundCta)}</Link></Container>;
  return <Container size="wide" className="relative py-6 sm:py-8 lg:py-10"><header className="mb-6 sm:mb-8"><p className="eyebrow flex items-center gap-1.5 text-accent"><UsersRound size={14} />{t(COPY.scopeEyebrow)}</p><h1 className="mt-2 text-[clamp(1.6rem,7vw,1.875rem)] font-bold tracking-tight sm:text-4xl">{formatI18nTemplate(t(COPY.scopeTitleTemplate), { v0: scopeLabel })}</h1><p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">{t(COMMUNITY_SCOPE_DESCRIPTION_KEYS[scope])}</p></header><CommunityScopeDirectory key={scope} scope={scope} /></Container>;
}
