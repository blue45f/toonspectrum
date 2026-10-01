import { Brush, MapPinned, PersonStanding, Share2, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { EngineeringArchitectureDiagram } from "./EngineeringArchitectureDiagram";
import type { DeckSectionPlan, DeckSlide } from "./engineering-deck-model";
import { formatClock } from "./engineering-deck-model";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import type { TalkModuleIcon } from "./engineering-talk-deck";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDeckSlide", ko, en);

const MODULE_ICONS: Record<TalkModuleIcon, LucideIcon> = {
  canvas: Brush,
  character: PersonStanding,
  space: MapPinned,
  collab: UsersRound,
  ai: Sparkles,
  publish: Share2,
};

const SITE_HOST = "toonstudio.cloud";

export interface EngineeringDeckSlideProps {
  readonly slide: DeckSlide;
  readonly index: number;
  readonly total: number;
  readonly sections: readonly DeckSectionPlan[];
  /**
   * 항상 16:9 비율로 축소한다(개요 썸네일·다음 슬라이드 미리보기·인쇄).
   * 기본값은 폭이 좁으면 읽기 쉬운 세로 배치로 전환한다.
   */
  readonly fixed?: boolean;
  /** 썸네일처럼 조작 대상이 아닐 때 링크를 일반 텍스트로 바꾸고 스크린 리더에서 숨긴다. */
  readonly decorative?: boolean;
  readonly className?: string;
}

function SlideStatus({ slide }: { readonly slide: DeckSlide }) {
  if (!slide.status) return null;
  const meta = ENGINEERING_STATUS_META[slide.status];
  return (
    <span className="deck-slide__status" data-status={slide.status}>
      {bi(meta.label.ko, meta.label.en)}
    </span>
  );
}

function SlideLink({
  href,
  decorative,
  className,
  children,
}: {
  readonly href: string;
  readonly decorative: boolean;
  readonly className: string;
  readonly children: ReactNode;
}) {
  if (decorative) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function SlideArt({ art }: { readonly art: NonNullable<DeckSlide["art"]> }) {
  return (
    <figure className="deck-slide__art">
      <img src={art.src} alt={art.alt} loading="lazy" decoding="async" width={640} height={637} />
      <figcaption>{bi("브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다", "Brand concept art · not a product screen")}</figcaption>
    </figure>
  );
}

function SlideBody({
  slide,
  sections,
  decorative,
  fixed,
}: {
  readonly slide: DeckSlide;
  readonly sections: readonly DeckSectionPlan[];
  readonly decorative: boolean;
  readonly fixed: boolean;
}) {
  switch (slide.layout) {
    case "cover":
      return (
        <div className={cx("deck-slide__cover", slide.art && "deck-slide__with-art")}>
          <div className="deck-slide__cover-copy">
            <h2 className="deck-slide__title deck-slide__title--hero">{slide.title}</h2>
            <p className="deck-slide__lead">{slide.lead}</p>
            {slide.points.length ? (
              <ul className="deck-slide__chips" aria-label={bi("발표 약속", "Talk promises")}>
                {slide.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            ) : null}
          </div>
          {slide.art ? <SlideArt art={slide.art} /> : null}
        </div>
      );
    case "agenda": {
      const total = sections.reduce((sum, section) => sum + section.seconds, 0) || 1;
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          <ol className="deck-slide__agenda">
            {sections.map((section) => (
              <li key={section.id} style={{ "--deck-share": `${(section.seconds / total) * 100}%` } as CSSProperties}>
                <span className="deck-slide__agenda-order">{String(section.order).padStart(2, "0")}</span>
                <span className="deck-slide__agenda-title">{section.title}</span>
                <span className="deck-slide__agenda-time">{formatClock(section.seconds)}</span>
                <span className="deck-slide__agenda-bar" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      );
    }
    case "modules":
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          <ul className="deck-slide__modules">
            {(slide.modules ?? []).map((module) => {
              const Icon = MODULE_ICONS[module.icon];
              return (
                <li key={module.id}>
                  <span className="deck-slide__module-icon" aria-hidden="true"><Icon /></span>
                  <span className="deck-slide__module-copy">
                    <strong>{module.title}</strong>
                    <span>{module.body}</span>
                    {module.href ? <code>{module.href}</code> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    case "demo":
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          <ol className="deck-slide__demo">
            {(slide.demoSteps ?? []).map((step, stepIndex) => (
              <li key={`${step.href}-${step.action}`}>
                <span className="deck-slide__demo-step" aria-hidden="true">{stepIndex + 1}</span>
                <strong>{step.action}</strong>
                <span>{step.expected}</span>
                <SlideLink href={step.href} decorative={decorative} className="deck-slide__demo-link">
                  {step.href}
                </SlideLink>
              </li>
            ))}
          </ol>
        </div>
      );
    case "diagram":
      return (
        <div className="deck-slide__diagram-layout">
          <h2 className="deck-slide__title deck-slide__title--compact">{slide.title}</h2>
          <EngineeringArchitectureDiagram className="deck-slide__diagram" fixed={fixed} />
          <p className="deck-slide__caption">{slide.lead}</p>
        </div>
      );
    case "metrics":
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          {slide.facts?.length ? (
            <dl className="deck-slide__metrics">
              {slide.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ol className="deck-slide__points deck-slide__points--row">
            {slide.points.map((point, pointIndex) => (
              <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
            ))}
          </ol>
        </div>
      );
    case "lessons":
    case "statement": {
      const content = (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          {slide.statusChips?.length ? (
            <ul className="deck-slide__status-strip" aria-label={bi("현재 상태", "Current status")}>
              {slide.statusChips.map((chip) => {
                const meta = ENGINEERING_STATUS_META[chip.status];
                return (
                  <li key={chip.id}>
                    <span>{chip.title}</span>
                    <span className="deck-slide__status" data-status={chip.status}>{bi(meta.label.ko, meta.label.en)}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ol
            className={cx(
              "deck-slide__points",
              slide.art ? "deck-slide__points--column" : slide.points.length === 4 ? "deck-slide__points--grid" : "deck-slide__points--row",
            )}
          >
            {slide.points.map((point, pointIndex) => (
              <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
            ))}
          </ol>
          {slide.facts?.length ? (
            <dl className="deck-slide__facts deck-slide__facts--inline">
              {slide.facts.map((fact) => (
                <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
              ))}
            </dl>
          ) : null}
          {slide.question && slide.layout === "statement" ? (
            <p className="deck-slide__question"><span aria-hidden="true">Q</span>{slide.question}</p>
          ) : null}
        </div>
      );
      return slide.art ? (
        <div className="deck-slide__with-art">
          {content}
          <SlideArt art={slide.art} />
        </div>
      ) : content;
    }
    case "qa":
      return (
        <div className="deck-slide__qa">
          <div>
            <h2 className="deck-slide__title deck-slide__title--hero">{slide.title}</h2>
            <p className="deck-slide__lead">{slide.lead}</p>
          </div>
          <ul className="deck-slide__qa-links">
            {(slide.links ?? []).map((link) => (
              <li key={link.href}>
                <SlideLink href={link.href} decorative={decorative} className="deck-slide__qa-link">
                  <strong>{link.label}</strong>
                  <code>{SITE_HOST}{link.href}</code>
                </SlideLink>
              </li>
            ))}
          </ul>
        </div>
      );
    case "tech":
    case "chapter":
      return (
        <div className="deck-slide__tech">
          <div className="deck-slide__tech-head">
            <div>
              <h2 className="deck-slide__title">{slide.title}</h2>
              <p className="deck-slide__lead">{slide.lead}</p>
            </div>
            {slide.facts?.length ? (
              <dl className="deck-slide__facts">
                {slide.facts.map((fact) => (
                  <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                ))}
              </dl>
            ) : null}
          </div>
          {slide.flow?.length ? (
            <ol className="deck-slide__flow" aria-label={bi("동작 흐름", "Execution flow")}>
              {slide.flow.map((step) => <li key={step}>{step}</li>)}
            </ol>
          ) : null}
          <ol className="deck-slide__points deck-slide__points--row">
            {slide.points.map((point, pointIndex) => (
              <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
            ))}
          </ol>
        </div>
      );
  }
}

/** 16:9 발표 슬라이드. 크기는 컨테이너 폭 기준(cqw)으로 비례 확대·축소한다. */
export function EngineeringDeckSlide({
  slide,
  index,
  total,
  sections,
  fixed = false,
  decorative = false,
  className,
}: EngineeringDeckSlideProps) {
  useBilingualI18nRevision();
  const section = sections.find((item) => item.id === slide.sectionId);
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;

  return (
    <div
      className={cx("deck-frame", className)}
      data-fixed={fixed ? "true" : undefined}
      aria-hidden={decorative || undefined}
    >
      <article
        className={cx("deck-slide", `deck-slide--${slide.layout}`)}
        data-deck-slide="true"
        data-slide-id={slide.id}
        aria-roledescription={decorative ? undefined : bi("슬라이드", "slide")}
        aria-label={decorative ? undefined : `${index + 1} / ${total} · ${slide.title}`}
      >
        <header className="deck-slide__top">
          <p className="deck-slide__eyebrow">{slide.eyebrow}</p>
          <div className="deck-slide__meta">
            <SlideStatus slide={slide} />
            <span className="deck-slide__brand">ToonStudio</span>
            <span className="deck-slide__count">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
        </header>
        <div className="deck-slide__body">
          <SlideBody slide={slide} sections={sections} decorative={decorative} fixed={fixed} />
        </div>
        <footer className="deck-slide__foot">
          {slide.stack?.length ? (
            <ul className="deck-slide__stack-chips" aria-label={bi("사용 기술", "Technologies")}>
              {slide.stack.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <span className="deck-slide__section-name">{section?.title ?? ""}</span>
          )}
          <span className="deck-slide__host">{SITE_HOST}</span>
        </footer>
        <div className="deck-slide__progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </article>
    </div>
  );
}
