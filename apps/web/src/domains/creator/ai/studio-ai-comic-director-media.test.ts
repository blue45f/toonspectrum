import { afterEach, describe, expect, it, vi } from "vitest";

import {
  inspectStudioAiComicRepairCapabilities,
  repairStudioAiComicImageRegion,
  singleLayerStudioAiComicManifest,
} from "./studio-ai-comic-director-media";

import type { StudioAiSettings } from "./studio-ai-client";

const SETTINGS: StudioAiSettings = {
  apiKey: "test-key",
  baseUrl: "https://provider.example/v1",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  imageModel: "image-model",
  textModel: "text-model",
};

const ONE_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8hAAAAAAElFTkSuQmCC";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("AI Comic Director media operations", () => {
  it("fails closed when the configured provider has no edit path", () => {
    expect(inspectStudioAiComicRepairCapabilities({
      ...SETTINGS,
      imageEditPath: "",
    })).toEqual({
      available: false,
      maskEdit: false,
      outpaint: false,
      reason: "현재 연결에 이미지 편집 경로가 없습니다.",
    });
  });

  it("sends exactly one multipart mask edit request and records repair lineage", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("image-model");
      expect(form.get("prompt")).toBe("오른손만 자연스럽게 수정");
      expect(form.get("image")).toBeInstanceOf(Blob);
      expect(form.get("mask")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({
        data: [{ b64_json: "cmVwYWlyZWQ=" }],
      }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await repairStudioAiComicImageRegion({
      settings: SETTINGS,
      sourceImageDataUrl: ONE_PIXEL,
      maskDataUrl: ONE_PIXEL,
      prompt: "오른손만 자연스럽게 수정",
      target: "hands",
      parentCandidateId: "candidate-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://provider.example/v1/images/edits",
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        imageDataUrl: "data:image/png;base64,cmVwYWlyZWQ=",
        repair: {
          version: 1,
          target: "hands",
          parentCandidateId: "candidate-1",
          provider: "provider.example",
          model: "image-model",
        },
      },
    });
  });

  it("never retries a failed provider request or pretends whole-panel generation was a repair", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "mask unsupported" },
    }), { status: 400, statusText: "Bad Request" }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await repairStudioAiComicImageRegion({
      settings: SETTINGS,
      sourceImageDataUrl: ONE_PIXEL,
      maskDataUrl: ONE_PIXEL,
      prompt: "손 수리",
      target: "hands",
      parentCandidateId: "candidate-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      code: "http_error",
    });
  });

  it("describes an honest non-editable single-layer fallback", () => {
    expect(singleLayerStudioAiComicManifest("candidate-1", ONE_PIXEL)).toMatchObject({
      version: 1,
      method: "single-layer",
      editable: false,
      sourceCandidateId: "candidate-1",
      layers: [
        {
          id: "candidate-1:scene",
          name: "AI 장면 이미지",
          role: "provider-layer",
          imageDataUrl: ONE_PIXEL,
        },
      ],
    });
  });
});
