import { getTitle } from "../../../../../packages/core/src/server";

import {
  resolvePublicOgPage,
  type PublicOgReaders,
} from "./og-public-pages";

const DEFAULT_CANONICAL_HOST = "www.toonstudio.cloud";
const CANONICAL_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu;
const CRAWLER_USER_AGENT_PATTERN =
  /bot|crawl|spider|facebookexternalhit|kakaotalk|slack|twitter|discord|whatsapp|telegram|line|pinterest|embedly|preview|naver|daum|skype|vkshare/iu;
const MARKET_RESOURCE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/iu;

const MARKET_KIND_LABEL = Object.freeze({
  asset: "에셋",
  brush: "브러시",
  filter: "필터",
  palette: "팔레트",
  template: "템플릿",
  "3d-preset": "3D 프리셋",
});

type OgQuery = Readonly<Record<string, unknown>>;

type TitleMetadata = Readonly<{
  title: string;
  synopsis?: string;
  coverImage?: string;
  author?: string;
  genres?: readonly string[];
  releaseYear?: string | number;
  stats?: Readonly<{
    ratingCount?: number;
    ratingAvg?: number;
  }>;
}>;

type MarketplaceMetadata = Readonly<{
  id: string;
  name: string;
  description?: string;
  kind: keyof typeof MARKET_KIND_LABEL;
  resourceVersion?: string;
  license?: string;
  tags?: readonly string[];
  publisher: Readonly<{
    name: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}>;

type OgReaders = PublicOgReaders & Readonly<{
  readTitle?: (identifier: string) => TitleMetadata | null | Promise<TitleMetadata | null>;
  readMarketResource?: (identifier: string) => unknown | Promise<unknown>;
}>;

export type OgPageResult = Readonly<{
  html: string;
  cacheControl: string;
  source: "site" | "title" | "market" | "market-resource" | "public" | "fallback";
}>;

type OgPageInput = Readonly<{
  query?: OgQuery;
  userAgent?: string;
  canonicalHost?: string;
  readers?: OgReaders;
}>;

type PageMetadata = Readonly<{
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  type: string;
}>;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function cleanText(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maximumLength)
    : "";
}

function queryValue(value: unknown): string {
  if (Array.isArray(value)) return queryValue(value[0]);
  return typeof value === "string" ? value : "";
}

function safeDecode(value: unknown): string {
  try {
    return decodeURIComponent(queryValue(value));
  } catch {
    return "";
  }
}

function canonicalHost(value: string | undefined): string {
  const candidate = value?.trim().toLowerCase() ?? "";
  return CANONICAL_HOST_PATTERN.test(candidate)
    ? candidate
    : DEFAULT_CANONICAL_HOST;
}

function renderHtml(metadata: PageMetadata, structuredData?: unknown): string {
  const jsonLd = structuredData === undefined
    ? ""
    : `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</gu, "\\u003c")}</script>`;
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <link rel="canonical" href="${escapeHtml(metadata.url)}" />
    <meta property="og:type" content="${escapeHtml(metadata.type)}" />
    <meta property="og:site_name" content="툰스튜디오" />
    <meta property="og:title" content="${escapeHtml(metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:image" content="${escapeHtml(metadata.image)}" />
    <meta property="og:image:alt" content="${escapeHtml(metadata.imageAlt)}" />
    <meta property="og:url" content="${escapeHtml(metadata.url)}" />
    <meta property="og:locale" content="ko_KR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(metadata.title)}" />
    <meta name="twitter:description" content="${escapeHtml(metadata.description)}" />
    <meta name="twitter:image" content="${escapeHtml(metadata.image)}" />
    ${jsonLd}
  </head>
  <body></body>
</html>`;
}

function siteMetadata(origin: string): PageMetadata {
  return {
    title: "툰스튜디오 · 웹툰을 그리는 전문 작업실",
    description:
      "한 획에서 한 편의 웹툰까지. 펜선과 채색, 컷·말풍선·페이지 구성을 연결하는 브라우저 웹툰 드로잉 툴, 툰스튜디오.",
    url: `${origin}/`,
    image: `${origin}/brand/toonstudio-og.png`,
    imageAlt: "툰스튜디오 — 웹툰 작가를 위한 전문 드로잉 작업실",
    type: "website",
  };
}

function validTitleMetadata(value: unknown): value is TitleMetadata {
  return Boolean(
    value
      && typeof value === "object"
      && typeof (value as { title?: unknown }).title === "string"
      && (value as { title: string }).title.trim(),
  );
}

function validMarketplaceMetadata(value: unknown): value is MarketplaceMetadata {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const publisher = record.publisher;
  return Boolean(
    typeof record.id === "string"
      && typeof record.name === "string"
      && typeof record.kind === "string"
      && Object.hasOwn(MARKET_KIND_LABEL, record.kind)
      && publisher
      && typeof publisher === "object"
      && typeof (publisher as Record<string, unknown>).name === "string",
  );
}

function titleImage(coverImage: unknown, origin: string): string {
  const value = cleanText(coverImage, 2_048);
  if (!value) return `${origin}/og-web.png`;
  if (/^https?:\/\//iu.test(value)) return value;
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function marketLicenseUrl(license: string | undefined, origin: string): string {
  if (license === "cc0-1.0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (license === "cc-by-4.0") return "https://creativecommons.org/licenses/by/4.0/";
  if (license === "cc-by-nc-4.0") return "https://creativecommons.org/licenses/by-nc/4.0/";
  return `${origin}/terms`;
}

function renderMarketLanding(origin: string, marketPage: string): OgPageResult {
  const isBrowse = marketPage === "browse";
  const title = isBrowse ? "마켓 탐색 · 툰스튜디오" : "창작 마켓 · 툰스튜디오";
  const description = isBrowse
    ? "웹툰 제작에 필요한 브러시, 팔레트, 필터, 장면 템플릿, 3D 프리셋과 에셋을 종류와 사용권으로 찾아보세요."
    : "브러시, 팔레트, 필터, 장면 템플릿, 3D 프리셋과 에셋을 살펴보고 ToonStudio에서 바로 활용하세요.";
  const url = `${origin}${isBrowse ? "/market/browse" : "/market"}`;
  const metadata: PageMetadata = {
    title,
    description,
    url,
    image: `${origin}/og-web.png`,
    imageAlt: "툰스튜디오 창작 마켓",
    type: "website",
  };
  return {
    html: renderHtml(metadata, {
      "@context": "https://schema.org",
      "@type": isBrowse ? "SearchResultsPage" : "CollectionPage",
      name: title.replace(" · 툰스튜디오", ""),
      description,
      url,
      isPartOf: {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "툰스튜디오",
        url: `${origin}/`,
      },
    }),
    cacheControl: "public, max-age=300, s-maxage=86400",
    source: "market",
  };
}

async function renderMarketResource(
  origin: string,
  identifier: string,
  reader: OgReaders["readMarketResource"],
): Promise<OgPageResult> {
  let resource: MarketplaceMetadata | null = null;
  if (MARKET_RESOURCE_ID_PATTERN.test(identifier) && reader) {
    try {
      const candidate = await reader(identifier);
      resource = validMarketplaceMetadata(candidate) ? candidate : null;
    } catch {
      resource = null;
    }
  }
  if (!resource) {
    return {
      html: renderHtml(siteMetadata(origin)),
      cacheControl: "no-store",
      source: "fallback",
    };
  }

  const name = cleanText(resource.name, 80);
  const publisher = cleanText(resource.publisher.name, 120);
  const kind = MARKET_KIND_LABEL[resource.kind];
  const description = cleanText(resource.description, 160)
    || `${name}의 구성, 사용권, 호환성과 Studio 적용 방법을 확인하세요.`;
  const fullDescription = `${publisher} · ${kind} · 무료 공유 — ${description}`.slice(0, 200);
  const url = `${origin}/market/resource/${encodeURIComponent(identifier)}`;
  const metadata: PageMetadata = {
    title: `${name} · 툰스튜디오`,
    description: fullDescription,
    url,
    image: `${origin}/og-web.png`,
    imageAlt: `${name} 창작 리소스`,
    type: "article",
  };
  const tags = Array.isArray(resource.tags)
    ? resource.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
    : [];
  return {
    html: renderHtml(metadata, {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CreativeWork",
          "@id": `${url}#resource`,
          name,
          description,
          url,
          version: cleanText(resource.resourceVersion, 40) || undefined,
          author: { "@type": "Person", name: publisher },
          publisher: { "@type": "Person", name: publisher },
          datePublished: cleanText(resource.createdAt, 40) || undefined,
          dateModified: cleanText(resource.updatedAt, 40) || undefined,
          license: marketLicenseUrl(resource.license, origin),
          isAccessibleForFree: true,
          keywords: tags.length > 0 ? tags.join(", ") : undefined,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "창작 마켓",
              item: `${origin}/market`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name,
              item: url,
            },
          ],
        },
      ],
    }),
    cacheControl: "no-store",
    source: "market-resource",
  };
}

async function renderTitle(
  origin: string,
  slug: string,
  reader: NonNullable<OgReaders["readTitle"]>,
): Promise<OgPageResult> {
  let title: TitleMetadata | null;
  try {
    const candidate = await reader(slug);
    title = validTitleMetadata(candidate) ? candidate : null;
  } catch {
    title = null;
  }
  if (!title) {
    return {
      html: renderHtml(siteMetadata(origin)),
      cacheControl: "no-store",
      source: "fallback",
    };
  }

  const synopsis = cleanText(title.synopsis, 160)
    || `${title.title} — 툰스튜디오에서 평점·플랫폼·가격을 한눈에.`;
  const subheading = [
    cleanText(title.author, 120),
    ...(Array.isArray(title.genres)
      ? title.genres.filter((genre): genre is string => typeof genre === "string").slice(0, 2)
      : []),
  ].filter(Boolean).join(" · ");
  const description = subheading ? `${subheading} — ${synopsis}` : synopsis;
  const url = `${origin}/title/${encodeURIComponent(slug)}`;
  const image = titleImage(title.coverImage, origin);
  const ratingCount = Number(title.stats?.ratingCount) || 0;
  const ratingValue = Number(title.stats?.ratingAvg) || 0;
  const work: Record<string, unknown> = {
    "@type": "Book",
    "@id": `${url}#work`,
    name: title.title,
    url,
    inLanguage: "ko",
  };
  if (title.author) work.author = { "@type": "Person", name: title.author };
  if (description) work.description = description;
  if (image) work.image = image;
  if (Array.isArray(title.genres) && title.genres.length > 0) work.genre = title.genres;
  if (title.releaseYear) work.datePublished = String(title.releaseYear);
  if (ratingCount > 0 && ratingValue > 0) {
    work.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round(ratingValue * 10) / 10,
      ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return {
    html: renderHtml({
      title: `${title.title} · 툰스튜디오`,
      description,
      url,
      image,
      imageAlt: `${title.title} 작품 표지`,
      type: "book",
    }, {
      "@context": "https://schema.org",
      "@graph": [
        work,
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "홈", item: `${origin}/` },
            { "@type": "ListItem", position: 2, name: title.title, item: url },
          ],
        },
      ],
    }),
    cacheControl: "public, max-age=300, s-maxage=86400",
    source: "title",
  };
}

export function isCrawlerUserAgent(userAgent: string | undefined): boolean {
  return CRAWLER_USER_AGENT_PATTERN.test(userAgent ?? "");
}

export async function renderOgPage(input: OgPageInput = {}): Promise<OgPageResult> {
  const host = canonicalHost(input.canonicalHost);
  const origin = `https://${host}`;
  const query = input.query ?? {};

  if (!isCrawlerUserAgent(input.userAgent)) {
    return {
      html: renderHtml(siteMetadata(origin)),
      cacheControl: "no-store",
      source: "site",
    };
  }

  const marketPage = cleanText(query.marketPage, 16);
  if (marketPage === "home" || marketPage === "browse") {
    return renderMarketLanding(origin, marketPage);
  }

  if (Object.hasOwn(query, "marketResourceId")) {
    return renderMarketResource(
      origin,
      safeDecode(query.marketResourceId),
      input.readers?.readMarketResource,
    );
  }

  if (Object.hasOwn(query, "publicPath")) {
    const publicPage = await resolvePublicOgPage(
      origin,
      queryValue(query.publicPath),
      input.readers ?? {},
    );
    return publicPage
      ? {
          html: renderHtml(publicPage.metadata, publicPage.structuredData),
          cacheControl: publicPage.cacheControl,
          source: "public",
        }
      : {
          html: renderHtml(siteMetadata(origin)),
          cacheControl: "no-store",
          source: "fallback",
        };
  }

  const slug = safeDecode(query.slug);
  const readTitle = input.readers?.readTitle
    ?? ((identifier: string) => getTitle(identifier) ?? null);
  return renderTitle(origin, slug, readTitle);
}
