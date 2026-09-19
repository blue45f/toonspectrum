import { describe, expect, it } from "vitest";
import { buildStudioAiAssetImageRequest } from "./studio-ai-asset-image-request";

describe("BYOK asset image request", () => {
  it.each([
    ["1024x1024", "1024x1024"],
    ["1536x1024", "1792x1024"],
    ["1024x1536", "1024x1792"],
  ] as const)("maps %s to %s without changing provider policy", (size, expected) => {
    expect(buildStudioAiAssetImageRequest("scene", size, "medium").size).toBe(expected);
  });

  it.each([
    ["low", "fast preview"],
    ["medium", "Balance production detail"],
    ["high", "production-ready detail"],
    ["auto", "Choose detail appropriate"],
  ] as const)("preserves the %s quality direction and safety suffix", (quality, expected) => {
    const result = buildStudioAiAssetImageRequest("original\nprompt", "1024x1024", quality);
    expect(result.prompt).toMatch(/^original\nprompt\n\n/u);
    expect(result.prompt).toContain(expected);
    expect(result.prompt).toMatch(/No text, logo, watermark, or copyrighted character\.$/u);
    expect(Object.keys(result).sort()).toEqual(["prompt", "size"]);
  });
});
