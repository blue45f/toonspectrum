import { describe, expect, it } from "vitest";

import {
  normalizeUserAiConfiguration,
  validateUserAiPath,
} from "./user-ai-types";

const connection = {
  id: "personal",
  label: "내 연결",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "secret-key",
  textModel: "text-model",
  imageModel: "image-model",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  costPolicy: "provider-free-tier" as const,
};

describe("unified user AI configuration", () => {
  it("normalizes one connection and capability assignments", () => {
    expect(normalizeUserAiConfiguration({
      version: 1,
      connections: [connection],
      assignments: {
        text: "personal",
        image: "personal",
        inference: null,
        "three-d": null,
      },
    })).toEqual({
      version: 1,
      connections: [connection],
      assignments: {
        text: "personal",
        image: "personal",
        inference: null,
        "three-d": null,
      },
    });
  });

  it("allows a keyless local connection", () => {
    const local = {
      ...connection,
      id: "local",
      baseUrl: "http://localhost:8082/v1",
      apiKey: "",
      costPolicy: "local-zero-cost" as const,
    };
    const normalized = normalizeUserAiConfiguration({
      version: 1,
      connections: [local],
      assignments: {
        text: "local",
        image: null,
        inference: null,
        "three-d": null,
      },
    });
    expect(normalized.connections[0]).toEqual(local);
  });

  it("marks ambiguous legacy remote settings as unverified", () => {
    const { costPolicy: _costPolicy, ...legacy } = connection;
    const normalized = normalizeUserAiConfiguration({
      version: 1,
      connections: [{
        ...legacy,
        baseUrl: "https://api.openai.com/v1",
      }],
      assignments: {
        text: "personal",
        image: null,
        inference: null,
        "three-d": null,
      },
    });
    expect(normalized.connections[0]?.costPolicy).toBe("unverified");
  });

  it("rejects dangling assignments and unsafe paths", () => {
    expect(() => normalizeUserAiConfiguration({
      version: 1,
      connections: [connection],
      assignments: {
        text: "missing",
        image: null,
        inference: null,
        "three-d": null,
      },
    })).toThrow(/연결 대상/u);
    expect(() => validateUserAiPath("/jobs/../admin")).toThrow(/상대 경로/u);
    expect(() => validateUserAiPath("//other.example/path")).toThrow(/상대 경로/u);
  });
});
