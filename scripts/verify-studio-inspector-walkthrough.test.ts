import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const walkthroughSource = readFileSync(
  new URL("./verify-studio-inspector-walkthrough.mts", import.meta.url),
  "utf8",
);

describe("Studio Inspector walkthrough verdicts", () => {
  it("fails the brush-size preset row when the visible preset does not apply", () => {
    expect(walkthroughSource).toMatch(
      /verdict:\s*presetVisible\s*&&\s*sizeApplied\s*\?\s*"reachable"\s*:\s*"blocked"/u,
    );
    expect(walkthroughSource).not.toMatch(
      /verdict:\s*presetVisible\s*\?\s*"reachable"\s*:\s*"blocked"/u,
    );
  });
});
