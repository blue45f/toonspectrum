import { useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";
import { artworkSources, type ArtworkKind, type ArtworkView } from "./site-art-direction";
import { illustratedArtworkSource, type IllustratedArtwork } from "./site-illustrated-art";

const ILLUSTRATED_STUDIES: Record<ArtworkKind, {
  readonly artwork: IllustratedArtwork;
  readonly ko: string;
  readonly en: string;
}> = {
  world: { artwork: "background-city", ko: "ToonStudio 도시 배경 콘셉트 아트", en: "ToonStudio city background concept art" },
  process: { artwork: "canvas-noir", ko: "ToonStudio 흑백 웹툰 콘셉트 아트", en: "ToonStudio monochrome webtoon concept art" },
  materials: { artwork: "character-blue", ko: "ToonStudio 캐릭터 콘셉트 아트", en: "ToonStudio character concept art" },
};

interface SiteArtworkProps {
  readonly image: ArtworkKind;
  readonly alt: string;
  readonly view?: ArtworkView;
  readonly priority?: boolean;
  readonly sizes?: string;
}

/** 브랜드 콘셉트 아트만 표시하며 실제 원고·사용자 작품은 교체하지 않는다. */
export function SiteArtwork({ image, alt, view = "art", priority = false, sizes = "(max-width: 767px) 100vw, 50vw" }: SiteArtworkProps) {
  const theme = useTheme((state) => state.resolvedTheme);
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const study = ILLUSTRATED_STUDIES[image];
  const illustratedSource = illustratedArtworkSource(study.artwork);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const illustrated = theme === "starlight" && failedSource !== illustratedSource;
  const src = illustrated ? illustratedSource : `/brand/atelier-${image}-960.webp`;
  return (
    <div className="site-artwork" data-artwork={image} data-artwork-view={view}
      data-artwork-collection={illustrated ? "illustrated-20260928" : "atelier"}>
      <img src={src} srcSet={illustrated ? undefined : artworkSources(image)} sizes={sizes}
        width={1536} height={1024} alt={illustrated && alt ? korean ? study.ko : study.en : alt}
        loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
        onError={illustrated ? () => setFailedSource(illustratedSource) : undefined} />
      <svg className="site-artwork__guides" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M200 0V400 M400 0V400 M0 133H600 M0 267H600" />
        <path className="site-artwork__frame" d="M18 65V18H65 M535 18H582V65 M582 335V382H535 M65 382H18V335" />
        <circle cx="400" cy="133" r="12" /><path d="M382 133H418 M400 115V151" />
      </svg>
      <span className="site-artwork__grain" aria-hidden="true" />
    </div>
  );
}
