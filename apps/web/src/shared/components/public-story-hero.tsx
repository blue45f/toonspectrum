import { useState, type ReactNode, type Ref } from "react";

import { SiteArtwork } from "./site-experience/SiteArtwork";
import { ART_VIEW_LABELS, type ArtworkView } from "./site-experience/site-art-direction";
import { useI18n } from "@/shared/lib/i18n";
import "./public-story-hero.css";

interface PublicStoryHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  image: "world" | "process" | "materials";
  imageAlt: string;
  caption: string;
  children?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** The same artwork can be studied in color, values and an illustrative composition grid. */
export function PublicStoryHero({ eyebrow, title, description, image, imageAlt, caption, children, headingRef }: PublicStoryHeroProps) {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const [view, setView] = useState<ArtworkView>("art");
  return (
    <header className="public-story-hero" data-atelier-study={image}>
      <div className="public-story-hero__copy">
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>
        <p className="public-story-hero__description">{description}</p>
        {children && <div className="public-story-hero__actions">{children}</div>}
      </div>
      <figure className="public-story-hero__figure">
        <SiteArtwork image={image} alt={imageAlt} view={view} priority />
        <span className="public-story-hero__edition" aria-hidden="true">TOONSTUDIO / ART STUDY</span>
        <div className="public-story-hero__views" role="group" aria-label={locale === "ko" ? "작품 관찰 방식" : "Artwork study view"}>
          {(["art", "values", "composition"] as const).map((mode) => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{ART_VIEW_LABELS[locale][mode]}</button>)}
        </div>
        <figcaption><span aria-hidden="true" /><div>{caption}<small>{locale === "ko"
          ? (view === "composition" ? "브랜드 콘셉트 아트 · 삼분할 구도 가이드 예시" : "브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다")
          : (view === "composition" ? "Brand concept art · illustrative rule-of-thirds guide" : "Brand concept art · not an editor capture")}</small></div></figcaption>
      </figure>
    </header>
  );
}
