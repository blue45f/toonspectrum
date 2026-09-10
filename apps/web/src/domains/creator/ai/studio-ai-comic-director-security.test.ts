import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ID_CONSUMERS = [
  "./studio-ai-comic-director-session.ts",
  "./StudioAiComicDirectorPanel.tsx",
  "../studio-router/routes/StudioAiComicDirectorRoute.tsx",
] as const;

describe("AI Comic Director identifier security", () => {
  it("uses the shared Web Crypto issuer at every client-side ID boundary", () => {
    for (const relativePath of ID_CONSUMERS) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source, relativePath).toContain("createSecureRandomUuid");
      expect(source, relativePath).not.toContain("Math.random");
    }
  });

  it("keeps the API client free from insecure randomness", () => {
    const source = readFileSync(
      new URL("./studio-ai-comic-director-api.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("Math.random");
  });
});
