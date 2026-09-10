import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  new URL("./StudioAiComicDirectorPanel.tsx", import.meta.url),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("./studio-ai-comic-director-session.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../studio-router/routes/StudioAiComicDirectorRoute.tsx", import.meta.url),
  "utf8",
);

describe("Studio AI comic identifier security boundary", () => {
  it("routes every comic-director identifier through the secure shared factory", () => {
    for (const source of [panelSource, sessionSource, routeSource]) {
      expect(source).toContain("createStudioAiComicDirectorId");
      expect(source).not.toContain("Math.random");
    }
  });
});
