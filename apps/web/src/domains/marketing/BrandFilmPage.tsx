import { SITE_URL } from "@toonspectrum/core";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  MonitorPlay,
  Ratio,
  Sparkles,
  Subtitles,
} from "lucide-react";

import { BrandFilmStoryboard } from "./BrandFilmStoryboard";
import { CreatorBrandFilm } from "./CreatorHomePage";
import { CREATOR_FILM, HOME_COPY, creatorHomeLocale } from "./creator-home-content";

import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";
import {
  defineBilingualText,
  translateParallelBilingualCopy,
} from "@/shared/lib/i18n-bilingual-copy";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";

import "./creator-home.css";
import "./creator-film.css";
import "./brand-film-page.css";

const PAGE_COPY = {
  ko: {
    pageTitle: "툰스튜디오 브랜드 필름",
    metaDescription:
      "아이디어가 첫 장면이 되고 한 편의 이야기로 이어지는 툰스튜디오의 창작 흐름을 24초 Remotion 브랜드 필름으로 만나보세요.",
    imageAlt: "툰스튜디오 브랜드 필름의 창작 작업 화면",
    back: "홈으로",
    title: ["24초로 만나는", "툰스튜디오."],
    intro:
      "아이디어가 첫 장면이 되고, 장면이 한 편의 이야기로 이어지는 순간을 짧은 브랜드 필름에 담았습니다.",
    watch: "브랜드 필름 재생",
    start: "새 작품 시작하기",
    factsLabel: "영상 제작 정보",
    facts: [
      ["재생 시간", "24초"],
      ["모션 제작", "Remotion"],
      ["화면 비율", "16:9 · 9:16 · 1:1"],
      ["접근성", "한·영 자막"],
    ],
    productionEyebrow: "MADE WITH REMOTION",
    productionTitle: "한 번의 구성으로, 모든 화면에 맞게.",
    productionBody:
      "React 기반 Remotion 컴포지션에서 장면, 타이포그래피와 전환을 프레임 단위로 구성하고 웹에 최적화된 영상으로 렌더링했습니다.",
    productionCards: [
      [
        "프레임 단위 모션",
        "30fps, 720프레임의 동일한 타임라인으로 네 장면의 움직임과 전환을 제어합니다.",
      ],
      [
        "세 가지 배포 비율",
        "가로형, 세로형, 정사각형 영상을 각각 렌더링해 웹과 소셜 채널에 바로 활용할 수 있습니다.",
      ],
      [
        "자막과 대본",
        "한국어·영어 WebVTT 자막, 장면별 탐색, 읽을 수 있는 대본을 함께 제공합니다.",
      ],
    ],
    closingTitle: "이제 당신의 장면을 시작하세요.",
    closingBody:
      "웹툰 기획부터 드로잉, 3D 장면, 협업과 연재 준비까지 하나의 제작 흐름으로 이어집니다.",
    promo: "내 작품 홍보 영상 만들기",
  },
  en: {
    pageTitle: "ToonStudio brand film",
    metaDescription:
      "Watch ToonStudio's 24-second Remotion brand film, following a creative idea from its first scene into a complete story.",
    imageAlt: "A creative workspace scene from the ToonStudio brand film",
    back: "Back home",
    title: ["Meet ToonStudio", "in 24 seconds."],
    intro:
      "A small idea becomes a first scene, then a story. This short brand film captures that creative journey.",
    watch: "Play the brand film",
    start: "Start a new work",
    factsLabel: "Film production details",
    facts: [
      ["Duration", "24 seconds"],
      ["Motion", "Remotion"],
      ["Aspect ratios", "16:9 · 9:16 · 1:1"],
      ["Accessibility", "Korean · English captions"],
    ],
    productionEyebrow: "MADE WITH REMOTION",
    productionTitle: "One composition, ready for every screen.",
    productionBody:
      "Scenes, typography and transitions are composed frame by frame in React-based Remotion, then rendered into web-ready video.",
    productionCards: [
      [
        "Frame-accurate motion",
        "One 30fps, 720-frame timeline controls the motion and transitions across all four scenes.",
      ],
      [
        "Three delivery ratios",
        "Landscape, portrait and square editions are rendered for the web and social channels.",
      ],
      [
        "Captions and transcript",
        "Korean and English WebVTT captions, chapter navigation and a readable transcript are included.",
      ],
    ],
    closingTitle: "Start your next scene.",
    closingBody:
      "Connect planning, drawing, 3D scenes, collaboration and publishing preparation in one production flow.",
    promo: "Create a promo for my work",
  },
} as const;

const FULL_TOUR_KEY = defineBilingualText(
  "brandFilmPage",
  "fullProductTour",
  "8분 전체 제품 투어",
  "8-minute full product tour",
);
const PRODUCTION_ICONS = [Clapperboard, Ratio, Subtitles] as const;
const BRAND_FILM_POSTER = `${SITE_URL}/brand/toonstudio-film-poster.jpg`;

export function BrandFilmPage() {
  const t = useT();
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const documentLocale = normalizeLocaleCode(language) || "en";
  const copy = translateParallelBilingualCopy(t, "brandFilmPage", PAGE_COPY);
  const filmCopy = HOME_COPY[locale];

  useDocumentTitle(copy.pageTitle);
  useMetaDescription(copy.metaDescription);
  usePageSocialMeta({
    canonicalPath: "/brand-film",
    title: copy.pageTitle,
    description: copy.metaDescription,
    image: BRAND_FILM_POSTER,
    imageAlt: copy.imageAlt,
  });
  useJsonLd({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: copy.pageTitle,
    description: copy.metaDescription,
    thumbnailUrl: BRAND_FILM_POSTER,
    contentUrl: `${SITE_URL}${CREATOR_FILM.src}`,
    embedUrl: `${SITE_URL}/brand-film#creator-film`,
    duration: "PT24S",
    inLanguage: documentLocale,
    isFamilyFriendly: true,
  });

  return (
    <div
      className="creator-home brand-film-page"
      data-brand-film="remotion"
      lang={documentLocale}
    >
      <header className="brand-film-page__hero">
        <div className="brand-film-page__hero-copy">
          <Link href="/" className="brand-film-page__back">
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.back}
          </Link>
          <p className="ch-eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            TOONSTUDIO BRAND FILM
          </p>
          <h1>
            {copy.title[0]}
            <br />
            <span>{copy.title[1]}</span>
          </h1>
          <p className="brand-film-page__intro">{copy.intro}</p>
          <div className="ch-actions">
            <a href="#creator-film" className="ch-button ch-button--primary">
              <MonitorPlay size={18} aria-hidden="true" />
              {copy.watch}
            </a>
            <Link href="/studio/new" className="ch-button ch-button--quiet">
              {copy.start}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <dl className="brand-film-page__facts" aria-label={copy.factsLabel}>
          {copy.facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <BrandFilmStoryboard />

      <div className="brand-film-page__film-shell">
        <CreatorBrandFilm copy={filmCopy} locale={locale} />
      </div>

      <section
        className="brand-film-page__production"
        aria-labelledby="brand-film-production-title"
      >
        <div className="brand-film-page__production-heading">
          <p className="ch-eyebrow">{copy.productionEyebrow}</p>
          <h2 id="brand-film-production-title">{copy.productionTitle}</h2>
          <p>{copy.productionBody}</p>
        </div>
        <div className="brand-film-page__production-grid">
          {copy.productionCards.map(([title, body], index) => {
            const Icon = PRODUCTION_ICONS[index] ?? Clapperboard;
            return (
              <article key={title}>
                <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="brand-film-page__closing"
        aria-labelledby="brand-film-closing-title"
      >
        <div>
          <p className="ch-eyebrow">CREATE YOUR NEXT STORY</p>
          <h2 id="brand-film-closing-title">{copy.closingTitle}</h2>
          <p>{copy.closingBody}</p>
        </div>
        <div className="brand-film-page__closing-actions">
          <Link href="/studio/new" className="ch-button ch-button--primary">
            {copy.start}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/showcase/promo" className="ch-button ch-button--quiet">
            {copy.promo}
          </Link>
          <Link href="/product-tour" className="ch-button ch-button--quiet">
            {t(FULL_TOUR_KEY)}
          </Link>
        </div>
      </section>
    </div>
  );
}
