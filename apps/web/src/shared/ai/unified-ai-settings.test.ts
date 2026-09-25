// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const LEGACY_KEY = "toonspectrum-studio-ai-settings";
const AUX_KEY = "toonspectrum-unified-ai-aux-v1";

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
});

describe("unified AI secret storage", () => {
  it("migrates legacy session secrets into memory and scrubs storage", async () => {
    sessionStorage.setItem(LEGACY_KEY, JSON.stringify({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "legacy-openai-secret",
      imageModel: "image-model",
      textModel: "text-model",
      imageGenerationPath: "/images/generations",
      imageEditPath: "/images/edits",
      chatCompletionsPath: "/chat/completions",
    }));
    sessionStorage.setItem(AUX_KEY, JSON.stringify({
      version: 1,
      hyper3dApiKey: "legacy-hyper3d-secret",
      creatorRuntimeBaseUrl: "https://runtime.example.com",
      creatorRuntimeToken: "legacy-runtime-secret",
      creatorRuntimeOwner: "artist-1",
    }));

    const settings = await import("./unified-ai-settings");

    expect(settings.loadOpenAiCompatibleSettings().apiKey).toBe(
      "legacy-openai-secret",
    );
    expect(settings.getUnifiedAiAuxSettings()).toMatchObject({
      hyper3dApiKey: "legacy-hyper3d-secret",
      creatorRuntimeToken: "legacy-runtime-secret",
    });
    expect(sessionStorage.getItem(LEGACY_KEY)).not.toContain(
      "legacy-openai-secret",
    );
    expect(sessionStorage.getItem(AUX_KEY)).not.toContain(
      "legacy-hyper3d-secret",
    );
    expect(sessionStorage.getItem(AUX_KEY)).not.toContain(
      "legacy-runtime-secret",
    );
  });

  it("persists only non-secret connection metadata", async () => {
    const settings = await import("./unified-ai-settings");

    settings.saveOpenAiCompatibleSettings({
      ...settings.DEFAULT_OPENAI_COMPATIBLE_SETTINGS,
      apiKey: "new-openai-secret",
      imageModel: "image-model",
    });
    settings.saveUnifiedAiAuxSettings({
      version: 1,
      hyper3dApiKey: "new-hyper3d-secret",
      creatorRuntimeBaseUrl: "https://runtime.example.com",
      creatorRuntimeToken: "new-runtime-secret",
      creatorRuntimeOwner: "artist-2",
    });

    expect(settings.loadOpenAiCompatibleSettings().apiKey).toBe(
      "new-openai-secret",
    );
    expect(settings.getUnifiedAiAuxSettings()).toMatchObject({
      hyper3dApiKey: "new-hyper3d-secret",
      creatorRuntimeToken: "new-runtime-secret",
      creatorRuntimeBaseUrl: "https://runtime.example.com/",
      creatorRuntimeOwner: "artist-2",
    });
    expect(JSON.parse(sessionStorage.getItem(LEGACY_KEY) ?? "null")).toMatchObject({
      apiKey: "",
      imageModel: "image-model",
    });
    expect(JSON.parse(sessionStorage.getItem(AUX_KEY) ?? "null")).toMatchObject({
      hyper3dApiKey: "",
      creatorRuntimeToken: "",
      creatorRuntimeBaseUrl: "https://runtime.example.com/",
      creatorRuntimeOwner: "artist-2",
    });
  });

  it("clears both memory-only and persisted connection state", async () => {
    const settings = await import("./unified-ai-settings");
    settings.saveOpenAiCompatibleSettings({
      ...settings.DEFAULT_OPENAI_COMPATIBLE_SETTINGS,
      apiKey: "temporary-openai-secret",
    });
    settings.saveUnifiedAiAuxSettings({
      ...settings.DEFAULT_UNIFIED_AI_AUX_SETTINGS,
      hyper3dApiKey: "temporary-hyper3d-secret",
      creatorRuntimeToken: "temporary-runtime-secret",
    });

    settings.clearUnifiedAiSecrets();

    expect(settings.loadOpenAiCompatibleSettings().apiKey).toBe("");
    expect(settings.getUnifiedAiAuxSettings()).toEqual(
      settings.DEFAULT_UNIFIED_AI_AUX_SETTINGS,
    );
    expect(sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUX_KEY)).toBeNull();
  });
});
