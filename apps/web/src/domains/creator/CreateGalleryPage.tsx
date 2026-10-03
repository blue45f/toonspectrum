// 창작 갤러리(/showcase) — 첫 화면(ShowcaseHero) → 보기 조절 줄(GalleryToolbar) → 탭 본문(GalleryTabPanel) → 발행 안내.
// 보기 조건은 주소 검색 문자열이 단일 출처(gallery-query)라 새로고침·공유 링크에서도 같은 화면이 열린다.
import { Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { GalleryToolbar } from "./publishing/GalleryControls";
import { GalleryTabPanel } from "./publishing/GalleryTabPanels";
import { parseGalleryView, patchSearchParams } from "./publishing/gallery-query";
import { ShowcaseHero } from "./publishing/ShowcaseHero";

import { Container } from "@/shared/components/section";
import { CreativeJourneyLinks } from "@/shared/components/public-creative";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function CreateGalleryPage() {
  const bt = useBilingual("CreateGalleryPage");
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseGalleryView(searchParams);

  const patchView = (patch: Readonly<Record<string, string | null>>) => {
    setSearchParams(patchSearchParams(searchParams, patch), { replace: true });
  };
  const clearAllFilters = () => patchView({ tag: null, content: null, provenance: null, portfolio: null });

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <ShowcaseHero />
      <GalleryToolbar view={view} onPatch={patchView} />
      <GalleryTabPanel view={view} onResetFilters={clearAllFilters} />

      <section
        aria-labelledby="showcase-publish-cta"
        className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/40 p-4 sm:p-5"
      >
        <div className="min-w-0">
          <h2 id="showcase-publish-cta" className="text-base font-bold text-fg">{bt("내 작품도 이곳에 소개해 보세요", "Feature your own work here")}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">{bt("발행할 때 공개 범위를 ‘전체 공개’로 고르면 갤러리에 올라가요.", "Choose “Public” when you publish and your work appears here.")}</p>
        </div>
        <Link href="/studio/publish" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}>
          <Send size={15} aria-hidden />
          {bt("발행하러 가기", "Go to publishing")}
        </Link>
      </section>
      <CreativeJourneyLinks compact />
    </Container>
  );
}
