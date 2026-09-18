import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { artworkSources, type ArtworkKind, type ArtworkView } from "./site-art-direction";

interface SiteArtworkProps {
  readonly image: ArtworkKind;
  readonly alt: string;
  readonly view?: ArtworkView;
  readonly priority?: boolean;
  readonly sizes?: string;
}

/** Local concept art, never a fabricated editor capture or community submission. */
export function SiteArtwork({ image, alt, view = "art", priority = false, sizes = "(max-width: 767px) 100vw, 50vw" }: SiteArtworkProps) {
  return (
    <div className="site-artwork" data-artwork={image} data-artwork-view={view}>
      <img src={formatI18nTemplate(translateCurrentStaticSourceText("shared.components.site.experience.SiteArtwork", "en", "/brand/atelier-{v0}-960.webp"), { v0: String(image) })} srcSet={artworkSources(image)} sizes={sizes}
        width={1536} height={1024} alt={alt} loading={priority ? translateCurrentStaticSourceText("shared.components.site.experience.SiteArtwork", "en", "eager") : translateCurrentStaticSourceText("shared.components.site.experience.SiteArtwork", "en", "lazy")}
        fetchPriority={priority ? translateCurrentStaticSourceText("shared.components.site.experience.SiteArtwork", "en", "high") : translateCurrentStaticSourceText("shared.components.site.experience.SiteArtwork", "en", "auto")} decoding="async" />
      <svg className="site-artwork__guides" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M200 0V400 M400 0V400 M0 133H600 M0 267H600" />
        <path className="site-artwork__frame" d="M18 65V18H65 M535 18H582V65 M582 335V382H535 M65 382H18V335" />
        <circle cx="400" cy="133" r="12" /><path d="M382 133H418 M400 115V151" />
      </svg>
      <span className="site-artwork__grain" aria-hidden="true" />
    </div>
  );
}
