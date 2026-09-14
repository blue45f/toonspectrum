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
        <img src={`/brand/atelier-${image}.webp`} alt={imageAlt} width={1536} height={1024} decoding="async" className="public-story-hero__image" />
        <div className="public-story-hero__study-mark" aria-hidden="true"><span>TOONSTUDIO</span><span>{image === "world" ? "COMPOSITION STUDY" : image === "process" ? "SKETCH → INK → COLOR" : "THE MATERIAL LIBRARY"}</span></div>
        <div className="public-story-hero__registration" aria-hidden="true"><i /><i /><i /><i /></div>
        <figcaption><span aria-hidden="true" />{caption}</figcaption>
      </figure>
    </header>
  );
}
