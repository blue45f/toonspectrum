import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);

describe("Vercel Git deployment policy", () => {
  it("disables every Git-triggered deployment, including main", () => {
    expect(config.ignoreCommand).toBeUndefined();
    expect(config.git?.deploymentEnabled).toEqual({
      "**": false,
    });
    expect(Object.values(config.git?.deploymentEnabled ?? {})).not.toContain(true);
  });
});
