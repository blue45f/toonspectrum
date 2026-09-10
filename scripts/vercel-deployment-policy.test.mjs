import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);

describe("Vercel Git deployment policy", () => {
  it("creates Git deployments only for main, including slash-named branches", () => {
    expect(config.ignoreCommand).toBeUndefined();
    expect(config.git?.deploymentEnabled).toEqual({
      "**": false,
      main: true,
    });
  });
});
