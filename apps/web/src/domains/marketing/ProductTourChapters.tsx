import { ArrowRight, ArrowUpRight, Captions, ChevronRight, Keyboard, Volume2 } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import {
  PRODUCT_TOUR,
  PRODUCT_TOUR_COPY,
  formatProductTourTime,
  type ProductTourChapter,
} from "./product-tour-content";
import type { ProductTourSeek } from "./product-tour-playback";

const CHAPTERS: readonly ProductTourChapter[] = PRODUCT_TOUR.chapters;
const SCOPE = "domains.marketing.ProductTourChapters";

/** 두 재생기(Remotion·호환 MP4)가 공유하는 제목·챕터·현재 장면·대본 UI. */
export function ProductTourPlayerHeading() {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  return (
    <header className="product-tour-player__heading">
      <div>
        <p className="mk-eyebrow">{copy.videoEyebrow}</p>
        <h2 id="product-tour-video-title" className="mk-h2">{copy.videoTitle}</h2>
      </div>
      <div>
        <p>{copy.videoBody}</p>
        <span><Volume2 size={15} aria-hidden="true" />{copy.audioNote}</span>
      </div>
    </header>
  );
}

export function ProductTourChapterRail({ activeChapter, onSeek }: {
  readonly activeChapter: number;
  readonly onSeek: ProductTourSeek;
}) {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  return (
    <nav className="product-tour-player__rail" aria-label={copy.chaptersLabel}>
      <p className="product-tour-player__rail-title">
        <span>{copy.chaptersLabel}</span>
        <small>{CHAPTERS.length} · {formatProductTourTime(PRODUCT_TOUR.duration)}</small>
      </p>
      <ol className="product-tour-player__chapters">
        {CHAPTERS.map((chapter, index) => {
          const active = index === activeChapter;
          const title = bi(chapter.ko, chapter.en);
          const feature = bi(chapter.feature.ko, chapter.feature.en);
          return (
            <li className="product-tour-player__chapter" data-active={active || undefined} key={chapter.id}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClickCapture={(event) => onSeek(chapter.start, event)}
              >
                <span className="product-tour-player__chapter-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <strong>{title}</strong>
                <small>{formatProductTourTime(chapter.start)}</small>
                <i className="product-tour-player__chapter-progress" aria-hidden="true" />
              </button>
              <Link href={chapter.feature.href} aria-label={`${title} — ${copy.visualOpen}: ${feature}`} title={`${copy.visualOpen}: ${feature}`}>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** 지금 보는 챕터의 요약과 '이 기능 열기'·관련 기능·다음 장면을 한곳에 모은다. */
export function ProductTourNowPanel({ activeChapter, onSeek }: {
  readonly activeChapter: number;
  readonly onSeek: ProductTourSeek;
}) {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  const chapter = CHAPTERS[activeChapter] ?? CHAPTERS[0];
  if (!chapter) return null;
  const next = CHAPTERS[activeChapter + 1];
  const title = bi(chapter.ko, chapter.en);
  const feature = bi(chapter.feature.ko, chapter.feature.en);
  return (
    <section className="product-tour-player__now" aria-labelledby="product-tour-now-title">
      <div className="product-tour-player__now-copy">
        <p className="product-tour-player__now-label">
          <span>{copy.nowPlaying}</span>
          <small>{String(activeChapter + 1).padStart(2, "0")} · {formatProductTourTime(chapter.start)}–{formatProductTourTime(chapter.end)}</small>
        </p>
        <h3 id="product-tour-now-title">{title}</h3>
        <p>{bi(chapter.summary.ko, chapter.summary.en)}</p>
      </div>
      <div className="product-tour-player__now-actions">
        <Link className="mk-button mk-button--primary" href={chapter.feature.href}>
          {copy.visualOpen}<span className="product-tour-player__now-feature">· {feature}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        {chapter.related.length > 0 ? (
          <div className="product-tour-player__related">
            <span>{copy.related}</span>
            <ul>
              {chapter.related.map((link) => (
                <li key={link.href}>
                  <Link className="mk-chip" href={link.href}>{bi(link.ko, link.en)}<ChevronRight size={13} aria-hidden="true" /></Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {next ? (
          <button type="button" className="product-tour-player__next" onClickCapture={(event) => onSeek(next.start, event)}>
            <span>{copy.upNext}</span>
            <strong>{bi(next.ko, next.en)}</strong>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ProductTourKeyboardHint() {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  return <p className="product-tour-player__keyboard"><Keyboard size={14} aria-hidden="true" />{copy.keyboardHint}</p>;
}

export function ProductTourTranscript({ onSeek }: { readonly onSeek: ProductTourSeek }) {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  return (
    <details className="product-tour-player__transcript">
      <summary><Captions size={15} aria-hidden="true" />{copy.transcript}</summary>
      <ol>
        {CHAPTERS.map((chapter) => (
          <li key={`${chapter.id}-transcript`}>
            <button type="button" onClickCapture={(event) => onSeek(chapter.start, event)}>
              {formatProductTourTime(chapter.start)}
            </button>
            <div>
              <strong>{bi(chapter.ko, chapter.en)}</strong>
              <span>{bi(chapter.summary.ko, chapter.summary.en)}</span>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
