import {
  getCurrentUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { SITE_URL } from "@toonspectrum/core";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  FileOutput,
  GraduationCap,
  Music2,
  PackageCheck,
  PanelsTopLeft,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import Link from "@/compat/router-link";
import { useDocumentTitle, useJsonLd, useMetaDescription, usePageSocialMeta } from "@/hooks/use-document-title";
import { useI18n } from "@/shared/lib/i18n";

import { creatorHomeLocale } from "./creator-home-content";
import { CreatorFeatureReels } from "./CreatorFeatureReels";
import { ProductTourPlayer } from "./ProductTourPlayer";
import { PRODUCT_ADVANTAGES, PRODUCT_CAPABILITIES, PRODUCT_ROLES, PRODUCT_TOUR, PRODUCT_TOUR_COPY } from "./product-tour-content";

import "./creator-home.css";
import "./product-tour-page.css";
import {
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("ProductTourPage", ko, en);

const CAPABILITY_ICONS: readonly LucideIcon[] = [
  BookOpen,
  Brush,
  PanelsTopLeft,
  Boxes,
  Sparkles,
  Workflow,
  PackageCheck,
  Music2,
  GraduationCap,
];
const POSTER_URL = `${SITE_URL}${PRODUCT_TOUR.poster}`;

export function ProductTourPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const copy = bi((PRODUCT_TOUR_COPY).ko, (PRODUCT_TOUR_COPY).en);

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
      name: bi((chapter).ko, (chapter).en),
      startOffset: chapter.start,
      endOffset: chapter.end,
      url: `${SITE_URL}/product-tour#product-tour-video`,
    })),
  });

  return (
    <main className="creator-home product-tour-page" lang={locale}>
      <header className="product-tour-page__hero">
        <div className="product-tour-page__hero-copy">
          <Link href="/" className="product-tour-page__back">
            <ArrowLeft size={16} aria-hidden="true" />
            {bi("홈으로", "Back home")}
          </Link>
          <p className="ch-eyebrow"><Sparkles size={14} aria-hidden="true" />{copy.eyebrow}</p>
          <h1>{copy.title[0]}<br /><span>{copy.title[1]}</span></h1>
          <p>{copy.intro}</p>
          <div className="ch-actions">
            <a className="ch-button ch-button--primary" href="#product-tour-video">{copy.watch}<ArrowRight size={17} aria-hidden="true" /></a>
            <Link className="ch-button ch-button--quiet" href="/studio/new">{copy.start}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="product-tour-page__hero-visual">
          <img src={PRODUCT_TOUR.poster} width={1280} height={720} alt="" fetchPriority="high" />
          <span>{translateCurrentStaticSourceText("domains.marketing.ProductTourPage", "en", "LONG-FORM REMOTION TOUR · 08:24")}</span>
        </div>
        <dl className="product-tour-page__facts" aria-label={bi("제품 투어 정보", "Product tour facts")}>
          {copy.facts.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </header>

      <ProductTourPlayer locale={locale} />

      <section className="product-tour-page__interactive" aria-labelledby="product-tour-interactive-title">
        <div className="product-tour-page__interactive-heading">
          <p className="ch-eyebrow">{bi("INTERACTIVE QUICK LOOK", "INTERACTIVE QUICK LOOK")}</p>
          <h2 id="product-tour-interactive-title">{bi("영상에서 본 기능을, 직접 골라 비교해보세요.", "Pick and compare the capabilities you just saw.")}</h2>
          <p>{bi("긴 영상은 전체 흐름을 설명하고, 이 인터랙티브 워크스루는 2D·3D·소재·저장·협업·게시의 핵심 결과를 즉시 비교할 수 있게 합니다.", "The long film explains the full journey; this interactive walkthrough lets you compare the outcomes of 2D, 3D, assets, continuity, collaboration and publishing immediately.")}</p>
        </div>
        <CreatorFeatureReels showFilm={false} embedded />
      </section>

      <section className="product-tour-page__journey" aria-labelledby="product-tour-journey-title">
        <header>
          <p className="ch-eyebrow">{copy.journeyEyebrow}</p>
          <h2 id="product-tour-journey-title">{copy.journeyTitle}</h2>
          <p>{copy.journeyBody}</p>
        </header>
        <div className="product-tour-page__journey-grid">
          {PRODUCT_TOUR.chapters.map((chapter, index) => (
            <article key={chapter.id}>
              <figure>
                <img src={chapter.image} alt="" width={1440} height={1000} loading="lazy" />
                <span>{String(index + 1).padStart(2, "0")} · {bi((chapter).ko, (chapter).en)}</span>
              </figure>
              <div>
                <h3>{bi((chapter).ko, (chapter).en)}</h3>
                <p>{bi((chapter.summary).ko, (chapter.summary).en)}</p>
                <Link href={chapter.route}>{copy.visualOpen}<ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="product-tour-page__capabilities" aria-labelledby="product-tour-capabilities-title">
        <header>
          <p className="ch-eyebrow">{copy.capabilitiesEyebrow}</p>
          <h2 id="product-tour-capabilities-title">{copy.capabilitiesTitle}</h2>
          <p>{copy.capabilitiesBody}</p>
        </header>
        <div className="product-tour-page__capability-grid">
          {PRODUCT_CAPABILITIES.map((item, index) => {
            const Icon = CAPABILITY_ICONS[index] ?? FileOutput;
            const [title, body] = bi((item).ko, (item).en);
            return (
              <Link href={item.href} className="product-tour-page__capability" key={item.id}>
                <span><Icon size={20} strokeWidth={1.7} aria-hidden="true" />{item.tag}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <small>{bi("기능 열기", "Open workspace")}<ArrowRight size={14} aria-hidden="true" /></small>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="product-tour-page__advantages" aria-labelledby="product-tour-advantages-title">
        <div className="product-tour-page__section-heading">
          <p className="ch-eyebrow">{copy.advantagesEyebrow}</p>
          <h2 id="product-tour-advantages-title">{copy.advantagesTitle}</h2>
        </div>
        <ol className="product-tour-page__advantage-grid">
          {PRODUCT_ADVANTAGES.map((item, index) => {
            const [title, body] = bi((item).ko, (item).en);
            return <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></li>;
          })}
        </ol>
      </section>

      <section className="product-tour-page__roles" aria-labelledby="product-tour-roles-title">
        <header>
          <div><p className="ch-eyebrow">{copy.rolesEyebrow}</p><h2 id="product-tour-roles-title">{copy.rolesTitle}</h2></div>
          <p>{copy.rolesBody}</p>
        </header>
        <div className="product-tour-page__role-grid">
          {PRODUCT_ROLES.map((role) => {
            const [title, body] = bi((role).ko, (role).en);
            return (
              <Link href={role.href} key={role.tag}>
                <span><Users size={17} aria-hidden="true" />{role.tag}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <small>{bi("이 역할로 시작", "Start in this role")}<ArrowRight size={14} aria-hidden="true" /></small>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="product-tour-page__closing" aria-labelledby="product-tour-closing-title">
        <div>
          <p className="ch-eyebrow">{translateCurrentStaticSourceText("domains.marketing.ProductTourPage", "en", "CREATE YOUR NEXT STORY")}</p>
          <h2 id="product-tour-closing-title">{copy.closingTitle}</h2>
          <p>{copy.closingBody}</p>
        </div>
        <div className="product-tour-page__closing-actions">
          <Link className="ch-button ch-button--primary" href="/studio/new">{copy.start}<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link className="ch-button ch-button--quiet" href="/brand-film">{bi("24초 브랜드 필름", "24-second brand film")}</Link>
        </div>
      </section>
    </main>
  );
}
