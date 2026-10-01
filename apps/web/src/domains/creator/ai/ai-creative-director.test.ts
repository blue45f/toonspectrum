import { describe, expect, it } from "vitest";

import {
  AI_DIRECTOR_INPUT_LIMIT,
  AI_DIRECTOR_SUGGESTIONS,
  buildAiDirectorRequest,
  findAiDirectorSuggestion,
  resolveAiDirectorAvailability,
} from "./ai-creative-director";
import { AI_STUDIO_SURFACES, aiStudioSurface } from "./ai-studio-hub";

import type { StudioServerAiStatus } from "../studio-server-ai-client";

function status(overrides: Partial<StudioServerAiStatus> = {}): StudioServerAiStatus {
  return {
    configured: true,
    provider: "gemini",
    model: "gemini-flash",
    providers: [],
    selection: { default: "auto", order: [], fallback: false },
    capabilities: [],
    requiresAuth: true,
    ...overrides,
  };
}

describe("AI creative director suggestions", () => {
  it("offers the five reference suggestions with real tool fallbacks", () => {
    expect(AI_DIRECTOR_SUGGESTIONS.map((suggestion) => suggestion.id)).toEqual([
      "story-expand",
      "character-analysis",
      "scene-composition",
      "direction-style",
      "localize",
    ]);
    for (const suggestion of AI_DIRECTOR_SUGGESTIONS) {
      expect(suggestion.tool.href.startsWith("/")).toBe(true);
      expect(suggestion.title.ko.length).toBeGreaterThan(2);
      expect(suggestion.title.en.length).toBeGreaterThan(2);
      expect(suggestion.example.ko).not.toBe(suggestion.placeholder.ko);
    }
    expect(findAiDirectorSuggestion("localize")?.task).toBe("translation");
    expect(findAiDirectorSuggestion("unknown")).toBeUndefined();
  });

  it("does not build a request for empty input", () => {
    expect(buildAiDirectorRequest("story-expand", "   \n  ", "ko")).toBeNull();
  });

  it("builds a bounded request that answers in the interface language", () => {
    const korean = buildAiDirectorRequest("scene-composition", "  옥상   고백 장면 ", "ko");
    expect(korean?.task).toBe("composition");
    expect(korean?.system).toContain("Answer in Korean.");
    expect(korean?.system).toContain("Never imitate existing copyrighted works");
    expect(korean?.user).toBe("Request: Suggest a composition\nArtist input:\n옥상 고백 장면");

    const english = buildAiDirectorRequest("story-expand", "x".repeat(AI_DIRECTOR_INPUT_LIMIT + 50), "en-US");
    expect(english?.system).toContain("Answer in English.");
    expect(english?.user.endsWith("x".repeat(AI_DIRECTOR_INPUT_LIMIT))).toBe(true);
    expect(english?.user).not.toContain("x".repeat(AI_DIRECTOR_INPUT_LIMIT + 1));
  });
});

describe("AI creative director availability", () => {
  it("waits while the server status is still being checked", () => {
    expect(resolveAiDirectorAvailability({ status: null, statusFailed: false, personalRoutes: 0, signedIn: false }))
      .toEqual({ state: "checking", canSubmit: false });
  });

  it("uses the shared free pool when it is configured and the user may call it", () => {
    expect(resolveAiDirectorAvailability({ status: status(), statusFailed: false, personalRoutes: 0, signedIn: true }))
      .toEqual({ state: "server", canSubmit: true, model: "gemini-flash" });
    expect(resolveAiDirectorAvailability({ status: status({ requiresAuth: false }), statusFailed: false, personalRoutes: 0, signedIn: false }).state)
      .toBe("server");
  });

  it("asks guests to sign in unless they connected a personal free key", () => {
    expect(resolveAiDirectorAvailability({ status: status(), statusFailed: false, personalRoutes: 0, signedIn: false }))
      .toEqual({ state: "login", canSubmit: false });
    expect(resolveAiDirectorAvailability({ status: status(), statusFailed: false, personalRoutes: 1, signedIn: false }))
      .toEqual({ state: "personal", canSubmit: true });
  });

  it("blocks requests instead of inventing answers when nothing is connected", () => {
    expect(resolveAiDirectorAvailability({ status: null, statusFailed: true, personalRoutes: 0, signedIn: true }))
      .toEqual({ state: "unavailable", canSubmit: false });
    expect(resolveAiDirectorAvailability({ status: status({ configured: false }), statusFailed: false, personalRoutes: 0, signedIn: true }).canSubmit)
      .toBe(false);
    expect(resolveAiDirectorAvailability({ status: null, statusFailed: true, personalRoutes: 2, signedIn: false }).state)
      .toBe("personal");
  });
});

describe("AI studio surfaces", () => {
  it("describes cost, key, data and output for every AI entry", () => {
    expect(AI_STUDIO_SURFACES.map((surface) => surface.id)).toEqual(["director", "generate", "runtime", "settings"]);
    for (const surface of AI_STUDIO_SURFACES) {
      expect(surface.conditions.map((condition) => condition.kind)).toEqual(["cost", "key", "data", "output"]);
      expect(surface.href.startsWith("/")).toBe(true);
    }
    expect(aiStudioSurface("runtime").href).toBe("/studio/ai-lab#ai-runtime");
  });
});
