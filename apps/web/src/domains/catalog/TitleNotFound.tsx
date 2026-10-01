import { Compass, Search, SearchX } from "lucide-react";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { TitleDetailBreadcrumb } from "./TitleDetailBreadcrumb";
import { titleSlugSearchQuery } from "./title-slug-query";

/**
 * 작품을 찾지 못했을 때의 화면 — 일반 404 대신 주소에서 작품명을 되살려 바로 검색으로 잇는다.
 */
export function TitleNotFound({ slug }: { readonly slug: string | undefined }) {
  const bt = useBilingual("TitleNotFound");
  const query = titleSlugSearchQuery(slug);
  return (
    <Container size="wide" className="py-8 lg:py-10">
      <TitleDetailBreadcrumb />
      <SitePageHeader
        icon={SearchX}
        eyebrow="STORY NOT FOUND"
        title={bt("이 주소의 작품을 찾지 못했어요", "We couldn't find a story at this address")}
        description={bt(
          "주소가 바뀌었거나 공개 카탈로그에서 내려간 작품일 수 있어요. 작품명으로 다시 찾아보세요.",
          "The address may have changed, or the story may have left the public catalog. Try searching by title.",
        )}
        actions={
          <>
            <Link
              href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
              className={buttonClass({ size: "md", className: "min-h-11 gap-1.5" })}
            >
              <Search size={16} aria-hidden="true" />
              {query ? `“${query}” ${bt("검색하기", "search")}` : bt("작품 검색", "Search stories")}
            </Link>
            <Link href="/discover" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11 gap-1.5" })}>
              <Compass size={16} aria-hidden="true" />
              {bt("탐색 허브로", "Go to Discover")}
            </Link>
          </>
        }
      />
    </Container>
  );
}
