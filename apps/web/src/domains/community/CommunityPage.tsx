import {
  ArrowRight,
  CalendarDays,
  Clapperboard,
  Megaphone,
  MessageCircle,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Navigate, useParams } from "react-router-dom";

import { CommunityScopeDirectory } from "./components/community-scope-directory";
import {
  COMMUNITY_SCOPE_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS,
  COMMUNITY_SCOPE_ICONS,
  COMMUNITY_SCOPE_LABEL_KEYS,
} from "./community-cafe-labels";

import type { FanCafeScopeFilter } from "@/shared/lib/types";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageArt } from "@/domains/legal/public/site-page-art";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
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
  heroSummary: defineBilingualText(
    "communityPage",
    "heroSummary",
    "작품·작가·펜카페·회원 카페를 따라 대화를 찾고, 창작자 갤러리와 리뷰로 감상을 이어가세요.",
    "Follow works, creators, pencafes and member cafés to find conversations, then keep going with the creator gallery and reviews.",
  ),
  heroArtCaption: defineBilingualText(
    "communityPage",
    "heroArtCaption",
    "브랜드 콘셉트 아트 · 실제 커뮤니티 화면이 아닙니다",
    "Brand concept art · not a live community screen",
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
  directoriesDescription: defineBilingualText(
    "communityPage",
    "directoriesDescription",
    "관심 있는 작품이나 작가, 모임부터 들어가 지금 오가는 대화를 확인하세요.",
    "Start from a work, creator or club you care about and see what people are talking about.",
  ),
  promoteEyebrow: defineBilingualText("communityPage", "promoteEyebrow", "SHOWCASE", "SHOWCASE"),
  promoteAmateurBody: defineBilingualText(
    "communityPage",
    "promoteAmateurBody",
    "첫 연재를 시작한 작가의 소개 글을 모아 봅니다.",
    "Browse introductions from creators starting their first series.",
  ),
  promoteTrailerBody: defineBilingualText(
    "communityPage",
    "promoteTrailerBody",
    "작품 소개 영상과 제작 과정 영상을 모아 봅니다.",
    "Watch work trailers and making-of videos in one place.",
  ),
  promoteNewBody: defineBilingualText(
    "communityPage",
    "promoteNewBody",
    "내 작품 소개와 홍보 영상을 올리고 피드백을 받아요.",
    "Post your work intro or trailer and collect feedback.",
  ),
  promoteOpen: defineBilingualText("communityPage", "promoteOpen", "둘러보기", "Browse"),
  unifiedFeedRegion: defineBilingualText("communityPage", "unifiedFeedRegion", "통합 커뮤니티 피드", "Unified community feed"),
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
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={UsersRound}
        eyebrow={t(COPY.heroEyebrow)}
        title={t(COPY.heroTitle)}
        description={t(COPY.heroSummary)}
        aside={<SitePageArt kind="community" caption={t(COPY.heroArtCaption)} priority />}
        asideClassName="hidden lg:block"
        actions={
          <>
            <Link href="/showcase" className={buttonClass({ size: "md", className: "min-h-11" })}>
              {t(COPY.ctaGallery)}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/collaborate" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
              <MessageCircle size={16} aria-hidden="true" />
              {t(COPY.ctaCollab)}
            </Link>
            <Link href="/community/events" className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11" })}>
              <CalendarDays size={16} aria-hidden="true" />
              {t(COPY.ctaEvents)}
            </Link>
          </>
        }
      />

      <Section
        className="mt-10 sm:mt-12"
        eyebrow={t(COPY.directoriesEyebrow)}
        title={t(COPY.directoriesTitle)}
        desc={t(COPY.directoriesDescription)}
        action={{ label: t(COPY.directoriesCta), href: "/studio/new" }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMMUNITY_SCOPE_DIRECTORIES.map((entry) => (
            <SiteLinkCard
              key={entry.value}
              layout="compact"
              href={entry.href}
              icon={COMMUNITY_SCOPE_ICONS[entry.value]}
              title={t(COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS[entry.value])}
              description={t(COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS[entry.value])}
            />
          ))}
        </div>
      </Section>

      <section className="mt-8 rounded-3xl border border-line bg-panel/45 p-1" aria-label={t(COPY.unifiedFeedRegion)}>
        <FanCafePanel scope="all" targetLabel={t(COPY.unifiedFeedLabel)} compact hideSpaceGuide />
      </section>

      <Section
        className="mt-12 sm:mt-14"
        eyebrow={t(COPY.promoteEyebrow)}
        title={t(COPY.promoteTitle)}
        desc={t(COPY.promoteDescription)}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SiteLinkCard
            href="/community/promote?stage=amateur"
            icon={Sparkles}
            title={t(COPY.promoteAmateur)}
            description={t(COPY.promoteAmateurBody)}
            cta={t(COPY.promoteOpen)}
          />
          <SiteLinkCard
            href="/community/promote?kind=trailer"
            icon={Clapperboard}
            title={t(COPY.promoteTrailer)}
            description={t(COPY.promoteTrailerBody)}
            cta={t(COPY.promoteOpen)}
          />
          <SiteLinkCard
            href="/community/promote/new"
            icon={Megaphone}
            title={t(COPY.promoteNew)}
            description={t(COPY.promoteNewBody)}
            cta={t(COPY.promoteNew)}
          />
        </div>
      </Section>
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
  const backToCommunity = (
    <Link href="/community" className={buttonClass({ variant: scope ? "ghost" : "solid", size: "sm", className: "min-h-11 gap-1.5" })}>
      <UsersRound size={15} aria-hidden="true" />
      {t(COPY.scopeNotFoundCta)}
    </Link>
  );
  if (!scope) {
    return (
      <Container size="wide" className="py-10 sm:py-14">
        <SitePageHeader surface="plain" icon={UsersRound} eyebrow="COMMUNITY" title={t(COPY.scopeNotFoundTitle)} actions={backToCommunity} />
      </Container>
    );
  }
  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        surface="plain"
        className="mb-6 sm:mb-8"
        icon={COMMUNITY_SCOPE_ICONS[scope]}
        eyebrow={t(COPY.scopeEyebrow)}
        title={formatI18nTemplate(t(COPY.scopeTitleTemplate), { v0: scopeLabel })}
        description={t(COMMUNITY_SCOPE_DESCRIPTION_KEYS[scope])}
        actions={backToCommunity}
      />
      <CommunityScopeDirectory key={scope} scope={scope} />
    </Container>
  );
}
