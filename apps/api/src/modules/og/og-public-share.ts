import { COLLABORATION_ROLES } from "../../../../../packages/core/src/collaboration";
import { readCreatorPublicationDirective } from "../../../../web/src/shared/lib/creator-publication-contract";

export type PublicShareOgSource =
  | "creator-work"
  | "creator-series"
  | "creator-profile"
  | "catalog-author"
  | "community-post"
  | "community-cafe"
  | "pencafe"
  | "collaboration"
  | "promotion"
  | "ranking"
  | "play";

export type PublicShareOgMetadata = Readonly<{
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  type: string;
}>;

type MaybePromise<T> = T | Promise<T>;

export type PublicShareOgReaders = Readonly<{
  readCreatorWork?: (identifier: string) => MaybePromise<unknown>;
  readCreatorSeries?: (identifier: string) => MaybePromise<unknown>;
  readCreatorProfile?: (identifier: string) => MaybePromise<unknown>;
  readCatalogAuthor?: (identifier: string) => MaybePromise<unknown>;
  readCommunityPost?: (identifier: string) => MaybePromise<unknown>;
  readCommunityCafe?: (identifier: string) => MaybePromise<unknown>;
  readCollaborationPost?: (identifier: string) => MaybePromise<unknown>;
  readPromotionPost?: (identifier: string) => MaybePromise<unknown>;
}>;

export type PublicShareOgDecision =
  | { readonly status: "unmatched" }
  | { readonly status: "fallback" }
  | {
      readonly status: "resolved";
      readonly source: PublicShareOgSource;
      readonly metadata: PublicShareOgMetadata;
      readonly structuredData?: unknown;
      readonly cacheControl: string;
    };

type OgQuery = Readonly<Record<string, unknown>>;
type RecordValue = Record<string, unknown>;

const MUTABLE_CACHE_CONTROL = "no-store";
const DISCOVERY_CACHE_CONTROL = "public, max-age=300, s-maxage=86400";
const DEFAULT_IMAGE_PATH = "/brand/toonstudio-og.png";

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
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

function pathSegment(value: unknown, maximumLength = 180): string {
  const raw = queryValue(value).trim();
  if (!raw) return "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Nest already decodes query values. A literal percent sign is valid content.
  }
  const normalized = decoded.normalize("NFC").trim();
  if (
    !normalized
    || normalized.length > maximumLength
    || [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return character === "\\" || character === "/" || code <= 0x1f || code === 0x7f;
    })
  ) {
    return "";
  }
  return normalized;
}

function absoluteImage(value: unknown, origin: string): string {
  const candidate = cleanText(value, 2_048);
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    return `${origin}${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
  } catch {
    // Use the release-owned image below.
  }
  return `${origin}${DEFAULT_IMAGE_PATH}`;
}

function personName(value: unknown, fallback = "툰스튜디오 창작자"): string {
  return cleanText(record(value).name, 120) || fallback;
}

function compactDescription(value: unknown, fallback: string): string {
  return cleanText(value, 200) || cleanText(fallback, 200);
}

async function read(
  reader: ((identifier: string) => MaybePromise<unknown>) | undefined,
  identifier: string,
): Promise<unknown | null> {
  if (!reader || !identifier) return null;
  try {
    return (await reader(identifier)) ?? null;
  } catch {
    return null;
  }
}

function resolved(input: {
  source: PublicShareOgSource;
  metadata: PublicShareOgMetadata;
  structuredData?: unknown;
  cacheControl?: string;
}): PublicShareOgDecision {
  return {
    status: "resolved",
    source: input.source,
    metadata: input.metadata,
    structuredData: input.structuredData,
    cacheControl: input.cacheControl ?? MUTABLE_CACHE_CONTROL,
  };
}

function creatorWorkStructuredData(input: {
  url: string;
  title: string;
  description: string;
  image: string;
  author: string;
  createdAt: string;
  tags: readonly string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${input.url}#work`,
    name: input.title,
    description: input.description,
    image: input.image,
    url: input.url,
    author: { "@type": "Person", name: input.author },
    datePublished: input.createdAt || undefined,
    keywords: input.tags.length > 0 ? input.tags.join(", ") : undefined,
    inLanguage: "ko",
  };
}

async function creatorWork(
  origin: string,
  identifier: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const work = record(await read(readers.readCreatorWork, identifier));
  const directive = readCreatorPublicationDirective(work.doc);
  if (
    !cleanText(work.id, 180)
    || work.status !== "published"
    || directive?.visibility === "private"
  ) return { status: "fallback" };

  const author = personName(work.author);
  const title = cleanText(directive?.socialTitle, 120)
    || cleanText(work.title, 120);
  if (!title) return { status: "fallback" };
  const description = compactDescription(
    directive?.socialDescription || work.description,
    `${author} 창작자의 ${title} 작품을 감상해 보세요.`,
  );
  const url = `${origin}/create/${encodeURIComponent(identifier)}`;
  const image = absoluteImage(work.cover, origin);
  const tags = Array.isArray(work.tags)
    ? work.tags.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 12)
    : [];
  return resolved({
    source: "creator-work",
    metadata: {
      title: `${title} · 툰스튜디오`,
      description,
      url,
      image,
      imageAlt: `${title} 작품 표지`,
      type: "article",
    },
    structuredData: creatorWorkStructuredData({
      url,
      title,
      description,
      image,
      author,
      createdAt: cleanText(work.createdAt, 40),
      tags,
    }),
  });
}

async function creatorSeries(
  origin: string,
  identifier: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const series = record(await read(readers.readCreatorSeries, identifier));
  const episodes = Array.isArray(series.episodeList) ? series.episodeList : [];
  if (!cleanText(series.id, 180) || episodes.length === 0) {
    return { status: "fallback" };
  }
  const title = cleanText(series.title, 120);
  if (!title) return { status: "fallback" };
  const author = personName(series.author);
  const description = compactDescription(
    series.description,
    `${author} 창작자의 ${title} 연재 작품을 회차별로 감상해 보세요.`,
  );
  const url = `${origin}/create/series/${encodeURIComponent(identifier)}`;
  const image = absoluteImage(series.cover, origin);
  return resolved({
    source: "creator-series",
    metadata: {
      title: `${title} · 툰스튜디오`,
      description,
      url,
      image,
      imageAlt: `${title} 연재 표지`,
      type: "article",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CreativeWorkSeries",
      "@id": `${url}#series`,
      name: title,
      description,
      image,
      url,
      author: { "@type": "Person", name: author },
      numberOfItems: episodes.length,
      inLanguage: "ko",
    },
  });
}

async function creatorProfile(
  origin: string,
  identifier: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const profile = record(await read(readers.readCreatorProfile, identifier));
  if (!cleanText(profile.id, 180)) return { status: "fallback" };
  const name = cleanText(profile.name, 120) || "창작자";
  const description = compactDescription(
    profile.bio,
    `${name} 창작자의 공개 작품과 연재 시리즈를 확인해 보세요.`,
  );
  const url = `${origin}/u/${encodeURIComponent(identifier)}`;
  const image = absoluteImage(profile.avatar, origin);
  return resolved({
    source: "creator-profile",
    metadata: {
      title: `${name} 창작자 프로필 · 툰스튜디오`,
      description,
      url,
      image,
      imageAlt: `${name} 창작자 프로필`,
      type: "profile",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ProfilePage",
          "@id": `${url}#profile`,
          name: `${name} 창작자 프로필`,
          description,
          url,
          mainEntity: { "@id": `${url}#person` },
        },
        {
          "@type": "Person",
          "@id": `${url}#person`,
          name,
          image,
          url,
        },
      ],
    },
  });
}

async function catalogAuthor(
  origin: string,
  authorName: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const author = record(await read(readers.readCatalogAuthor, authorName));
  const works = Array.isArray(author.works) ? author.works : [];
  if (!cleanText(author.author, 120) || works.length === 0) {
    return { status: "fallback" };
  }
  const name = cleanText(author.author, 120);
  const genres = Array.isArray(author.genres)
    ? author.genres.map((genre) => cleanText(genre, 40)).filter(Boolean).slice(0, 4)
    : [];
  const description = compactDescription(
    `${name} 작가의 작품 ${works.length}편${genres.length ? ` · ${genres.join(" · ")}` : ""}`,
    `${name} 작가의 작품을 확인해 보세요.`,
  );
  const url = `${origin}/author/${encodeURIComponent(authorName)}`;
  const firstWork = record(works[0]);
  const image = absoluteImage(firstWork.coverImage, origin);
  return resolved({
    source: "catalog-author",
    cacheControl: DISCOVERY_CACHE_CONTROL,
    metadata: {
      title: `${name} 작가 · 툰스튜디오`,
      description,
      url,
      image,
      imageAlt: `${name} 작가 작품 모음`,
      type: "profile",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${name} 작가 작품 모음`,
      description,
      url,
      about: { "@type": "Person", name },
      numberOfItems: works.length,
    },
  });
}

async function communityPost(
  origin: string,
  identifier: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const post = record(await read(readers.readCommunityPost, identifier));
  if (!cleanText(post.id, 180) || post.scope === "cafe") {
    return { status: "fallback" };
  }
  const title = cleanText(post.title, 120);
  if (!title) return { status: "fallback" };
  const author = personName(post.author, "커뮤니티 회원");
  const target = cleanText(post.targetLabel, 100);
  const description = compactDescription(
    `${target ? `${target} · ` : ""}${cleanText(post.text, 180)}`,
    "웹툰 작품과 작가를 주제로 나누는 커뮤니티 토론입니다.",
  );
  const url = `${origin}/community/post/${encodeURIComponent(identifier)}`;
  return resolved({
    source: "community-post",
    metadata: {
      title: `${title} · 툰스튜디오`,
      description,
      url,
      image: `${origin}${DEFAULT_IMAGE_PATH}`,
      imageAlt: `${title} 커뮤니티 글`,
      type: "article",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "DiscussionForumPosting",
      headline: title,
      articleBody: cleanText(post.text, 4_000),
      description,
      url,
      author: { "@type": "Person", name: author },
      datePublished: cleanText(post.createdAt, 40) || undefined,
      inLanguage: "ko",
    },
  });
}

async function communityCafe(
  origin: string,
  slug: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const cafe = record(await read(readers.readCommunityCafe, slug));
  if (
    !cleanText(cafe.id, 180)
    || cafe.visibility !== "public"
    || cafe.status !== "active"
  ) return { status: "fallback" };
  const name = cleanText(cafe.name, 120);
  if (!name) return { status: "fallback" };
  const description = compactDescription(
    cafe.description,
    `${name}에서 웹툰 창작자와 독자가 함께 이야기합니다.`,
  );
  const url = `${origin}/community/cafes/${encodeURIComponent(slug)}`;
  return resolved({
    source: "community-cafe",
    metadata: {
      title: `${name} · 툰스튜디오`,
      description,
      url,
      image: `${origin}${DEFAULT_IMAGE_PATH}`,
      imageAlt: `${name} 커뮤니티`,
      type: "website",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "OnlineCommunity",
      name,
      description,
      url,
    },
  });
}

function pencafe(origin: string, name: string): PublicShareOgDecision {
  const title = `${name} 펜카페`;
  const description = compactDescription(
    `${name} 독자와 창작자가 대화, 번역 소식과 창작 노하우를 나누는 공개 펜카페입니다.`,
    "웹툰 독자와 창작자가 함께 이야기하는 공개 펜카페입니다.",
  );
  const url = `${origin}/pencafe/${encodeURIComponent(name)}`;
  return resolved({
    source: "pencafe",
    cacheControl: DISCOVERY_CACHE_CONTROL,
    metadata: {
      title: `${title} · 툰스튜디오`,
      description,
      url,
      image: `${origin}${DEFAULT_IMAGE_PATH}`,
      imageAlt: title,
      type: "website",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "OnlineCommunity",
      name: title,
      description,
      url,
    },
  });
}

async function collaboration(
  origin: string,
  identifier: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const post = record(await read(readers.readCollaborationPost, identifier));
  if (
    !cleanText(post.id, 180)
    || post.hidden === true
    || post.status !== "open"
    || post.expired === true
  ) return { status: "fallback" };
  const title = cleanText(post.title, 120);
  if (!title) return { status: "fallback" };
  const details = record(post.details);
  const role = cleanText(post.role, 40);
  const roleLabel = Object.hasOwn(COLLABORATION_ROLES, role)
    ? COLLABORATION_ROLES[role as keyof typeof COLLABORATION_ROLES]
    : "웹툰 제작 협업";
  const description = compactDescription(
    `${roleLabel} · ${cleanText(details.description, 180)}`,
    "웹툰 제작을 함께할 창작자와 작업 의뢰를 찾아보세요.",
  );
  const url = `${origin}/collaborate/${encodeURIComponent(identifier)}`;
  const author = personName(post.author);
  return resolved({
    source: "collaboration",
    metadata: {
      title: `${title} · 툰스튜디오`,
      description,
      url,
      image: `${origin}${DEFAULT_IMAGE_PATH}`,
      imageAlt: `${title} 협업 공고`,
      type: "article",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title,
      description: cleanText(details.description, 4_000),
      url,
      hiringOrganization: { "@type": "Person", name: author },
      datePosted: cleanText(post.createdAt, 40) || undefined,
      validThrough: cleanText(details.deadline, 40) || undefined,
      employmentType: roleLabel,
    },
  });
}

async function promotion(
  origin: string,
  identifier: string,
  readers: PublicShareOgReaders,
): Promise<PublicShareOgDecision> {
  const post = record(await read(readers.readPromotionPost, identifier));
  if (
    !cleanText(post.id, 180)
    || post.hidden === true
    || post.archived === true
  ) return { status: "fallback" };
  const title = cleanText(post.title, 120);
  if (!title) return { status: "fallback" };
  const author = personName(post.author);
  const description = compactDescription(
    `${cleanText(post.seriesTitle, 100)} · ${cleanText(post.genre, 40)} · ${cleanText(post.description, 180)}`,
    `${author} 창작자의 작품 홍보 게시물입니다.`,
  );
  const url = `${origin}/community/promote/${encodeURIComponent(identifier)}`;
  const image = absoluteImage(post.cover, origin);
  return resolved({
    source: "promotion",
    metadata: {
      title: `${title} · 툰스튜디오`,
      description,
      url,
      image,
      imageAlt: `${title} 작품 홍보`,
      type: "article",
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      image,
      url,
      author: { "@type": "Person", name: author },
      datePublished: cleanText(post.createdAt, 40) || undefined,
      dateModified: cleanText(post.updatedAt, 40) || undefined,
      inLanguage: "ko",
    },
  });
}

function staticPage(origin: string, key: string): PublicShareOgDecision {
  if (key === "ranking") {
    const url = `${origin}/ranking`;
    const title = "웹툰·웹소설 랭킹";
    const description = "지금 주목받는 웹툰과 웹소설 순위를 플랫폼과 장르별로 살펴보세요.";
    return resolved({
      source: "ranking",
      cacheControl: DISCOVERY_CACHE_CONTROL,
      metadata: {
        title: `${title} · 툰스튜디오`,
        description,
        url,
        image: `${origin}${DEFAULT_IMAGE_PATH}`,
        imageAlt: title,
        type: "website",
      },
      structuredData: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: title,
        description,
        url,
      },
    });
  }
  if (key === "play") {
    const url = `${origin}/play`;
    const title = "웹툰 플레이그라운드";
    const description = "웹툰 취향과 작품 세계를 가볍게 탐색하는 인터랙티브 콘텐츠를 즐겨 보세요.";
    return resolved({
      source: "play",
      cacheControl: DISCOVERY_CACHE_CONTROL,
      metadata: {
        title: `${title} · 툰스튜디오`,
        description,
        url,
        image: `${origin}${DEFAULT_IMAGE_PATH}`,
        imageAlt: title,
        type: "website",
      },
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description,
        url,
      },
    });
  }
  return { status: "fallback" };
}

export async function resolvePublicShareOg(input: {
  origin: string;
  query: OgQuery;
  readers?: PublicShareOgReaders;
}): Promise<PublicShareOgDecision> {
  const readers = input.readers ?? {};
  const { query, origin } = input;

  if (Object.hasOwn(query, "creatorWorkId")) {
    const identifier = pathSegment(query.creatorWorkId);
    return identifier
      ? creatorWork(origin, identifier, readers)
      : { status: "fallback" };
  }
  if (Object.hasOwn(query, "creatorSeriesId")) {
    const identifier = pathSegment(query.creatorSeriesId);
    return identifier
      ? creatorSeries(origin, identifier, readers)
      : { status: "fallback" };
  }
  if (Object.hasOwn(query, "profileUserId")) {
    const identifier = pathSegment(query.profileUserId);
    return identifier
      ? creatorProfile(origin, identifier, readers)
      : { status: "fallback" };
  }
  if (Object.hasOwn(query, "authorName")) {
    const name = pathSegment(query.authorName);
    return name ? catalogAuthor(origin, name, readers) : { status: "fallback" };
  }
  if (Object.hasOwn(query, "communityPostId")) {
    const identifier = pathSegment(query.communityPostId);
    return identifier
      ? communityPost(origin, identifier, readers)
      : { status: "fallback" };
  }
  if (Object.hasOwn(query, "communityCafeSlug")) {
    const slug = pathSegment(query.communityCafeSlug);
    return slug ? communityCafe(origin, slug, readers) : { status: "fallback" };
  }
  if (Object.hasOwn(query, "pencafeName")) {
    const name = pathSegment(query.pencafeName);
    return name ? pencafe(origin, name) : { status: "fallback" };
  }
  if (Object.hasOwn(query, "collaborationPostId")) {
    const identifier = pathSegment(query.collaborationPostId);
    return identifier
      ? collaboration(origin, identifier, readers)
      : { status: "fallback" };
  }
  if (Object.hasOwn(query, "promotionPostId")) {
    const identifier = pathSegment(query.promotionPostId);
    return identifier
      ? promotion(origin, identifier, readers)
      : { status: "fallback" };
  }
  if (Object.hasOwn(query, "staticPage")) {
    return staticPage(origin, cleanText(query.staticPage, 40));
  }
  return { status: "unmatched" };
}
