import { Controller, Get, Header, Injectable, Module, Query } from "@nestjs/common";

const YOUTUBE_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const CACHE_TTL_MS = 10 * 60 * 1000;

type YouTubeSearchStatus = "ok" | "unconfigured" | "temporarily-unavailable";

interface YouTubeLearningVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  url: string;
}

export interface YouTubeLearningSearchResult {
  configured: boolean;
  query: string;
  items: YouTubeLearningVideo[];
  fallbackUrl: string;
  status: YouTubeSearchStatus;
}

interface YouTubeSearchPayload {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }>;
}

function normalizeLearningQuery(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 120)
    : "";
}

function resolveLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(12, parsed)) : 8;
}

function youtubeFallbackUrl(query: string): string {
  const phrase = query ? `웹툰 ${query}` : "웹툰 제작 강좌";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(phrase)}`;
}

function unavailableResult(query: string, configured: boolean): YouTubeLearningSearchResult {
  return {
    configured,
    query,
    items: [],
    fallbackUrl: youtubeFallbackUrl(query),
    status: configured ? "temporarily-unavailable" : "unconfigured",
  };
}

@Injectable()
export class LearningYoutubeService {
  private readonly cache = new Map<string, { cachedAt: number; result: YouTubeLearningSearchResult }>();

  async search(rawQuery: unknown, rawLimit?: unknown): Promise<YouTubeLearningSearchResult> {
    const query = normalizeLearningQuery(rawQuery);
    const fallbackUrl = youtubeFallbackUrl(query);
    const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim() || process.env.YOUTUBE_API_KEY?.trim();
    if (query.length < 2 || !apiKey) return unavailableResult(query, Boolean(apiKey));

    const limit = resolveLimit(rawLimit);
    const cacheKey = `${query}:${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.result;

    const endpoint = new URL(YOUTUBE_SEARCH_ENDPOINT);
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("type", "video");
    endpoint.searchParams.set("videoEmbeddable", "true");
    endpoint.searchParams.set("safeSearch", "moderate");
    endpoint.searchParams.set("regionCode", "KR");
    endpoint.searchParams.set("relevanceLanguage", "ko");
    endpoint.searchParams.set("maxResults", String(limit));
    endpoint.searchParams.set("q", `웹툰 ${query}`);
    endpoint.searchParams.set("key", apiKey);

    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
      if (!response.ok) return unavailableResult(query, true);
      const payload = await response.json() as YouTubeSearchPayload;
      const items = (payload.items ?? []).flatMap((entry): YouTubeLearningVideo[] => {
        const videoId = entry.id?.videoId?.trim();
        const snippet = entry.snippet;
        if (!videoId || !snippet?.title) return [];
        return [{
          id: videoId,
          title: snippet.title.slice(0, 300),
          description: (snippet.description ?? "").slice(0, 600),
          channelTitle: (snippet.channelTitle ?? "YouTube").slice(0, 200),
          publishedAt: snippet.publishedAt ?? "",
          thumbnailUrl: snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null,
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        }];
      });
      const result: YouTubeLearningSearchResult = {
        configured: true,
        query,
        items,
        fallbackUrl,
        status: "ok",
      };
      this.cache.set(cacheKey, { cachedAt: Date.now(), result });
      if (this.cache.size > 100) {
        const oldestKey = this.cache.keys().next().value as string | undefined;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      return result;
    } catch {
      return unavailableResult(query, true);
    }
  }
}

@Controller("learning")
export class LearningController {
  constructor(private readonly youtube: LearningYoutubeService) {}

  @Get("youtube/search")
  @Header("Cache-Control", "private, max-age=300")
  searchYouTube(
    @Query("q") query: string | undefined,
    @Query("limit") limit: string | undefined,
  ) {
    return this.youtube.search(query, limit);
  }
}

@Module({
  controllers: [LearningController],
  providers: [LearningYoutubeService],
})
export class LearningModule {}
