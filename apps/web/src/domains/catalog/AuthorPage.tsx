import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { lazy, Suspense } from "react";
import { SITE_URL } from "@toonspectrum/core/business";
import { PenLine } from "lucide-react";
import { useParams } from "react-router-dom";


import type { Title } from "@/shared/lib/types";

import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { Container } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { GenreChip } from "@/shared/components/ui/chip";
import { Stars } from "@/shared/components/ui/stars";
import { compactPublicShareDescription } from "@/shared/lib/public-share-policy";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/compat/router-link";
import { ErrorState } from "@/components/error-state";
import { NotFoundPage } from "@/components/NotFoundPage";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  useMetaRobots,
  usePageSocialMeta,
} from "@/hooks/use-document-title";
import { useApiResource } from "@/platform/use-api-resource";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

interface AuthorResponse {
  author: string;
  works: Title[];
  totalViews: number;
  avg: number;
  genres: string[];
  generatedAt: string;
  source: string;
}

export function AuthorPage() {
  const { name } = useParams();
  const authorParam = name ?? "";
  // useParams already decodes the segment; decoding again corrupts literal % names.
  const decodedAuthor = authorParam;
  const { data, loading, error, notFound, reload } = useApiResource<AuthorResponse>(
    authorParam ? `/api/authors/${encodeURIComponent(decodedAuthor)}` : null,
    "작가 데이터를 불러오지 못했습니다."
  );

  const author = data?.author ?? decodedAuthor;
  const works = data?.works ?? [];
  const totalViews = data?.totalViews ?? 0;
  const avg = data?.avg ?? 0;
  const genres = data?.genres ?? [];

  const sharePath = authorParam ? `/author/${encodeURIComponent(decodedAuthor)}` : "/authors";
  const shareDescription = compactPublicShareDescription(
    data
      ? `${author} 작가의 작품 ${works.length}편${genres.length ? ` · ${genres.slice(0, 3).join("·")}` : ""}`
      : null,
    `${author} 작가의 작품과 장르별 활동을 한눈에 확인해 보세요.`,
  );

  useDocumentTitle(author || "작가");
  useMetaDescription(data ? `${shareDescription} — 툰스펙트럼에서 작가별로 모아 봅니다.` : null);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: `${author} 작가`,
    description: shareDescription,
    type: "website",
  });
  const canonicalUrl = `${SITE_URL}${sharePath}`;
  const missingAuthor = notFound || (!loading && !error && authorParam && data === null);
  useMetaRobots(missingAuthor ? NOINDEX_PRIVATE_ROBOTS : null);
  useJsonLd(data ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${canonicalUrl}#profile`,
        url: canonicalUrl,
        name: `${author} 작가`,
        description: shareDescription,
        mainEntity: {
          "@type": "Person",
          "@id": `${canonicalUrl}#person`,
          name: author,
          url: canonicalUrl,
          knowsAbout: genres,
        },
        hasPart: works.slice(0, 20).map((work) => ({
          "@type": work.type === "webtoon" ? "ComicSeries" : "CreativeWorkSeries",
          name: work.title,
          url: `${SITE_URL}/title/${encodeURIComponent(work.slug)}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "작가", item: `${SITE_URL}/authors` },
          { "@type": "ListItem", position: 2, name: author, item: canonicalUrl },
        ],
      },
    ],
  } : null);

  if (missingAuthor) return <NotFoundPage />;

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <PenLine size={13} /> {translateCurrentStaticSourceText("domains.catalog.AuthorPage", "en", "AUTHOR")}<Link
              href="/authors"
              className="ml-1.5 normal-case tracking-normal text-fg-3 transition-colors hover:text-accent"
            >
              {translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "· 전체 작가 보기")}</Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{author}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <GenreChip key={genre} genre={genre} size="sm" />
            ))}
          </div>
          {!loading && !error && data && (
            <Suspense fallback={null}>
              <SharePageButton
                path={sharePath}
                text={`${author} 작가`}
                description={shareDescription}
                label="작가 페이지 공유"
                actionLabel="작가 작품 보기"
                className="mt-4"
              />
            </Suspense>
          )}
        </div>
        <dl className="flex flex-wrap items-center gap-6">
          <div>
            <dt className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "참여작")}</dt>
            <dd className="numeral text-2xl text-fg">{works.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "평균 별점")}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="numeral text-2xl text-fg">{avg.toFixed(1)}</span>
              <Stars value={avg} size="sm" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "누적 조회")}</dt>
            <dd className="numeral text-2xl text-fg">{formatCount(totalViews)}</dd>
          </div>
        </dl>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <span className="skeleton block aspect-[3/4] rounded-xl" />
              <span className="skeleton block h-4 w-3/4" />
              <span className="skeleton block h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState title={translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "작가 데이터를 불러오지 못했습니다.")} message={error} onRetry={reload} />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {works.map((title) => (
            <TitleCard key={title.id} title={title} />
          ))}
        </div>
      )}

      {!loading && !error && works.length > 0 && (
        <div className="mt-12">
          <FanCafePanel scope="author" targetId={author} targetLabel={author} compact />
        </div>
      )}
    </Container>
  );
}
