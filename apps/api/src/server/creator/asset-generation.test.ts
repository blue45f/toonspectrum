import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateImageAsset,
  imageAssetModelForQuality,
} from "./asset-generation";

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
});

describe("creator image asset generation", () => {
  it("uses Flare by default and reserves Sunburst for explicit MAX quality", () => {
    expect(imageAssetModelForQuality("auto")).toBe("gpt-image-2.5-flare");
    expect(imageAssetModelForQuality("high")).toBe("gpt-image-2.5-flare");
    expect(imageAssetModelForQuality("xhigh")).toBe("gpt-image-2.5-flare");
    expect(imageAssetModelForQuality("max")).toBe("gpt-image-2.5-sunburst");
  });

  it("preserves 2K, quality and model provenance in the OpenAI request and result", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "gpt-image-2.5-flare",
        size: "2048x1152",
        quality: "xhigh",
        background: "auto",
        output_format: "webp",
        output_compression: 92,
      });
      return new Response(JSON.stringify({ data: [{ b64_json: "ZmFrZS13ZWJw" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImageAsset({
      prompt: "비 오는 서울 골목 배경, 네온 반사와 깊은 원근",
      size: "2048x1152",
      quality: "xhigh",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      width: 2048,
      height: 1152,
      size: "2048x1152",
      quality: "xhigh",
      model: "gpt-image-2.5-flare",
    });
    expect(result.dataUrl).toBe("data:image/webp;base64,ZmFrZS13ZWJw");
  });

  it("routes precision MAX requests through Sunburst", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("gpt-image-2.5-sunburst");
      expect(body.quality).toBe("max");
      return new Response(JSON.stringify({ data: [{ b64_json: "cHJlY2lzaW9u" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await generateImageAsset({
      prompt: "정밀한 캐릭터 의상 소품",
      size: "2048x2048",
      quality: "max",
    });

    expect(result.model).toBe("gpt-image-2.5-sunburst");
    expect(result.quality).toBe("max");
  });

  it("fails safe to the existing standard contract for unsupported options", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.size).toBe("1024x1024");
      expect(body.quality).toBe("medium");
      expect(body.model).toBe("gpt-image-2.5-flare");
      return new Response(JSON.stringify({ data: [{ b64_json: "ZmFsbGJhY2s=" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await generateImageAsset({
      prompt: "간단한 소품",
      size: "9999x9999",
      quality: "impossible",
    });

    expect(result.size).toBe("1024x1024");
    expect(result.quality).toBe("medium");
  });
});
