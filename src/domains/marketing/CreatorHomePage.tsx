import { ArrowDown, ArrowRight, Box, Brush, Check, Layers, LayoutGrid, MousePointer2, Play, Plus, Square, Type } from "lucide-react";
import { useRef, useState } from "react";

import { CREATOR_FILM, HOME_COPY, creatorHomeLocale, type CreatorHomeCopy } from "./creator-home-content";
import "./creator-home.css";

import { useI18n } from "@/lib/i18n";
import Link from "@/src/compat/router-link";

const FEATURE_ICONS = [Brush, LayoutGrid, Box, Layers] as const;

function StudioPreview({ copy, stage }: { copy: CreatorHomeCopy; stage: number }) {
  return (
    <figure className={`ch-workspace ch-workspace--${copy.stages[stage].id}`} aria-label={copy.previewNote}>
      <div className="ch-windowbar"><span className="ch-windowdots" aria-hidden="true"><i /><i /><i /></span><span>{copy.preview}</span><span className="ch-window-status"><Check size={12} aria-hidden="true" /> ToonStudio</span></div>
      <div className="ch-editor">
        <div className="ch-tools" aria-hidden="true"><MousePointer2 size={17} /><span><Brush size={17} /></span><Square size={17} /><Type size={17} /><Layers size={17} /><Plus size={17} /></div>
        <div className="ch-canvas"><div className="ch-art-title"><span>CHAPTER 01</span><span>{copy.example}</span></div><img className="ch-scene" src="/brand/studio-scene.svg" alt="" width={720} height={560} fetchPriority="high" /><div className="ch-caption" aria-hidden="true">{stage === 1 ? "Every story starts with a little courage." : "MAKE SOMETHING ONLY YOU CAN MAKE."}</div></div>
        <div className="ch-inspector" aria-hidden="true"><span>{copy.layer}</span><div className="ch-swatches"><i /><i /><i /><i /></div><div className="ch-layer"><span />{copy.scene} 03</div><div className="ch-layer"><span />{copy.scene} 02</div><div className="ch-layer is-selected"><span />{copy.scene} 01</div><div className="ch-inspector-lines"><i /><i /><i /></div></div>
      </div>
      <figcaption className="ch-workspace-footer"><span>{copy.previewNote}</span><span>100%</span></figcaption>
    </figure>
  );
}

function Film({ copy, locale }: { copy: CreatorHomeCopy; locale: "ko" | "en" }) {
  const [mode, setMode] = useState<"poster" | "playing" | "error">("poster");
  const [start, setStart] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playAt = (seconds: number) => {
    setStart(seconds);
    setMode("playing");
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play().catch(() => { /* Native controls remain available if playback is blocked. */ });
    }
  };
  return (
    <section className="ch-film-section" id="creator-film" aria-labelledby="creator-film-title">
      <div className="ch-film-heading"><p className="ch-eyebrow">{copy.filmEyebrow}</p><h2 id="creator-film-title">{copy.filmTitle}</h2><p>{copy.filmBody}</p></div>
      <div className="ch-film-frame">
        {mode === "playing" ? <video ref={videoRef} src={CREATOR_FILM.src} controls autoPlay muted playsInline preload="metadata" poster={CREATOR_FILM.poster} aria-label={copy.filmLabel} onLoadedMetadata={(event) => { event.currentTarget.currentTime = start; }} onError={() => setMode("error")}><track kind="captions" src={locale === "ko" ? CREATOR_FILM.captions : "/brand/toonstudio-intro.en.vtt"} srcLang={locale} label={locale === "ko" ? "한국어" : "English"} default /></video> : <button type="button" className="ch-film-poster" onClick={() => playAt(0)} aria-label={copy.filmPlay} data-testid="creator-film-play"><img src={CREATOR_FILM.poster} width={1280} height={720} loading="lazy" alt="" /><span className="ch-play-disc"><Play size={27} fill="currentColor" aria-hidden="true" /></span><span className="ch-film-caption">TOONSTUDIO BRAND FILM <span>00:24</span></span></button>}
      </div>
      {mode === "error" && <p className="ch-film-error" role="alert">{copy.filmError} <button type="button" onClick={() => playAt(0)}>{copy.retry}</button></p>}
      <div className="ch-film-chapters" aria-label={copy.filmLabel}>{CREATOR_FILM.chapters.map((seconds, index) => <button type="button" key={seconds} onClick={() => playAt(seconds)}><span>00:{String(seconds).padStart(2, "0")}</span>{copy.chapterLabels[index]}</button>)}</div>
      <div className="ch-film-details"><details><summary>{copy.transcript}</summary><p>{copy.transcriptBody}</p></details>{mode === "playing" && <button type="button" onClick={() => setMode("poster")}>{copy.filmReset}</button>}</div>
    </section>
  );
}

export function CreatorHomePage() {
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const copy = HOME_COPY[locale];
  const [stage, setStage] = useState(0);
  const selectedStage = copy.stages[stage];
  return (
    <div className="creator-home" lang={locale} data-creator-home="studio-first">
      <div className="ch-shell">
        <section className="ch-hero" aria-labelledby="creator-home-title">
          <div className="ch-hero-copy"><p className="ch-eyebrow"><span className="ch-live-dot" />{copy.eyebrow}</p><h1 id="creator-home-title">{copy.title[0]}<br /><span>{copy.title[1]}</span></h1><p className="ch-lead">{copy.description}</p><div className="ch-actions"><Link href="/studio" className="ch-button ch-button--primary">{copy.start}<ArrowRight size={19} aria-hidden="true" /></Link><a href="#creator-film" className="ch-button ch-button--quiet"><Play size={15} aria-hidden="true" />{copy.watch}</a></div><p className="ch-hero-note"><Check size={14} aria-hidden="true" />{copy.note}</p></div>
          <div className="ch-hero-visual"><span className="ch-visual-label" aria-hidden="true">A LITTLE IDEA. A WHOLE NEW WORLD.</span><StudioPreview copy={copy} stage={stage} /><div className="ch-preview-options" aria-label={copy.tools}>{copy.stages.map((item, index) => <button key={item.id} type="button" aria-pressed={stage === index} aria-controls="creator-stage-description" onClick={() => setStage(index)}>{item.label}</button>)}</div></div>
        </section>
        <div className="ch-capabilities" aria-label={copy.tools}><span>ONE CREATIVE SPACE</span>{copy.strip.map((item) => <span key={item}><Check size={14} aria-hidden="true" />{item}</span>)}</div>
        <section className="ch-process" aria-labelledby="creator-process-title"><div><p className="ch-eyebrow">{copy.processEyebrow}</p><h2 id="creator-process-title">{copy.processTitle}</h2><p className="ch-section-body">{copy.processBody}</p></div><div className="ch-stage-card" id="creator-stage-description" aria-live="polite"><span className="ch-stage-number" aria-hidden="true">0{stage + 1}</span><div><p className="ch-eyebrow">{selectedStage.label}</p><h3>{selectedStage.title}</h3><p>{selectedStage.body}</p><Link href={selectedStage.href} className="ch-text-link">{selectedStage.action}<ArrowRight size={17} aria-hidden="true" /></Link></div></div></section>
        <section className="ch-toolkit" aria-labelledby="creator-toolkit-title"><div className="ch-section-heading"><div><p className="ch-eyebrow">{copy.toolkitEyebrow}</p><h2 id="creator-toolkit-title">{copy.toolkitTitle}</h2></div><ArrowDown size={30} aria-hidden="true" /></div><div className="ch-feature-grid">{copy.features.map((feature, index) => { const Icon = FEATURE_ICONS[index]; return <article className="ch-feature" key={feature.tag}><div className="ch-feature-top"><Icon size={25} strokeWidth={1.5} aria-hidden="true" /><span>{feature.tag}</span></div><h3>{feature.title}</h3><p>{feature.body}</p><Link href={feature.href} className="ch-text-link">{feature.action}<ArrowRight size={17} aria-hidden="true" /></Link></article>; })}</div></section>
        <Film copy={copy} locale={locale} />
        <section className="ch-inspiration" aria-labelledby="creator-inspiration-title"><p className="ch-eyebrow">{copy.inspirationEyebrow}</p><h2 id="creator-inspiration-title">{copy.inspirationTitle}</h2><div className="ch-discovery-grid"><article><span className="ch-discovery-symbol" aria-hidden="true">✳</span><div><h3>{copy.galleryTitle}</h3><p>{copy.galleryBody}</p><Link href="/create" className="ch-text-link">{copy.galleryAction}<ArrowRight size={17} aria-hidden="true" /></Link></div></article><article><span className="ch-discovery-symbol" aria-hidden="true">↗</span><div><h3>{copy.exploreTitle}</h3><p>{copy.exploreBody}</p><div className="ch-discovery-links"><Link href="/explore" className="ch-text-link">{copy.exploreAction}<ArrowRight size={17} aria-hidden="true" /></Link><Link href="/ranking" className="ch-text-link">{copy.ranking}</Link></div></div></article></div></section>
        <section className="ch-faq" aria-labelledby="creator-faq-title"><h2 id="creator-faq-title">{copy.faqTitle}</h2><div>{copy.faqs.map((faq) => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}</div></section>
        <section className="ch-closing" aria-labelledby="creator-closing-title"><p className="ch-eyebrow">{copy.closingEyebrow}</p><h2 id="creator-closing-title">{copy.closingTitle}</h2><p>{copy.closingNote}</p><Link href="/studio" className="ch-button ch-button--lime">{copy.start}<ArrowRight size={19} aria-hidden="true" /></Link><span className="ch-closing-star" aria-hidden="true">✳</span></section>
      </div>
    </div>
  );
}
