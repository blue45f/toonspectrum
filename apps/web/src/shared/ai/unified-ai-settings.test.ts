// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const AUX_KEY = "toonspectrum-unified-ai-aux-v1";
const LEGACY_KEY = "toonspectrum-studio-ai-settings";
const HYPER3D_FIXTURE = "fixture-hyper3d-value";
const RUNTIME_FIXTURE = "fixture-runtime-value";

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

describe("unified AI secret storage", () => {
  it("keeps auxiliary credentials in memory only", async () => {
    const module = await import("./unified-ai-settings");
    module.saveUnifiedAiAuxSettings({
      version: 1,
      hyper3dApiKey: HYPER3D_FIXTURE,
      creatorRuntimeBaseUrl: "https://runtime.example.com",
      creatorRuntimeToken: RUNTIME_FIXTURE,
      creatorRuntimeOwner: "creator-device",
    });

    expect(module.getUnifiedAiAuxSettings()).toMatchObject({
      hyper3dApiKey: HYPER3D_FIXTURE,
      creatorRuntimeToken: RUNTIME_FIXTURE,
    });
    const persisted = sessionStorage.getItem(AUX_KEY) ?? "";
    expect(persisted).toContain("https://runtime.example.com");
    expect(persisted).not.toContain(HYPER3D_FIXTURE);
    expect(persisted).not.toContain(RUNTIME_FIXTURE);
  });

  it("locks volatile credentials on page lifecycle boundaries", async () => {
    const module = await import("./unified-ai-settings");
    module.saveUnifiedAiAuxSettings({
      version: 1,
      hyper3dApiKey: HYPER3D_FIXTURE,
      creatorRuntimeBaseUrl: "https://runtime.example.com",
      creatorRuntimeToken: RUNTIME_FIXTURE,
      creatorRuntimeOwner: "creator-device",
    });

    globalThis.dispatchEvent(new Event("pagehide"));

    expect(module.getUnifiedAiAuxSettings()).toMatchObject({
      hyper3dApiKey: "",
      creatorRuntimeToken: "",
      creatorRuntimeBaseUrl: "https://runtime.example.com",
      creatorRuntimeOwner: "creator-device",
    });
  });

  it("migrates previously persisted credentials into memory and scrubs storage", async () => {
    sessionStorage.setItem(AUX_KEY, JSON.stringify({
      version: 1,
      hyper3dApiKey: HYPER3D_FIXTURE,
      creatorRuntimeBaseUrl: "https://runtime.example.com",
      creatorRuntimeToken: RUNTIME_FIXTURE,
      creatorRuntimeOwner: "creator-device",
    }));
    sessionStorage.setItem(LEGACY_KEY, JSON.stringify({
      apiKey: "fixture-legacy-value",
      baseUrl: "https://openrouter.ai/api/v1",
    }));

    const module = await import("./unified-ai-settings");

    expect(module.getUnifiedAiAuxSettings().hyper3dApiKey).toBe(HYPER3D_FIXTURE);
    expect(module.loadOpenAiCompatibleSettings().apiKey).toBe("fixture-legacy-value");
    expect(sessionStorage.getItem(AUX_KEY)).not.toContain(HYPER3D_FIXTURE);
    expect(sessionStorage.getItem(AUX_KEY)).not.toContain(RUNTIME_FIXTURE);
    expect(sessionStorage.getItem(LEGACY_KEY)).not.toContain("fixture-legacy-value");
  });
});
