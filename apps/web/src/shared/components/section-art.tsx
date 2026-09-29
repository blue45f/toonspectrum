/** 섹션 키 비주얼 — AI 생성 일러스트(`/images/section-*.webp`)를 lazy 로딩으로 렌더링.
 *  다크+네온+persimmon 톤의 브랜드 아트. 기본은 장식용(alt="")이며,
 *  의미를 전달해야 할 때만 alt를 전달한다. */
const SECTION_ART_SRC = {
  explore: "/images/section-explore.webp",
  market: "/images/section-market.webp",
  learn: "/images/section-learn.webp",
  community: "/images/section-community.webp",
  fortune: "/images/section-fortune.webp",
  "studio-lobby": "/images/section-studio-lobby.webp",
} as const;

export type SectionArtImage = keyof typeof SECTION_ART_SRC;

export function SectionArt({
  image,
  alt = "",
  eager = false,
  className,
}: {
  readonly image: SectionArtImage;
  readonly alt?: string;
  /** 히어로 등 LCP 영역에서만 true — 기본은 lazy. */
  readonly eager?: boolean;
  readonly className?: string;
}) {
  return (
    <img
      src={SECTION_ART_SRC[image]}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      className={className}
    />
  );
}
