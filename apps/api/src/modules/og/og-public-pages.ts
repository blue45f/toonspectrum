import { parsePublicSharePath } from "../../../../../packages/core/src/public-share-path";
import {
  createDefaultCreatorPublicationDirective,
  readCreatorPublicationDirective,
} from "../../../../web/src/shared/lib/creator-publication-contract";
import {
  canShareCollaborationPost,
  canShareCommunityCafe,
  canShareCommunityPost,
  canShareCreatorSeries,
  canShareCreatorWork,
  canSharePromotionPost,
  compactPublicShareDescription,
  publicShareImageUrl,
} from "../../../../web/src/shared/lib/public-share-policy";

export type PublicOgMetadata = Readonly<{
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  type: string;
}>;

export type PublicOgPage = Readonly<{
  metadata: PublicOgMetadata;
  cacheControl: string;
  structuredData?: unknown;
}>;

export type PublicOgReaders = Readonly<{
  readAuthor?: (name: string) => unknown | Promise<unknown>;
  readCreatorProfile?: (userId: string) => unknown | Promise<unknown>;
  readCreatorWork?: (id: string) => unknown | Promise<unknown>;
  readCreatorSeries?: (id: string) => unknown | Promise<unknown>;
  readCommunityPost?: (id: string) => unknown | Promise<unknown>;
  readCommunityCafe?: (slug: string) => unknown | Promise<unknown>;
  readCollaboration?: (id: string) => unknown | Promise<unknown>;
  readPromotion?: (id: string) => unknown | Promise<unknown>;
}>;

type UnknownRecord = Record<string, unknown>;

const CACHEABLE = "public, max-age=300, s-maxage=86400";
const MUTABLE = "no-store";

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown, maximum = 200): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maximum)
    : "";
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is UnknownRecord => item !== null)
    : [];
}

function authorName(value: unknown): string {
  return text(record(value)?.name, 120) || "창작자";
}

function imageUrl(value: unknown, origin: string): string {
  const safe = publicShareImageUrl(typeof value === "string" ? value : null);
  return safe ? new URL(safe, origin).toString() : `${origin}/og-web.png`;
}

function schema(type: string, name: string, description: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    name,
    description,
    url,
  };
}

function page(
  origin: string,
  canonicalPath: string,
  input: Readonly<{
    title: string;
    description: string;
    image?: unknown;
    imageAlt?: string;
    type?: string;
    schemaType?: string;
    cacheControl?: string;
  }>,
): PublicOgPage {
  const name = text(input.title, 120) || "툰스튜디오";
  const description = compactPublicShareDescription(
    text(input.description, 200),
    "웹툰 기획부터 제작, 협업과 공개까지 툰스튜디오에서 이어가세요.",
  );
  const url = `${origin}${canonicalPath}`;
  const title = name.endsWith("· 툰스튜디오") ? name : `${name} · 툰스튜디오`;
  return {
    metadata: {
      title,
      description,
      url,
      image: imageUrl(input.image, origin),
      imageAlt: text(input.imageAlt, 160) || `${name} 공유 이미지`,
      type: input.type ?? "website",
    },
    cacheControl: input.cacheControl ?? MUTABLE,
    structuredData: schema(input.schemaType ?? "WebPage", name, description, url),
  };
}

async function read(
  reader: ((value: string) => unknown | Promise<unknown>) | undefined,
  value: string,
): Promise<unknown> {
  if (!reader) return null;
  try {
    return await reader(value);
  } catch {
    return null;
  }
}

function staticPage(origin: string, kind: "ranking" | "play"): PublicOgPage {
  return kind === "ranking"
    ? page(origin, "/ranking", {
        title: "툰스튜디오 통합 랭킹",
        description: "웹툰과 웹소설의 인기·평점·관심 흐름을 한눈에 살펴보세요.",
        cacheControl: CACHEABLE,
        schemaType: "CollectionPage",
      })
    : page(origin, "/play", {
        title: "ToonStudio 창작 놀이터",
        description: "드로잉, 색감, 이야기와 웹툰 표현을 가볍게 실험하는 창작 놀이터입니다.",
        cacheControl: CACHEABLE,
        schemaType: "CollectionPage",
      });
}

async function authorPage(
  origin: string,
  name: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const data = record(await read(readers.readAuthor, name));
  const works = records(data?.works);
  if (!data || works.length === 0) return null;
  const author = text(data.author, 120) || name;
  const genres = Array.isArray(data.genres)
    ? data.genres.map((genre) => text(genre, 40)).filter(Boolean).slice(0, 3)
    : [];
  return page(origin, canonicalPath, {
    title: `${author} 작가`,
    description: `${author} 작가의 작품 ${works.length}편${
      genres.length ? ` · ${genres.join(" · ")}` : ""
    }`,
    image: works[0]?.coverImage,
    imageAlt: `${author} 작가 작품`,
    cacheControl: CACHEABLE,
    schemaType: "ProfilePage",
  });
}

async function profilePage(
  origin: string,
  userId: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const profile = record(await read(readers.readCreatorProfile, userId));
  if (!profile) return null;
  const name = text(profile.name, 120) || "창작자";
  return page(origin, canonicalPath, {
    title: `${name} 창작자 프로필`,
    description: compactPublicShareDescription(
      text(profile.bio, 200),
      `${name} 창작자의 작품, 시리즈와 커뮤니티 활동을 확인해 보세요.`,
    ),
    image: profile.avatar,
    imageAlt: `${name} 창작자 프로필`,
    schemaType: "ProfilePage",
  });
}

async function workPage(
  origin: string,
  id: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const work = record(await read(readers.readCreatorWork, id));
  if (!work) return null;
  const directive = readCreatorPublicationDirective(work.doc)
    ?? createDefaultCreatorPublicationDirective("UTC");
  if (!canShareCreatorWork({ status: text(work.status, 32) }, directive)) {
    return null;
  }
  const title = text(directive.socialTitle, 120)
    || text(work.title, 120)
    || "창작 작품";
  const author = authorName(work.author);
  return page(origin, canonicalPath, {
    title,
    description: compactPublicShareDescription(
      text(directive.socialDescription, 200) || text(work.description, 200),
      `${author} 창작자의 ${title} 작품을 감상해 보세요.`,
    ),
    image: work.cover,
    imageAlt: `${title} 작품`,
    type: "article",
    schemaType: "CreativeWork",
  });
}

async function seriesPage(
  origin: string,
  id: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const series = record(await read(readers.readCreatorSeries, id));
  if (!series) return null;
  const episodes = records(series.episodeList).map((episode) => ({
    status: text(episode.status, 32),
  }));
  if (!canShareCreatorSeries(episodes)) return null;
  const title = text(series.title, 120) || "연재 시리즈";
  const author = authorName(series.author);
  return page(origin, canonicalPath, {
    title,
    description: compactPublicShareDescription(
      text(series.description, 200),
      `${author} 창작자의 ${title} 연재 시리즈를 감상해 보세요.`,
    ),
    image: series.cover,
    imageAlt: `${title} 연재 시리즈`,
    type: "article",
    schemaType: "CreativeWorkSeries",
  });
}

async function communityPostPage(
  origin: string,
  id: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const post = record(await read(readers.readCommunityPost, id));
  if (!post || !canShareCommunityPost({ scope: text(post.scope, 32) })) {
    return null;
  }
  const title = text(post.title, 120) || "커뮤니티 글";
  const firstImage = Array.isArray(post.images)
    ? post.images.find((image) => typeof image === "string")
    : undefined;
  return page(origin, canonicalPath, {
    title,
    description: compactPublicShareDescription(
      text(post.text, 200),
      "웹툰 독자와 창작자가 나눈 이야기를 확인해 보세요.",
    ),
    image: firstImage,
    imageAlt: `${title} 커뮤니티 글`,
    type: "article",
    schemaType: "DiscussionForumPosting",
  });
}

async function cafePage(
  origin: string,
  slug: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const cafe = record(await read(readers.readCommunityCafe, slug));
  if (!cafe || !canShareCommunityCafe({
    visibility: text(cafe.visibility, 32),
    status: text(cafe.status, 32),
  })) {
    return null;
  }
  const name = text(cafe.name, 120) || "회원 커뮤니티";
  return page(origin, canonicalPath, {
    title: name,
    description: compactPublicShareDescription(
      text(cafe.description, 200),
      `${name} 회원들과 웹툰 창작 이야기를 나눠 보세요.`,
    ),
    imageAlt: `${name} 커뮤니티`,
    schemaType: "CollectionPage",
  });
}

function pencafePage(
  origin: string,
  name: string,
  canonicalPath: string,
): PublicOgPage {
  const title = `${name} 펜카페`;
  return page(origin, canonicalPath, {
    title,
    description: `${name} 독자와 창작자가 대화, 번역 소식과 창작 노하우를 나누는 공개 펜카페입니다.`,
    imageAlt: title,
    cacheControl: CACHEABLE,
    schemaType: "CollectionPage",
  });
}

async function collaborationPage(
  origin: string,
  id: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const post = record(await read(readers.readCollaboration, id));
  if (!post || !canShareCollaborationPost({
    hidden: post.hidden === true,
    status: text(post.status, 32),
    expired: post.expired === true,
  })) {
    return null;
  }
  const title = text(post.title, 120) || "구인·의뢰 공고";
  const details = record(post.details);
  return page(origin, canonicalPath, {
    title,
    description: compactPublicShareDescription(
      [text(post.role, 80), text(details?.description, 180)].filter(Boolean).join(" · "),
      "웹툰 제작을 함께할 창작자와 작업 의뢰를 확인해 보세요.",
    ),
    imageAlt: `${title} 구인·의뢰 공고`,
    type: "article",
    schemaType: "JobPosting",
  });
}

async function promotionPage(
  origin: string,
  id: string,
  canonicalPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const result = record(await read(readers.readPromotion, id));
  const post = record(result?.post ?? result);
  if (!post || !canSharePromotionPost({
    hidden: post.hidden === true,
    archived: post.archived === true,
  })) {
    return null;
  }
  const postTitle = text(post.title, 120) || "작가 홍보";
  const seriesTitle = text(post.seriesTitle, 120);
  const title = seriesTitle ? `${postTitle} · ${seriesTitle}` : postTitle;
  const warning = text(post.contentWarning, 160);
  return page(origin, canonicalPath, {
    title,
    description: compactPublicShareDescription(
      warning ? `${seriesTitle || postTitle} · 콘텐츠 안내: ${warning}` : text(post.description, 200),
      "웹툰 신작과 창작자의 작업 이야기를 확인해 보세요.",
    ),
    image: post.cover,
    imageAlt: `${postTitle} 홍보 이미지`,
    type: "article",
    schemaType: "CreativeWork",
  });
}

/** Resolve crawler metadata only after rechecking the durable public state. */
export async function resolvePublicOgPage(
  origin: string,
  rawPath: string,
  readers: PublicOgReaders,
): Promise<PublicOgPage | null> {
  const route = parsePublicSharePath(rawPath);
  if (!route) return null;
  switch (route.kind) {
    case "ranking":
    case "play":
      return staticPage(origin, route.kind);
    case "author":
      return authorPage(origin, route.name, route.canonicalPath, readers);
    case "profile":
      return profilePage(origin, route.userId, route.canonicalPath, readers);
    case "creator-work":
      return workPage(origin, route.id, route.canonicalPath, readers);
    case "creator-series":
      return seriesPage(origin, route.id, route.canonicalPath, readers);
    case "community-post":
      return communityPostPage(origin, route.id, route.canonicalPath, readers);
    case "community-cafe":
      return cafePage(origin, route.slug, route.canonicalPath, readers);
    case "pencafe":
      return pencafePage(origin, route.name, route.canonicalPath);
    case "collaboration":
      return collaborationPage(origin, route.id, route.canonicalPath, readers);
    case "promotion":
      return promotionPage(origin, route.id, route.canonicalPath, readers);
  }
}
