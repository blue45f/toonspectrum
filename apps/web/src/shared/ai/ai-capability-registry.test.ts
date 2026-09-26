import { describe, expect, it } from "vitest";

import { buildAiCapabilityRegistry } from "./ai-capability-registry";

const BASE = {
  managedText: "unavailable" as const,
  userText: false,
  userImage: false,
  userInference: false,
  userThreeD: false,
  hyper3d: false,
  externalRuntime: false,
  creatorPaidExecution: "disabled" as const,
  voiceProvider: false,
  soundEffectProvider: false,
  music: "disabled" as const,
};

describe("AI capability registry", () => {
  it("separates local smart tools from generative AI", () => {
    const registry = buildAiCapabilityRegistry(BASE);
    const smartTools = registry.find((item) => item.id === "smart-tools");
    expect(smartTools).toMatchObject({
      availability: "local",
      execution: "local-device",
      billing: "none",
      generative: false,
    });
  });

  it("reports function-level readiness independently", () => {
    const registry = buildAiCapabilityRegistry({
      ...BASE,
      managedText: "ready",
      userImage: true,
      hyper3d: true,
      externalRuntime: true,
      creatorPaidExecution: "ready",
      voiceProvider: true,
      soundEffectProvider: true,
      music: "ready",
    });
    expect(registry.find((item) => item.id === "text")?.availability).toBe("ready");
    expect(registry.find((item) => item.id === "image")?.availability).toBe("ready");
    expect(registry.find((item) => item.id === "three-d")?.availability).toBe("ready");
    expect(registry.find((item) => item.id === "external-runtime")?.releaseChannel).toBe(
      "developer-preview",
    );
  });
});
