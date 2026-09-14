import { ServiceUnavailableException } from "@nestjs/common";
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

describe("creator image asset generation policy", () => {
  it("retains deterministic historical model mapping", () => {
    expect(imageAssetModelForQuality("auto")).toBe("gpt-image-2.5-flare");
    expect(imageAssetModelForQuality("high")).toBe("gpt-image-2.5-flare");
    expect(imageAssetModelForQuality("xhigh")).toBe("gpt-image-2.5-flare");
    expect(imageAssetModelForQuality("max")).toBe("gpt-image-2.5-sunburst");
  });

  it("never calls a provider with an operator environment key", async () => {
    process.env.OPENAI_API_KEY = "operator-key-that-must-not-be-used";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await generateImageAsset({
        prompt: "비 오는 서울 골목 배경",
        size: "2048x1152",
        quality: "xhigh",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getResponse()).toMatchObject({
      code: "USER_AI_CONNECTION_REQUIRED",
      operatorFunded: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
