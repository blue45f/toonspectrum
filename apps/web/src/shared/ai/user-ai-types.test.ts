import { describe, expect, it } from "vitest";

import { normalizeUserAiConfiguration, validateUserAiPath } from "./user-ai-types";

const connection = {
  id: "personal", label: "내 연결", baseUrl: "https://api.example.com/v1", apiKey: "secret-key",
  textModel: "text-model", imageModel: "image-model", imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits", chatCompletionsPath: "/chat/completions",
};

describe("unified user AI configuration", () => {
  it("normalizes one connection and capability assignments", () => {
    expect(normalizeUserAiConfiguration({ version: 1, connections: [connection], assignments: {
      text: "personal", image: "personal", inference: null, "three-d": null,
    } })).toEqual({ version: 1, connections: [connection], assignments: {
      text: "personal", image: "personal", inference: null, "three-d": null,
    } });
  });

  it("rejects dangling assignments and unsafe paths", () => {
    expect(() => normalizeUserAiConfiguration({ version: 1, connections: [connection], assignments: {
      text: "missing", image: null, inference: null, "three-d": null,
    } })).toThrow(/연결 대상/u);
    expect(() => validateUserAiPath("/jobs/../admin")).toThrow(/상대 경로/u);
    expect(() => validateUserAiPath("//other.example/path")).toThrow(/상대 경로/u);
  });
});
