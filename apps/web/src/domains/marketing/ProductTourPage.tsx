import { getActiveI18nLocale, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { SITE_URL } from "@toonstudio/core/business";
import { ArrowRight, ArrowUpRight, ChevronDown, CirclePlay, Clapperboard, Film, ImageIcon, Sparkles, Users } from "lucide-react";
import { useRef, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useJsonLd, useMetaDescription, usePageSocialMeta } from "@/shared/seo/use-document-title";
import { useI18n } from "@/shared/lib/i18n";
import { ServiceStoryJourney } from "@/shared/components/service-story-journey";

import { creatorHomeLocale } from "./creator-home-content";
import { ProductTourPlayer } from "./ProductTourPlayer";
import { ProductTourAdditions } from "./ProductTourAdditions";
import { ServiceFlowNext } from "./public/intro-primitives";
import { IntroTabs, type IntroTab } from "./public/intro-tabs";
import { parseProductTourLocation } from "./product-tour-location";
import type { ProductTourPlaybackController } from "./product-tour-playback";
import {
  PRODUCT_ROLES,
  PRODUCT_TOUR,
  PRODUCT_TOUR_COPY,
  formatProductTourTime,
  productTourChapterHref,
} from "./product-tour-content";

import "./marketing-page.css";
import "./product-tour-page.css";

const POSTER_URL = `${SITE_URL}${PRODUCT_TOUR.poster}`;

/** 영상 아래 보조 탭: 챕터별 기능 · 역할별 시작 · 영상 이후 더해진 기능. */
type TourMoreTab = "chapters" | "roles" | "new";

export function ProductTourPage() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourPage");
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  const [searchParams] = useSearchParams();
  const tourStartParam = searchParams.get("t") ?? "0";
  const heroStart = parseProductTourLocation(`?${searchParams.toString()}`).seconds;
  const playerController = useRef<ProductTourPlaybackController>(null);

  useDocumentTitle(copy.pageTitle);
  useMetaDescription(copy.metaDescription);
  usePageSocialMeta({
    canonicalPath: "/product-tour",
    title: copy.pageTitle,
    description: copy.metaDescription,
    image: POSTER_URL,
    imageAlt: copy.pageTitle,
  });
  useJsonLd({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: copy.pageTitle,
    description: copy.metaDescription,
    thumbnailUrl: POSTER_URL,
    contentUrl: `${SITE_URL}${PRODUCT_TOUR.src}`,
    embedUrl: `${SITE_URL}/product-tour#product-tour-video`,
    duration: "PT8M24S",
    inLanguage: getActiveI18nLocale(),
    isFamilyFriendly: true,
    hasPart: PRODUCT_TOUR.chapters.map((chapter) => ({
      "@type": "Clip",
      name: bi(chapter.ko, chapter.en),
      startOffset: chapter.start,
      endOffset: chapter.end,
      url: `${SITE_URL}${productTourChapterHref(chapter.start)}`,
    })),
  });

  /**
   * 재생은 사용자 클릭 안에서 시작해야 소리가 막히지 않는다(재생 전에는 영상·음성을 받지 않는다).
   * 히어로 버튼과 '이 장면부터 보기'가 모두 이 경로로 한 번에 재생한다. 제어기가 없으면 딥링크로 이동한다.
   */
  const watchScene = (seconds: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    const controller = playerController.current;
    if (!controller || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    document.getElementById("product-tour-video")?.scrollIntoView({ block: "start" });
    controller.playFrom(seconds, event);
  };

  const moreTabs: readonly IntroTab<TourMoreTab>[] = [
    { id: "chapters", label: bi("챕터별 기능", "Chapter features"), icon: Film },
    { id: "roles", label: bi("역할별 시작", "By role"), icon: Users },
    { id: "new", label: bi("새로 더해진 기능", "New since the tour"), icon: Sparkles },
  ];

  return (
    <div className="mk-page product-tour" lang={locale}>
      <header className="mk-shell product-tour__hero">
        <div className="product-tour__hero-copy">
          <p className="mk-eyebrow"><Clapperboard size={15} aria-hidden="true" />{copy.eyebrow}</p>
          <h1 className="mk-title">{copy.title[0]} <em>{copy.title[1]}</em></h1>
          <p className="mk-lead">{copy.intro}</p>
          <div className="mk-actions">
            <a className="mk-button mk-button--primary" href="#product-tour-video" onClick={watchScene(heroStart)}><CirclePlay size={18} aria-hidden="true" />{copy.watch}</a>
            <Link className="mk-button" href="/studio/new">{copy.start}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <ul className="mk-chip-list mk-chip-list--rail" aria-label={copy.factsLabel}>
            {copy.facts.map((fact) => <li key={fact} className="mk-chip">{fact}</li>)}
          </ul>
        </div>
      </header>

      <section className="product-tour__player-shell" aria-label={copy.watch}>
        <ProductTourPlayer key={tourStartParam} locale={locale} controllerRef={playerController} />
      </section>

      <section className="mk-shell product-tour__more" aria-labelledby="product-tour-features-title">
        <div className="product-tour__more-head">
          <p className="mk-eyebrow">{copy.featuresEyebrow}</p>
          <h2 id="product-tour-features-title" className="mk-h2">{copy.featuresTitle}</h2>
        </div>
        <IntroTabs
          tabs={moreTabs}
          fallback="chapters"
          label={bi("영상 이후 둘러보기", "After the film")}
          idPrefix="product-tour-more"
          param="view"
          mount="all"
          className="product-tour__tabs"
          panelClassName="mt-4"
        >
          {(id) => id === "chapters" ? (
            <>
              <p className="mk-body product-tour__note">{copy.featuresBody}</p>
              <ol className="product-tour-page__journey-grid mk-rail">
                {PRODUCT_TOUR.chapters.map((chapter, index) => {
                  const title = bi(chapter.ko, chapter.en);
                  return (
                    <li key={chapter.id} className="product-tour__feature mk-card">
                      <figure data-visual={chapter.visual}>
                        <img src={chapter.image} alt="" width={1440} height={1000} loading="lazy" decoding="async" />
                        <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{formatProductTourTime(chapter.start)}</figcaption>
                        <span className="product-tour__visual-badge">
                          {chapter.visual === "concept" ? <Sparkles size={13} aria-hidden="true" /> : <ImageIcon size={13} aria-hidden="true" />}
                          {chapter.visual === "concept" ? copy.conceptBadge : copy.captureBadge}
                        </span>
                      </figure>
                      <div className="product-tour__feature-copy">
                        <h3>{title}</h3>
                        <p>{bi(chapter.summary.ko, chapter.summary.en)}</p>
                        <div className="product-tour__feature-actions">
                          <Link className="mk-link" href={chapter.feature.href}>
                            {copy.visualOpen}<span className="product-tour__feature-name">· {bi(chapter.feature.ko, chapter.feature.en)}</span><ArrowUpRight size={15} aria-hidden="true" />
                          </Link>
                          <a className="product-tour__scene-link" href={productTourChapterHref(chapter.start)} onClick={watchScene(chapter.start)}>
                            <CirclePlay size={15} aria-hidden="true" />{copy.watchScene}
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : id === "roles" ? (
            <>
              <p className="mk-body product-tour__note">{copy.rolesBody}</p>
              <div className="product-tour__role-grid mk-rail">
                {PRODUCT_ROLES.map((role) => {
                  const [title, body] = bi(role.ko, role.en);
                  return (
                    <Link href={role.href} key={role.tag} className="product-tour__role mk-card">
                      <span className="mk-badge"><Users size={13} aria-hidden="true" />{role.tag}</span>
                      <h3>{title}</h3>
                      <p>{body}</p>
                      <small>{bi("이 역할로 시작", "Start in this role")}<ArrowRight size={14} aria-hidden="true" /></small>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : (
            <ProductTourAdditions />
          )}
        </IntroTabs>
      </section>

      <section className="mk-shell product-tour__next" aria-label={bi("이어서 보기", "Keep exploring")}>
        <ServiceFlowNext current="tour" />
        <div className="product-tour__next-links">
          <Link className="mk-link" href="/brand-film">{copy.brandFilm}<ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <details className="mk-fold">
          <summary>
            <span className="mk-fold__text"><span className="mk-fold__title">{bi("기술·발표 자료 이어 보기", "Continue with the engineering and presentation material")}</span></span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <ServiceStoryJourney current="tour" />
        </details>
      </section>
    </div>
  );
}
