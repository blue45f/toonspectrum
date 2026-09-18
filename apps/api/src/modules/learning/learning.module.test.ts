import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { LearningYoutubeService } from "./learning.module";

const ORIGINAL_YOUTUBE_DATA_API_KEY = process.env.YOUTUBE_DATA_API_KEY;
const ORIGINAL_YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

afterEach(() => {
  if (ORIGINAL_YOUTUBE_DATA_API_KEY === undefined) delete process.env.YOUTUBE_DATA_API_KEY;
  else process.env.YOUTUBE_DATA_API_KEY = ORIGINAL_YOUTUBE_DATA_API_KEY;
  if (ORIGINAL_YOUTUBE_API_KEY === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = ORIGINAL_YOUTUBE_API_KEY;
  vi.unstubAllGlobals();
});

describe("learning YouTube search", () => {
  it("degrades to a normal YouTube search when no API key is configured", async () => {
    delete process.env.YOUTUBE_DATA_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    const result = await new LearningYoutubeService().search("콘티 연출", "8");
    assert.equal(result.configured, false);
    assert.equal(result.status, "unconfigured");
    assert.deepEqual(result.items, []);
    assert.match(result.fallbackUrl, /^https:\/\/www\.youtube\.com\/results/u);
  });

  it("maps public metadata, caches it, and never exposes the API key", async () => {
    process.env.YOUTUBE_DATA_API_KEY = "server-only-secret";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      assert.equal(url.includes("key=server-only-secret"), true);
      return new Response(JSON.stringify({
        items: [{
          id: { videoId: "video123" },
          snippet: {
            title: "웹툰 액션 콘티",
            description: "카메라와 컷 흐름을 설명합니다.",
            channelTitle: "Creator Channel",
            publishedAt: "2026-01-02T00:00:00Z",
            thumbnails: { medium: { url: "https://img.youtube.com/example.jpg" } },
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new LearningYoutubeService();
    const first = await service.search("액션 콘티", "99");
    const second = await service.search("액션 콘티", "99");

    assert.equal(first.configured, true);
    assert.equal(first.status, "ok");
    assert.equal(first.items[0].id, "video123");
    assert.equal(first.items[0].url, "https://www.youtube.com/watch?v=video123");
    assert.equal(JSON.stringify(first).includes("server-only-secret"), false);
    assert.deepEqual(second, first);
    assert.equal(fetchMock.mock.calls.length, 1);
  });
});
