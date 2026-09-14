import { describe, expect, it } from "vitest";

import {
  inspectStudioImmersiveCapabilities,
  studioImmersiveSupportLabel,
  type StudioImmersiveCapabilityScope,
} from "./studio-immersive-capabilities";

function localFileConstructors() {
  return {
    File: class TestFile {},
    FileReader: class TestFileReader {},
    URL: { createObjectURL: () => "blob:test" },
  };
}

describe("inspectStudioImmersiveCapabilities", () => {
  it("reports an immersive-ready secure browser without requesting a session", async () => {
    const requestedModes: string[] = [];
    const scope: StudioImmersiveCapabilityScope = {
      isSecureContext: true,
      location: { href: "https://example.test/studio/immersive" },
      navigator: {
        userAgent: "Mozilla/5.0 Chrome/140 Safari/537.36",
        maxTouchPoints: 5,
        gpu: {},
        xr: {
          async isSessionSupported(mode) {
            requestedModes.push(mode);
            return mode === "immersive-ar";
          },
        },
        storage: { persisted: async () => true },
      },
      document: { createElement: () => ({ getContext: () => ({}) }) },
      ...localFileConstructors(),
    };

    const result = await inspectStudioImmersiveCapabilities(scope);

    expect(requestedModes).toEqual(["immersive-ar", "immersive-vr"]);
    expect(result).toMatchObject({
      readiness: "ready",
      secureContext: true,
      webgl2: "supported",
      webgpu: "supported",
      webxr: "supported",
      immersiveAr: "supported",
      immersiveVr: "unsupported",
      localFiles: "supported",
      storageApi: "supported",
      storagePersisted: true,
      touchPoints: 5,
    });
    expect(result.inAppBrowser.inApp).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("keeps a complete fallback diagnosis for insecure and non-XR contexts", async () => {
    const result = await inspectStudioImmersiveCapabilities({
      isSecureContext: false,
      navigator: { userAgent: "Mozilla/5.0 Safari/605.1.15" },
      document: { createElement: () => ({ getContext: () => ({}) }) },
      ...localFileConstructors(),
    });
    expect(result.readiness).toBe("fallback");
    expect(result.immersiveAr).toBe("unsupported");
    expect(result.immersiveVr).toBe("unsupported");
    expect(result.warnings).toEqual(expect.arrayContaining([
      "secure-context-required",
      "immersive-session-unavailable",
    ]));
  });

  it("fails conservatively when embedded browser capability probes throw", async () => {
    const result = await inspectStudioImmersiveCapabilities({
      isSecureContext: true,
      location: { href: "https://example.test/studio/immersive" },
      navigator: {
        userAgent: "Mozilla/5.0 (Linux; Android 15; wv) Instagram 370.0",
        xr: { isSessionSupported: async () => { throw new Error("blocked"); } },
        storage: { persisted: async () => { throw new Error("blocked"); } },
      },
      document: { createElement: () => ({ getContext: () => { throw new Error("blocked"); } }) },
      ...localFileConstructors(),
    });

    expect(result.readiness).toBe("fallback");
    expect(result.webgl2).toBe("unknown");
    expect(result.immersiveAr).toBe("unknown");
    expect(result.immersiveVr).toBe("unknown");
    expect(result.storageApi).toBe("unknown");
    expect(result.inAppBrowser).toMatchObject({ inApp: true, id: "instagram" });
    expect(result.warnings).toContain("in-app-browser-limited");
  });
});
describe("studioImmersiveSupportLabel", () => {
  it("provides localized, non-ambiguous labels", () => {
    expect(studioImmersiveSupportLabel("supported", "ko")).toBe("사용 가능");
    expect(studioImmersiveSupportLabel("unsupported", "en")).toBe("Unavailable");
    expect(studioImmersiveSupportLabel("unknown", "ko")).toBe("확인 필요");
  });
});
