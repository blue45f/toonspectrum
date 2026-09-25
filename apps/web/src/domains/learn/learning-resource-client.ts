import { apiPath } from "@/platform/api";

import { buildYouTubeLearningSearchUrl } from "./learning-resources";

export interface YouTubeLearningVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  url: string;
}

export interface YouTubeLearningSearchResponse {
  configured: boolean;
  query: string;
  items: YouTubeLearningVideo[];
  fallbackUrl: string;
  status?: "ok" | "unconfigured" | "temporarily-unavailable";
}

export async function searchYouTubeLearningResources(
  query: string,
  signal?: AbortSignal,
): Promise<YouTubeLearningSearchResponse> {
  const normalized = query.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 120);
  const fallbackUrl = buildYouTubeLearningSearchUrl(normalized);
  if (normalized.length < 2) {
    return { configured: false, query: normalized, items: [], fallbackUrl, status: "unconfigured" };
  }

  const params = new URLSearchParams({ q: normalized, limit: "8" });
  const response = await fetch(apiPath(`/api/learning/youtube/search?${params.toString()}`), {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`YouTube learning search failed: ${response.status}`);
  return response.json() as Promise<YouTubeLearningSearchResponse>;
}
