import type { ReactNode, Ref } from "react";

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

/** Editorial webtoon artwork, with interactive content outside the illustration. */
export function PublicStoryHero({ eyebrow, title, description, image, imageAlt, caption, children, headingRef }: PublicStoryHeroProps) {
  return (
    <header className="public-story-hero">
      <div className="public-story-hero__copy">
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>
        <p className="public-story-hero__description">{description}</p>
        {children && <div className="public-story-hero__actions">{children}</div>}
      </div>
      <figure className="public-story-hero__figure">
        <img src={`/brand/atelier-${image}.webp`} alt={imageAlt} width={1536} height={1024} decoding="async" className="public-story-hero__image" />
        <figcaption><span aria-hidden="true" />{caption}</figcaption>
      </figure>
    </header>
  );
}
