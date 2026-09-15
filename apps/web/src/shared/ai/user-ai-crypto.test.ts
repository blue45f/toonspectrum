import { describe, expect, it } from "vitest";

import { decryptUserAiVault, encryptUserAiVault } from "./user-ai-crypto";

const configuration = {
  version: 1 as const,
  connections: [{
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
  }],
  assignments: {
    text: "personal",
    image: "personal",
    inference: null,
    "three-d": null,
  },
};

describe("encrypted user AI vault", () => {
  it("round-trips credentials and the free-only policy without storing the passphrase", async () => {
    const encrypted = await encryptUserAiVault(
      configuration,
      "correct horse battery staple",
    );
    expect(encrypted).not.toContain("secret-key");
    expect(encrypted).not.toContain("correct horse battery staple");
    await expect(decryptUserAiVault(
      encrypted,
      "correct horse battery staple",
    )).resolves.toEqual(configuration);
  });

  it("fails closed for a wrong password", async () => {
    const encrypted = await encryptUserAiVault(
      configuration,
      "correct horse battery staple",
    );
    await expect(decryptUserAiVault(
      encrypted,
      "another password value",
    )).rejects.toThrow(/비밀번호/u);
  });
});
